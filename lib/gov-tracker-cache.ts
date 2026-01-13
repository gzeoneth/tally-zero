/**
 * Gov-tracker cache integration for TallyZero
 *
 * Uses gov-tracker's built-in LocalStorageCache for all caching needs.
 * No custom adapter needed - gov-tracker handles everything.
 */

import {
  CACHE_VERSION,
  DEFAULT_CACHE_TTL_MS,
  STORAGE_KEYS,
} from "@/config/storage-keys";
import type { ProposalStage } from "@/types/proposal-stage";
import {
  LocalStorageCache,
  type CacheAdapter,
  type TrackingCheckpoint,
} from "@gzeoneth/gov-tracker";
import { isBrowser } from "./debug";

/**
 * Build gov-tracker cache key from transaction hash
 * This matches gov-tracker's internal txHashCacheKey() format
 */
export function buildTxHashCacheKey(txHash: string): string {
  return `tx:${txHash.toLowerCase()}`;
}

/**
 * Clear gov-tracker checkpoint for a proposal by tx hash
 */
export async function clearProposalCheckpoint(
  cache: CacheAdapter,
  creationTxHash: string
): Promise<void> {
  const key = buildTxHashCacheKey(creationTxHash);
  await cache.delete(key);
}

/**
 * Load checkpoint from cache by tx hash
 */
export async function loadCheckpoint(
  cache: CacheAdapter,
  creationTxHash: string
): Promise<TrackingCheckpoint | null> {
  const key = buildTxHashCacheKey(creationTxHash);
  return cache.get<TrackingCheckpoint>(key);
}

/**
 * Save checkpoint to cache by tx hash
 */
export async function saveCheckpoint(
  cache: CacheAdapter,
  creationTxHash: string,
  checkpoint: TrackingCheckpoint
): Promise<void> {
  const key = buildTxHashCacheKey(creationTxHash);
  await cache.set(key, checkpoint);
}

/**
 * Trim checkpoint stages from a specific index onwards.
 * Keeps stages before the index and removes stages at and after,
 * enabling gov-tracker to resume from where the cache was trimmed.
 *
 * @returns True if checkpoint was trimmed, false if nothing to trim
 */
export async function trimCheckpointFromStage(
  cache: CacheAdapter,
  creationTxHash: string,
  fromIndex: number
): Promise<boolean> {
  const checkpoint = await loadCheckpoint(cache, creationTxHash);
  if (!checkpoint) return false;

  const stages = checkpoint.cachedData.completedStages ?? [];
  if (stages.length === 0 || fromIndex >= stages.length) return false;

  if (fromIndex === 0) {
    await clearProposalCheckpoint(cache, creationTxHash);
    return true;
  }

  const trimmedStages = stages.slice(0, fromIndex);

  const updatedCheckpoint: TrackingCheckpoint = {
    ...checkpoint,
    createdAt: Date.now(),
    lastProcessedStage: trimmedStages[trimmedStages.length - 1]?.type ?? null,
    lastProcessedBlock: {
      ...checkpoint.lastProcessedBlock,
      l1: getMaxBlockNumber(trimmedStages, "ethereum"),
      l2: Math.max(
        getMaxBlockNumber(trimmedStages, "arb1"),
        getMaxBlockNumber(trimmedStages, "nova")
      ),
    },
    cachedData: {
      ...checkpoint.cachedData,
      completedStages: trimmedStages,
    },
  };

  await saveCheckpoint(cache, creationTxHash, updatedCheckpoint);
  return true;
}

function getMaxBlockNumber(stages: ProposalStage[], chain: string): number {
  let maxBlock = 0;
  for (const stage of stages) {
    if (stage.chain === chain && stage.transactions?.length) {
      const lastTx = stage.transactions[stage.transactions.length - 1];
      if (lastTx?.blockNumber) {
        maxBlock = Math.max(maxBlock, lastTx.blockNumber);
      }
    }
  }
  return maxBlock;
}

/**
 * Singleton cache adapter instance using gov-tracker's LocalStorageCache
 */
let cacheAdapterInstance: LocalStorageCache | null = null;

/**
 * Get the shared cache adapter instance
 * Uses gov-tracker's built-in LocalStorageCache with TallyZero's prefix
 */
export function getCacheAdapter(): LocalStorageCache {
  if (!cacheAdapterInstance) {
    cacheAdapterInstance = new LocalStorageCache(
      STORAGE_KEYS.CHECKPOINT_CACHE_PREFIX
    );
  }
  return cacheAdapterInstance;
}

// ============================================================================
// Timelock Operation Caching (for standalone timelock tracking page)
// ============================================================================

/** Result from tracking a timelock operation */
export interface TimelockTrackingResult {
  operationInfo: {
    operationId: string;
    target: string;
    value: string;
    data: string;
    predecessor: string;
    delay: string;
    txHash: string;
    blockNumber: number;
    timestamp: number;
    timelockAddress: string;
  };
  stages: ProposalStage[];
  error?: string;
}

interface CachedTimelockResult {
  version: number;
  timestamp: number;
  result: TimelockTrackingResult;
}

function getTimelockCacheKey(txHash: string, operationId: string): string {
  return `${STORAGE_KEYS.TIMELOCK_OP_CACHE_PREFIX}${txHash.toLowerCase()}-${operationId.toLowerCase()}`;
}

/**
 * Load cached timelock result from localStorage
 */
export function loadCachedTimelockResult(
  txHash: string,
  operationId: string,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): { result: TimelockTrackingResult | null; isExpired: boolean } {
  if (!isBrowser) {
    return { result: null, isExpired: false };
  }

  try {
    const key = getTimelockCacheKey(txHash, operationId);
    const cached = localStorage.getItem(key);
    if (!cached) {
      return { result: null, isExpired: false };
    }

    const parsed: CachedTimelockResult = JSON.parse(cached);
    if (parsed.version !== CACHE_VERSION) {
      return { result: null, isExpired: false };
    }

    const isExpired = Date.now() - parsed.timestamp > ttlMs;
    return { result: parsed.result, isExpired };
  } catch {
    return { result: null, isExpired: false };
  }
}

/**
 * Save timelock result to localStorage cache
 */
export function saveCachedTimelockResult(
  txHash: string,
  operationId: string,
  result: TimelockTrackingResult
): void {
  if (!isBrowser) return;

  try {
    const key = getTimelockCacheKey(txHash, operationId);
    const cached: CachedTimelockResult = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      result,
    };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch {
    // Ignore cache save errors
  }
}
