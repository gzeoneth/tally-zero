/**
 * Gov-tracker cache integration for TallyZero
 *
 * Uses gov-tracker's LocalStorageCache with TallyZero's prefix
 * for caching TrackingCheckpoints in localStorage.
 */

import { STORAGE_KEYS } from "@/config/storage-keys";
import {
  LocalStorageCache,
  txHashCacheKey,
  type CacheAdapter,
  type TrackedStage,
  type TrackingCheckpoint,
} from "@gzeoneth/gov-tracker";
import { debug } from "./debug";

// Re-export txHashCacheKey for external use
export { txHashCacheKey };

/**
 * Singleton LocalStorageCache instance with TallyZero's prefix
 */
let cacheInstance: LocalStorageCache | null = null;

/**
 * Get the shared cache adapter instance
 *
 * Uses gov-tracker's LocalStorageCache with TallyZero's checkpoint prefix.
 */
export function getCacheAdapter(): LocalStorageCache {
  if (!cacheInstance) {
    cacheInstance = new LocalStorageCache(STORAGE_KEYS.CHECKPOINT_CACHE_PREFIX);
  }
  return cacheInstance;
}

/**
 * Seed gov-tracker cache from existing tracked stages
 *
 * Converts stages to a TrackingCheckpoint and stores it,
 * enabling gov-tracker to resume from where tracking left off.
 *
 * @param cache - The cache adapter to seed
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor address
 * @param creationTxHash - The creation transaction hash
 * @param stages - The tracked stages
 */
export async function seedCheckpointFromStages(
  cache: CacheAdapter,
  proposalId: string,
  governorAddress: string,
  creationTxHash: string,
  stages: TrackedStage[]
): Promise<void> {
  if (stages.length === 0) return;

  const key = txHashCacheKey(creationTxHash);

  const lastStage = stages[stages.length - 1];
  const lastTx = lastStage.transactions[lastStage.transactions.length - 1];

  const checkpoint: TrackingCheckpoint = {
    version: 1,
    createdAt: Date.now(),
    input: {
      type: "governor",
      governorAddress,
      proposalId,
      creationTxHash,
    },
    lastProcessedStage: lastStage.type,
    lastProcessedBlock: {
      l1: 0,
      l2: lastTx?.blockNumber ?? 0,
    },
    cachedData: {
      completedStages: stages.filter((s) => s.status === "COMPLETED"),
    },
    metadata: {
      errorCount: 0,
      lastTrackedAt: Date.now(),
    },
  };

  await cache.set(key, checkpoint);
  debug.cache(
    "seeded checkpoint for %s with %d completed stages",
    proposalId,
    checkpoint.cachedData.completedStages?.length ?? 0
  );
}

/**
 * Clear gov-tracker checkpoint for a proposal
 *
 * @param cache - The cache adapter
 * @param creationTxHash - The creation transaction hash
 */
export async function clearProposalCheckpoint(
  cache: CacheAdapter,
  creationTxHash: string
): Promise<void> {
  const key = txHashCacheKey(creationTxHash);
  await cache.delete(key);
}
