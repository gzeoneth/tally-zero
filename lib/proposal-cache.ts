import { STORAGE_KEYS } from "@/config/storage-keys";
import type { ParsedProposal } from "@/types/proposal";
import { formatCacheAge } from "./format-utils";
import { seedStagesFromProposal } from "./stages-cache";
import { getStoredValue } from "./storage-utils";

// Re-export stages cache functions for convenience
export {
  getPreloadedStages,
  hasPreloadedStages,
  seedStagesFromProposal,
} from "./stages-cache";

function getSkipPreloadCacheSetting(): boolean {
  return (
    getStoredValue<boolean>(STORAGE_KEYS.SKIP_PRELOAD_CACHE, false) === true
  );
}

export interface ProposalCache {
  version: number;
  generatedAt: string;
  snapshotBlock: number;
  startBlock: number;
  chainId: number;
  proposals: ParsedProposal[];
  governorStats: {
    [address: string]: {
      name: string;
      proposalCount: number;
    };
  };
}

export const CURRENT_CACHE_VERSION = 1;

const FINALIZED_STATES = new Set([
  "canceled",
  "defeated",
  "succeeded",
  "queued",
  "expired",
  "executed",
]);

export function isProposalFinalized(state: string): boolean {
  return FINALIZED_STATES.has(state.toLowerCase());
}

export function needsStateRefresh(state: string): boolean {
  const lowerState = state.toLowerCase();
  return lowerState === "pending" || lowerState === "active";
}

let staticCacheData: ProposalCache | null = null;
try {
  staticCacheData = require("@data/proposal-cache.json") as ProposalCache;
} catch {
  staticCacheData = null;
}

let validatedCacheData: ProposalCache | null = null;
let cacheValidated = false;
let stagesSeeded = false;

export async function loadProposalCache(): Promise<ProposalCache | null> {
  if (getSkipPreloadCacheSetting()) {
    console.debug("[proposal-cache] Skipping preload cache (setting enabled)");
    return null;
  }

  if (cacheValidated) {
    if (validatedCacheData && !stagesSeeded) {
      seedAllStagesFromCache(validatedCacheData);
      stagesSeeded = true;
    }
    return validatedCacheData;
  }

  cacheValidated = true;

  if (!staticCacheData) {
    console.debug(
      "[proposal-cache] Cache file not found - run 'yarn cache:build' to generate"
    );
    return null;
  }

  // Validate cache version
  if (staticCacheData.version !== CURRENT_CACHE_VERSION) {
    console.warn(
      `[proposal-cache] Cache version mismatch: expected ${CURRENT_CACHE_VERSION}, got ${staticCacheData.version}`
    );
    return null;
  }

  // Validate that proposals exist
  if (!staticCacheData.proposals || !Array.isArray(staticCacheData.proposals)) {
    console.warn(
      "[proposal-cache] Invalid cache format: missing proposals array"
    );
    return null;
  }

  validatedCacheData = staticCacheData;

  console.debug(
    `[proposal-cache] Loaded ${validatedCacheData.proposals.length} proposals from cache (block ${validatedCacheData.snapshotBlock})`
  );

  // Seed localStorage with preloaded stages
  seedAllStagesFromCache(validatedCacheData);
  stagesSeeded = true;

  return validatedCacheData;
}

export function clearCacheData(): void {
  validatedCacheData = null;
  cacheValidated = false;
  stagesSeeded = false;
}

export async function getCacheSnapshotBlock(): Promise<number> {
  const cache = await loadProposalCache();
  return cache?.snapshotBlock ?? 0;
}

export function getProposalsNeedingRefresh(
  cache: ProposalCache
): ParsedProposal[] {
  return cache.proposals.filter((p) => needsStateRefresh(p.state));
}

export function mergeProposals(
  cachedProposals: ParsedProposal[],
  freshProposals: ParsedProposal[]
): ParsedProposal[] {
  const freshMap = new Map<string, ParsedProposal>();
  for (const p of freshProposals) {
    freshMap.set(p.id, p);
  }

  const cachedIds = new Set(cachedProposals.map((p) => p.id));
  const merged: ParsedProposal[] = [];

  for (const cached of cachedProposals) {
    if (isProposalFinalized(cached.state)) {
      merged.push(cached);
    } else {
      const fresh = freshMap.get(cached.id);
      merged.push(fresh ?? cached);
    }
  }

  for (const fresh of freshProposals) {
    if (!cachedIds.has(fresh.id)) {
      merged.push(fresh);
    }
  }

  return merged;
}

export function sortProposals(proposals: ParsedProposal[]): ParsedProposal[] {
  return [...proposals].sort((a, b) => {
    if (a.state === "Active" && b.state !== "Active") return -1;
    if (a.state !== "Active" && b.state === "Active") return 1;
    return parseInt(b.startBlock) - parseInt(a.startBlock);
  });
}

export function getCacheStats(cache: ProposalCache): {
  totalProposals: number;
  snapshotBlock: number;
  generatedAt: Date;
  age: string;
  stateDistribution: Record<string, number>;
} {
  const generatedAt = new Date(cache.generatedAt);

  const stateDistribution: Record<string, number> = {};
  for (const p of cache.proposals) {
    stateDistribution[p.state] = (stateDistribution[p.state] || 0) + 1;
  }

  return {
    totalProposals: cache.proposals.length,
    snapshotBlock: cache.snapshotBlock,
    generatedAt,
    age: formatCacheAge(generatedAt),
    stateDistribution,
  };
}

export function seedAllStagesFromCache(cache: ProposalCache): number {
  if (typeof window === "undefined") return 0;

  if (getSkipPreloadCacheSetting()) {
    console.debug("[proposal-cache] Skipping stages seeding (setting enabled)");
    return 0;
  }

  let seededCount = 0;
  for (const proposal of cache.proposals) {
    if (seedStagesFromProposal(proposal)) {
      seededCount++;
    }
  }

  if (seededCount > 0) {
    console.debug(
      `[proposal-cache] Seeded ${seededCount} proposals with preloaded stages`
    );
  }

  return seededCount;
}
