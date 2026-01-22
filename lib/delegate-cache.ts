/**
 * Delegate cache utilities
 *
 * Provides functions for loading, validating, and querying the delegate
 * cache containing ARB token delegate voting power data.
 */

import { STORAGE_KEYS } from "@/config/storage-keys";
import type {
  DelegateCache,
  DelegateCacheStats,
  DelegateInfo,
} from "@/types/delegate";
import delegateLabelsData from "@data/delegate-labels.json";
import { debug } from "./debug";
import { formatCacheAge } from "./format-utils";
import { getStoredValue } from "./storage-utils";

/** Current cache format version for compatibility checks */
export const CURRENT_DELEGATE_CACHE_VERSION = 1;

// Type for the delegate labels JSON structure
interface DelegateLabelsConfig {
  version: number;
  description: string;
  delegates: Record<string, string>;
}

const delegateLabels = delegateLabelsData as DelegateLabelsConfig;

// Pre-compute a normalized lookup map for O(1) case-insensitive address lookups
const normalizedDelegateLabels = new Map<string, string>();
for (const [addr, label] of Object.entries(delegateLabels.delegates)) {
  normalizedDelegateLabels.set(addr.toLowerCase(), label);
}

/**
 * Get the human-readable label for a delegate address
 * @param address - The delegate's Ethereum address
 * @returns The delegate's label if found, undefined otherwise
 */
export function getDelegateLabel(address: string): string | undefined {
  return normalizedDelegateLabels.get(address.toLowerCase());
}

/**
 * Check if delegate cache should be skipped based on user settings
 *
 * @returns True if user has disabled delegate cache
 */
function getSkipDelegateCacheSetting(): boolean {
  return (
    getStoredValue<boolean>(STORAGE_KEYS.SKIP_DELEGATE_CACHE, false) === true
  );
}

let staticCacheData: DelegateCache | null = null;
try {
  staticCacheData = require("@data/delegate-cache.json") as DelegateCache;
} catch {
  staticCacheData = null;
}

// Pre-computed address-to-rank Map for O(1) rank lookups
// Built lazily when first delegate rank is requested
let delegateRankMap: Map<string, number> | null = null;

function buildDelegateRankMap(delegates: DelegateInfo[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < delegates.length; i++) {
    map.set(delegates[i].address.toLowerCase(), i + 1); // 1-indexed rank
  }
  return map;
}

let validatedCacheData: DelegateCache | null = null;
let cacheValidated = false;

/**
 * Load and validate the delegate cache from static data
 * Returns cached data on subsequent calls for performance.
 * @returns The validated delegate cache, or null if unavailable/invalid
 */
export async function loadDelegateCache(): Promise<DelegateCache | null> {
  if (getSkipDelegateCacheSetting()) {
    debug.delegates("skipping delegate cache (setting enabled)");
    return null;
  }

  if (cacheValidated) {
    debug.delegates("returning validated cache (already loaded)");
    return validatedCacheData;
  }

  cacheValidated = true;

  if (!staticCacheData) {
    debug.delegates("cache file not found - run cache build to generate");
    return null;
  }

  // Validate cache version
  if (staticCacheData.version !== CURRENT_DELEGATE_CACHE_VERSION) {
    debug.delegates(
      "cache version mismatch: expected %d, got %d",
      CURRENT_DELEGATE_CACHE_VERSION,
      staticCacheData.version
    );
    return null;
  }

  // Validate that delegates exist
  if (!staticCacheData.delegates || !Array.isArray(staticCacheData.delegates)) {
    debug.delegates("invalid cache format: missing delegates array");
    return null;
  }

  validatedCacheData = staticCacheData;

  // Calculate some useful stats
  const totalPower = BigInt(validatedCacheData.totalVotingPower);
  const topDelegatePower = BigInt(
    validatedCacheData.delegates[0]?.votingPower ?? "0"
  );
  const top10Power = validatedCacheData.delegates
    .slice(0, 10)
    .reduce((sum, d) => sum + BigInt(d.votingPower), BigInt(0));

  debug.delegates(
    "loaded %d delegates from cache (block %d)",
    validatedCacheData.delegates.length,
    validatedCacheData.snapshotBlock
  );
  debug.delegates(
    "top delegate: %s%% of total, top 10: %s%% of total",
    ((topDelegatePower * BigInt(10000)) / totalPower / BigInt(100)).toString(),
    ((top10Power * BigInt(10000)) / totalPower / BigInt(100)).toString()
  );

  return validatedCacheData;
}

/**
 * Clear the validated delegate cache data
 * Useful for forcing a cache refresh
 */
export function clearDelegateCacheData(): void {
  validatedCacheData = null;
  cacheValidated = false;
  delegateRankMap = null;
}

/**
 * Get delegate rank and cached voting power by address
 * Uses pre-computed Map for O(1) lookup instead of O(n) findIndex
 * @param address - The delegate's Ethereum address
 * @returns Object with rank (1-indexed) and votingPower, or undefined if not found
 */
export async function getDelegateRankInfo(
  address: string
): Promise<{ rank: number; votingPower: string } | undefined> {
  const cache = await loadDelegateCache();
  if (!cache) return undefined;

  // Build rank map lazily on first access
  if (!delegateRankMap) {
    delegateRankMap = buildDelegateRankMap(cache.delegates);
  }

  const rank = delegateRankMap.get(address.toLowerCase());
  if (rank === undefined) return undefined;

  // rank is 1-indexed, so array index is rank - 1
  const delegate = cache.delegates[rank - 1];
  return { rank, votingPower: delegate.votingPower };
}

/**
 * Get the snapshot block number from the delegate cache
 * @returns The block number when the cache was generated, or 0 if no cache
 */
export async function getDelegateCacheSnapshotBlock(): Promise<number> {
  const cache = await loadDelegateCache();
  return cache?.snapshotBlock ?? 0;
}

/**
 * Get statistics about the delegate cache
 * @param cache - The delegate cache to analyze
 * @returns Cache statistics including delegate count, age, and voting power
 */
export function getDelegateCacheStats(
  cache: DelegateCache
): DelegateCacheStats {
  const generatedAt = new Date(cache.generatedAt);

  return {
    totalDelegates: cache.stats.totalDelegates,
    snapshotBlock: cache.snapshotBlock,
    generatedAt,
    age: formatCacheAge(generatedAt),
    totalVotingPower: cache.totalVotingPower,
    totalSupply: cache.totalSupply,
  };
}

/**
 * Get the top delegates by voting power
 * @param cache - The delegate cache
 * @param limit - Maximum number of delegates to return (default: 100)
 * @returns Array of top delegates sorted by voting power descending
 */
export function getTopDelegates(
  cache: DelegateCache,
  limit: number = 100
): DelegateInfo[] {
  return cache.delegates.slice(0, limit);
}
