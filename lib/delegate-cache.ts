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

export const CURRENT_DELEGATE_CACHE_VERSION = 1;

// Type for the delegate labels JSON structure
interface DelegateLabelsConfig {
  version: number;
  description: string;
  delegates: Record<string, string>;
}

const delegateLabels = delegateLabelsData as DelegateLabelsConfig;

export function getDelegateLabel(address: string): string | undefined {
  if (delegateLabels.delegates[address]) {
    return delegateLabels.delegates[address];
  }

  const lowerAddress = address.toLowerCase();
  for (const [addr, label] of Object.entries(delegateLabels.delegates)) {
    if (addr.toLowerCase() === lowerAddress) {
      return label;
    }
  }

  return undefined;
}

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

let validatedCacheData: DelegateCache | null = null;
let cacheValidated = false;

export async function loadDelegateCache(): Promise<DelegateCache | null> {
  if (getSkipDelegateCacheSetting()) {
    debug.delegates("skipping preload cache (setting enabled)");
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

export function clearDelegateCacheData(): void {
  validatedCacheData = null;
  cacheValidated = false;
}

export async function getDelegateCacheSnapshotBlock(): Promise<number> {
  const cache = await loadDelegateCache();
  return cache?.snapshotBlock ?? 0;
}

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

export function getTopDelegates(
  cache: DelegateCache,
  limit: number = 100
): DelegateInfo[] {
  return cache.delegates.slice(0, limit);
}

export function findDelegateByAddress(
  cache: DelegateCache,
  address: string
): DelegateInfo | undefined {
  const normalizedAddress = address.toLowerCase();
  return cache.delegates.find(
    (d) => d.address.toLowerCase() === normalizedAddress
  );
}

export function getDelegatesWithMinPower(
  cache: DelegateCache,
  minPowerWei: string
): DelegateInfo[] {
  const minPower = BigInt(minPowerWei);
  return cache.delegates.filter((d) => BigInt(d.votingPower) >= minPower);
}
