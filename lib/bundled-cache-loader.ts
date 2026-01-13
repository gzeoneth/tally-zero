/**
 * Gov-tracker Bundled Cache Loader
 *
 * Loads proposals from the gov-tracker bundled cache for faster startup.
 * The bundled cache contains pre-tracked proposal checkpoints with all
 * lifecycle stages, eliminating the need for initial RPC discovery.
 */

import {
  ARBITRUM_CHAIN_ID,
  CORE_GOVERNOR,
  TREASURY_GOVERNOR,
} from "@/config/arbitrum-governance";
import { STORAGE_KEYS } from "@/config/storage-keys";
import type { ParsedProposal, ProposalStateName } from "@/types/proposal";
import type {
  CacheAdapter,
  ElectionProposalStatus,
  GovernorTrackingInput,
  ProposalCreatedData,
  ProposalQueuedData,
  TrackingCheckpoint,
  VotingActiveData,
} from "@gzeoneth/gov-tracker";

import { debug } from "./debug";
import { getStoredValue } from "./storage-utils";

type BundledCache = Record<string, TrackingCheckpoint>;

/** Governor address to name mapping */
const GOVERNOR_NAMES: Record<string, string> = {
  [CORE_GOVERNOR.address.toLowerCase()]: CORE_GOVERNOR.name,
  [TREASURY_GOVERNOR.address.toLowerCase()]: TREASURY_GOVERNOR.name,
};

const STATE_MAP: Record<string, ProposalStateName> = {
  pending: "Pending",
  active: "Active",
  canceled: "Canceled",
  defeated: "Defeated",
  succeeded: "Succeeded",
  queued: "Queued",
  expired: "Expired",
  executed: "Executed",
};

function mapProposalState(votingData: VotingActiveData): ProposalStateName {
  const state = votingData.proposalState;
  if (!state) return "Active";
  return STATE_MAP[state.toLowerCase()] ?? "Active";
}

/** Extract ParsedProposal from a TrackingCheckpoint */
function extractProposal(
  checkpoint: TrackingCheckpoint
): ParsedProposal | null {
  if (checkpoint.input.type !== "governor") {
    return null;
  }

  const input = checkpoint.input as GovernorTrackingInput;
  const stages = checkpoint.cachedData.completedStages ?? [];

  const proposalCreatedStage = stages.find(
    (s) => s.type === "PROPOSAL_CREATED"
  );
  if (!proposalCreatedStage) {
    return null;
  }

  const proposalData = proposalCreatedStage.data as ProposalCreatedData;
  const votingStage = stages.find((s) => s.type === "VOTING_ACTIVE");
  const votingData = votingStage?.data as VotingActiveData | undefined;
  const queuedStage = stages.find((s) => s.type === "PROPOSAL_QUEUED");
  const queuedData = queuedStage?.data as ProposalQueuedData | undefined;

  const governorAddress = input.governorAddress.toLowerCase();
  const governorName = GOVERNOR_NAMES[governorAddress] ?? "Unknown Governor";

  let state: ProposalStateName = "Active";
  if (votingData) {
    state = mapProposalState(votingData);
  }

  const proposal: ParsedProposal = {
    id: input.proposalId,
    contractAddress: input.governorAddress as `0x${string}`,
    proposer: proposalData.proposer,
    targets: proposalData.targets ?? [],
    values: proposalData.values ?? [],
    signatures: proposalData.signatures ?? [],
    calldatas: proposalData.calldatas ?? [],
    startBlock: proposalData.startBlock,
    endBlock: proposalData.endBlock,
    description: proposalData.description,
    networkId: String(ARBITRUM_CHAIN_ID),
    state,
    governorName,
    creationTxHash: input.creationTxHash,
    stages,
    stagesTrackedAt: new Date(checkpoint.createdAt).toISOString(),
  };

  if (votingData) {
    proposal.votes = {
      forVotes: votingData.forVotesRaw,
      againstVotes: votingData.againstVotesRaw,
      abstainVotes: votingData.abstainVotesRaw,
      quorum: votingData.quorumRaw,
    };
  }

  if (queuedData?.timelockAddress && queuedData?.operationId && queuedStage) {
    const queueTx = queuedStage.transactions[0];
    proposal.timelockLink = {
      timelockAddress: queuedData.timelockAddress,
      operationId: queuedData.operationId,
      txHash: queueTx?.hash ?? "",
      queueBlockNumber: queueTx?.blockNumber ?? 0,
    };
  }

  return proposal;
}

/** Cached proposals extracted from bundled cache */
let cachedProposals: ParsedProposal[] | null = null;
let cacheMetadata: { snapshotBlock: number; count: number } | null = null;
let bundledCacheData: BundledCache | null = null;

/**
 * Load the bundled cache data (lazy initialization)
 */
async function loadBundledCache(): Promise<BundledCache> {
  if (bundledCacheData !== null) {
    return bundledCacheData;
  }

  try {
    // Use the package's exported bundled-cache.json path
    const cacheModule = await import(
      "@gzeoneth/gov-tracker/bundled-cache.json"
    );
    bundledCacheData = cacheModule.default as BundledCache;
    return bundledCacheData;
  } catch {
    debug.cache("Failed to load bundled cache");
    bundledCacheData = {};
    return bundledCacheData;
  }
}

/**
 * Get proposals from the gov-tracker bundled cache
 *
 * @returns Array of proposals extracted from the bundled cache
 */
export async function getBundledCacheProposals(): Promise<ParsedProposal[]> {
  if (cachedProposals !== null) {
    return cachedProposals;
  }

  const bundledCache = await loadBundledCache();
  const proposals: ParsedProposal[] = [];
  let maxBlock = 0;

  for (const [key, checkpoint] of Object.entries(bundledCache)) {
    if (!key.startsWith("tx:")) continue;

    const proposal = extractProposal(checkpoint);
    if (proposal) {
      proposals.push(proposal);
      const startBlock = parseInt(proposal.startBlock, 10);
      if (startBlock > maxBlock) {
        maxBlock = startBlock;
      }
    }
  }

  cachedProposals = proposals;
  cacheMetadata = { snapshotBlock: maxBlock, count: proposals.length };

  debug.cache(
    "Extracted %d proposals from bundled cache, max block: %d",
    proposals.length,
    maxBlock
  );

  return proposals;
}

/**
 * Get bundled cache metadata
 *
 * @returns Metadata about the bundled cache
 */
export async function getBundledCacheMetadata(): Promise<{
  snapshotBlock: number;
  count: number;
} | null> {
  if (cacheMetadata === null) {
    await getBundledCacheProposals();
  }
  return cacheMetadata;
}

// ============================================================================
// Cache Adapter Initialization (for stage tracking)
// ============================================================================

let bundledCacheInitialized = false;

/**
 * Initialize the cache adapter with bundled cache data
 *
 * This seeds the cache adapter (e.g., LocalStorageCache) with checkpoints
 * from the bundled cache for zero-RPC resume of stage tracking.
 */
export async function initializeBundledCache(
  cache: CacheAdapter
): Promise<void> {
  if (bundledCacheInitialized) {
    return;
  }

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
    const existingKeys = await cache.keys();
    const keyCount = Array.isArray(existingKeys)
      ? existingKeys.length
      : Array.from(existingKeys).length;

    if (keyCount > 0) {
      debug.cache("cache already initialized with %d checkpoints", keyCount);
      bundledCacheInitialized = true;
      return;
    }

    const bundledCache = await loadBundledCache();

    let count = 0;
    for (const [key, checkpoint] of Object.entries(bundledCache)) {
      await cache.set(key, checkpoint);
      count++;
    }

    debug.cache("initialized cache with %d bundled checkpoints", count);
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
  cachedProposals = null;
  cacheMetadata = null;
  bundledCacheData = null;
  cachedElections = null;
}

// ============================================================================
// Election Cache Loading
// ============================================================================

let cachedElections: ElectionProposalStatus[] | null = null;

/**
 * Get election data from the gov-tracker bundled cache
 *
 * @returns Array of election statuses extracted from the bundled cache
 */
export async function getBundledCacheElections(): Promise<
  ElectionProposalStatus[]
> {
  if (cachedElections !== null) {
    return cachedElections;
  }

  const bundledCache = await loadBundledCache();
  const elections: ElectionProposalStatus[] = [];

  for (const [key, checkpoint] of Object.entries(bundledCache)) {
    if (!key.startsWith("election:")) continue;

    if (
      checkpoint.input.type === "election" &&
      checkpoint.cachedData.electionStatus
    ) {
      elections.push(checkpoint.cachedData.electionStatus);
    }
  }

  // Sort by election index
  elections.sort((a, b) => a.electionIndex - b.electionIndex);

  cachedElections = elections;
  debug.cache("Extracted %d elections from bundled cache", elections.length);

  return elections;
}
