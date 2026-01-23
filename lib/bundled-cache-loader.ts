import type { CacheAdapter } from "@gzeoneth/gov-tracker";

import {
  BUNDLED_CACHE_BATCH_SIZE,
  BUNDLED_CACHE_MAX_RETRIES,
  BUNDLED_CACHE_RETRY_DELAY_MS,
  CACHE_VERSION,
  STORAGE_KEYS,
} from "@/config/storage-keys";
import { findByAddress } from "@/lib/address-utils";
import { buildLookupMap } from "@/lib/collection-utils";
import type { ParsedProposal, ProposalStateName } from "@/types/proposal";
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_GOVERNORS,
} from "@config/arbitrum-governance";

import { debug } from "./debug";
import { getStoredValue, setStoredValue } from "./storage-utils";

let bundledCacheInitialized = false;
let bundledCacheInitPromise: Promise<void> | null = null;
let bundledCacheData: Record<string, unknown> | null = null;

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = BUNDLED_CACHE_MAX_RETRIES
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) =>
        setTimeout(r, BUNDLED_CACHE_RETRY_DELAY_MS * attempt)
      );
    }
  }
  throw new Error("Unreachable");
}

async function loadBundledCache(): Promise<Record<string, unknown>> {
  if (bundledCacheData) return bundledCacheData;

  const imported = await import("@gzeoneth/gov-tracker/bundled-cache.json");
  bundledCacheData = imported.default as Record<string, unknown>;
  return bundledCacheData;
}

export async function initializeBundledCache(
  cache: CacheAdapter
): Promise<void> {
  if (bundledCacheInitialized) {
    return;
  }

  // Return existing promise to prevent concurrent initialization
  if (bundledCacheInitPromise) {
    return bundledCacheInitPromise;
  }

  // Reset promise on rejection to allow retry on next call
  bundledCacheInitPromise = doInitializeBundledCache(cache).catch((err) => {
    bundledCacheInitPromise = null;
    throw err;
  });
  return bundledCacheInitPromise;
}

async function doInitializeBundledCache(cache: CacheAdapter): Promise<void> {
  const skipBundledCache = getStoredValue<boolean>(
    STORAGE_KEYS.SKIP_BUNDLED_CACHE,
    false
  );
  if (skipBundledCache) {
    debug.cache("bundled cache disabled via settings");
    bundledCacheInitialized = true;
    return;
  }

  try {
    const bundledCache = await loadBundledCache();
    const entries = Object.entries(bundledCache);

    // Check cache version for mass invalidation
    const storedVersion = getStoredValue<number>(
      STORAGE_KEYS.LAST_CACHE_VERSION,
      0
    );
    const versionMismatch = storedVersion !== CACHE_VERSION;

    if (versionMismatch) {
      debug.cache(
        "cache version mismatch (stored: %d, current: %d), clearing stale data",
        storedVersion,
        CACHE_VERSION
      );
      await cache.clear();
    }

    const existingKeys = new Set(await cache.keys());
    const newEntries = entries.filter(([key]) => !existingKeys.has(key));

    if (newEntries.length === 0) {
      debug.cache(
        "cache already has all %d bundled checkpoints",
        entries.length
      );
      if (versionMismatch) {
        setStoredValue(STORAGE_KEYS.LAST_CACHE_VERSION, CACHE_VERSION);
      }
      bundledCacheInitialized = true;
      return;
    }

    debug.cache(
      "loading %d bundled checkpoints (existing: %d)",
      newEntries.length,
      existingKeys.size
    );

    for (let i = 0; i < newEntries.length; i += BUNDLED_CACHE_BATCH_SIZE) {
      const batch = newEntries.slice(i, i + BUNDLED_CACHE_BATCH_SIZE);
      await withRetry(() =>
        Promise.all(
          batch.map(([key, checkpoint]) => cache.set(key, checkpoint))
        )
      );
    }

    setStoredValue(STORAGE_KEYS.LAST_CACHE_VERSION, CACHE_VERSION);
    debug.cache(
      "loaded %d bundled checkpoints (total: %d)",
      newEntries.length,
      existingKeys.size + newEntries.length
    );
    bundledCacheInitialized = true;
  } catch (err) {
    debug.cache(
      "bundled cache not available (expected in static builds): %O",
      err
    );
    bundledCacheInitialized = true;
  }
}

export function resetBundledCacheFlag(): void {
  bundledCacheInitialized = false;
  bundledCacheInitPromise = null;
  bundledCacheData = null;
}

/** Bundled cache watermark with L2 block */
export interface BundledCacheWatermark {
  l2Block: number;
  coreGovernorBlock: number;
  treasuryGovernorBlock: number;
}

/**
 * Get the L2 block watermark from bundled cache
 * This indicates the block up to which proposals are cached
 * Returns null if bundled cache is disabled
 */
export async function getBundledCacheWatermark(): Promise<BundledCacheWatermark | null> {
  const skipBundledCache = getStoredValue<boolean>(
    STORAGE_KEYS.SKIP_BUNDLED_CACHE,
    false
  );
  if (skipBundledCache) {
    return null;
  }

  try {
    const cache = await loadBundledCache();
    const watermarks = cache["discovery:watermarks"] as {
      lastProcessedBlock?: { l2?: number };
      cachedData?: {
        discoveryWatermarks?: {
          constitutionalGovernor?: number;
          nonConstitutionalGovernor?: number;
        };
      };
    };

    if (!watermarks?.cachedData?.discoveryWatermarks) {
      return null;
    }

    const { discoveryWatermarks } = watermarks.cachedData;
    return {
      l2Block: watermarks.lastProcessedBlock?.l2 ?? 0,
      coreGovernorBlock: discoveryWatermarks.constitutionalGovernor ?? 0,
      treasuryGovernorBlock: discoveryWatermarks.nonConstitutionalGovernor ?? 0,
    };
  } catch {
    return null;
  }
}

/** Stage data from bundled cache checkpoint */
interface BundledStageData {
  type: string;
  status: string;
  transactions?: Array<{ hash: string; blockNumber: number }>;
  data?: Record<string, unknown> & {
    proposalState?: string;
  };
}

/** Checkpoint structure from bundled cache */
interface BundledCheckpoint {
  input?: {
    type?: string;
    proposalId?: string;
    governorAddress?: string;
    creationTxHash?: string;
  };
  lastProcessedStage?: string;
  cachedData?: {
    completedStages?: BundledStageData[];
  };
}

/** Valid proposal state names (lowercase) */
const VALID_STATES = new Set([
  "pending",
  "active",
  "canceled",
  "defeated",
  "succeeded",
  "queued",
  "expired",
  "executed",
]);

/**
 * Extract proposal state from gov-tracker stage data.
 * Gov-tracker 0.3.0+ provides proposalState directly in stage data.
 */
function extractProposalState(
  stages: BundledStageData[],
  lastStage: string | undefined
): ProposalStateName {
  if (!lastStage) return "Pending";

  // Find the stage that should have proposalState
  // For PROPOSAL_QUEUED, check the queued stage; for VOTING_ACTIVE, check voting stage
  const relevantStage = stages.find((s) => s.type === lastStage);
  const proposalState = relevantStage?.data?.proposalState;

  if (proposalState) {
    const normalized = proposalState.toLowerCase() as ProposalStateName;
    if (VALID_STATES.has(normalized)) {
      return normalized;
    }
  }

  // Fallback: infer state from stage type and status
  if (lastStage === "VOTING_ACTIVE") {
    const votingStatus = relevantStage?.status;
    if (votingStatus === "FAILED") return "Defeated";
    if (votingStatus === "COMPLETED") return "Succeeded";
    return "Active";
  }

  if (lastStage === "PROPOSAL_CREATED") return "Pending";

  // Post-voting stages indicate queued or executed
  const postVotingStages = [
    "PROPOSAL_QUEUED",
    "L2_TIMELOCK_QUEUED",
    "L2_TIMELOCK_EXECUTED",
    "L2_TO_L1_MESSAGE",
    "L1_TIMELOCK_QUEUED",
    "L1_TIMELOCK_EXECUTED",
    "RETRYABLE_CREATED",
  ];
  if (postVotingStages.includes(lastStage)) return "Queued";

  if (lastStage === "RETRYABLE_EXECUTED") return "Executed";

  return "Pending";
}

/**
 * Extract full proposal data directly from bundled cache
 * Returns ParsedProposal objects without any RPC calls
 * Respects the skipBundledCache setting
 */
export async function extractProposalsFromBundledCache(): Promise<{
  proposals: ParsedProposal[];
  activeProposalIds: Set<string>;
}> {
  const proposals: ParsedProposal[] = [];
  const activeProposalIds = new Set<string>();

  const skipBundledCache = getStoredValue<boolean>(
    STORAGE_KEYS.SKIP_BUNDLED_CACHE,
    false
  );
  if (skipBundledCache) {
    debug.cache("skipping bundled cache extraction (disabled via settings)");
    return { proposals, activeProposalIds };
  }

  try {
    const cache = await loadBundledCache();

    for (const [key, value] of Object.entries(cache)) {
      if (!key.startsWith("tx:")) continue;

      const checkpoint = value as BundledCheckpoint;
      if (checkpoint.input?.type !== "governor") continue;

      const { proposalId, governorAddress, creationTxHash } = checkpoint.input;
      if (!proposalId || !governorAddress) continue;

      const stages = checkpoint.cachedData?.completedStages ?? [];
      // Build a Map for O(1) lookups instead of repeated O(n) find() calls
      const stageMap = buildLookupMap(stages, (s) => s.type);
      const createdStage = stageMap.get("PROPOSAL_CREATED");
      const votingStage = stageMap.get("VOTING_ACTIVE");

      if (!createdStage?.data) continue;

      const data = createdStage.data;
      const voteData = votingStage?.data;

      const state = extractProposalState(stages, checkpoint.lastProcessedStage);

      // Track active proposals that need refresh
      if (state === "Pending" || state === "Active") {
        activeProposalIds.add(proposalId);
      }

      const governor = findByAddress(ARBITRUM_GOVERNORS, governorAddress);

      proposals.push({
        id: proposalId,
        contractAddress: governorAddress as `0x${string}`,
        proposer: (data.proposer as string) ?? "",
        targets: (data.targets as string[]) ?? [],
        values: (data.values as string[]) ?? [],
        signatures: (data.signatures as string[]) ?? [],
        calldatas: (data.calldatas as string[]) ?? [],
        startBlock: String(data.startBlock ?? "0"),
        endBlock: String(data.endBlock ?? "0"),
        description: (data.description as string) ?? "",
        networkId: String(ARBITRUM_CHAIN_ID),
        state,
        governorName: governor?.name ?? "Unknown",
        creationTxHash: creationTxHash ?? key.slice(3),
        votes: voteData
          ? {
              forVotes: (voteData.forVotesRaw as string) ?? "0",
              againstVotes: (voteData.againstVotesRaw as string) ?? "0",
              abstainVotes: (voteData.abstainVotesRaw as string) ?? "0",
              quorum: (voteData.quorumRaw as string) ?? undefined,
            }
          : undefined,
      });
    }

    debug.cache(
      "extracted %d proposals from bundled cache (%d active)",
      proposals.length,
      activeProposalIds.size
    );
    return { proposals, activeProposalIds };
  } catch {
    return { proposals: [], activeProposalIds: new Set() };
  }
}

/**
 * Extract operation IDs from governor proposals in bundled cache
 * Returns a Set of operation IDs (lowercase) that are linked to governor proposals
 */
export async function extractOperationIdsFromBundledCache(): Promise<
  Set<string>
> {
  const operationIds = new Set<string>();

  const skipBundledCache = getStoredValue<boolean>(
    STORAGE_KEYS.SKIP_BUNDLED_CACHE,
    false
  );
  if (skipBundledCache) {
    return operationIds;
  }

  try {
    const cache = await loadBundledCache();

    for (const [key, value] of Object.entries(cache)) {
      if (!key.startsWith("tx:")) continue;

      const checkpoint = value as BundledCheckpoint;
      if (checkpoint.input?.type !== "governor") continue;

      const stages = checkpoint.cachedData?.completedStages ?? [];

      for (const stage of stages) {
        if (stage.type === "PROPOSAL_QUEUED" || stage.type === "L2_TIMELOCK") {
          const opId = stage.data?.operationId;
          if (typeof opId === "string" && opId.length > 0) {
            operationIds.add(opId.toLowerCase());
            break;
          }
        }
      }
    }

    debug.cache(
      "extracted %d operation IDs from bundled cache",
      operationIds.size
    );
    return operationIds;
  } catch {
    return new Set();
  }
}

/** Timelock operation extracted from bundled cache */
export interface BundledTimelockOp {
  operationId: string;
  timelockAddress: string;
  scheduledTxHash: string;
  queueBlock: number;
}

/**
 * Extract timelock operations from bundled cache
 * Returns timelock operations that were tracked as part of governor proposals
 */
export async function extractTimelockOpsFromBundledCache(): Promise<
  BundledTimelockOp[]
> {
  const ops: BundledTimelockOp[] = [];

  const skipBundledCache = getStoredValue<boolean>(
    STORAGE_KEYS.SKIP_BUNDLED_CACHE,
    false
  );
  if (skipBundledCache) {
    return ops;
  }

  try {
    const cache = await loadBundledCache();

    for (const [key, value] of Object.entries(cache)) {
      if (!key.startsWith("tx:")) continue;

      const checkpoint = value as BundledCheckpoint;
      if (checkpoint.input?.type !== "governor") continue;

      const stages = checkpoint.cachedData?.completedStages ?? [];

      let operationId: string | undefined;
      let timelockAddress: string | undefined;
      let queueBlock: number | undefined;
      let queueTxHash: string | undefined;

      for (const stage of stages) {
        if (stage.type === "PROPOSAL_QUEUED") {
          const data = stage.data as Record<string, unknown> | undefined;
          operationId = data?.operationId as string | undefined;
          timelockAddress = data?.timelockAddress as string | undefined;
          if (stage.transactions?.[0]) {
            queueBlock = stage.transactions[0].blockNumber;
            queueTxHash = stage.transactions[0].hash;
          }
        } else if (stage.type === "L2_TIMELOCK" && !operationId) {
          const data = stage.data as Record<string, unknown> | undefined;
          operationId = data?.operationId as string | undefined;
          timelockAddress = data?.timelockAddress as string | undefined;
          if (stage.transactions?.[0] && !queueBlock) {
            queueBlock = stage.transactions[0].blockNumber;
            queueTxHash = stage.transactions[0].hash;
          }
        }
      }

      if (operationId && timelockAddress && queueBlock && queueTxHash) {
        ops.push({
          operationId: operationId.toLowerCase(),
          timelockAddress,
          scheduledTxHash: queueTxHash,
          queueBlock,
        });
      }
    }

    debug.cache(
      "extracted %d timelock operations from bundled cache",
      ops.length
    );
    return ops;
  } catch {
    return [];
  }
}
