import { STORAGE_KEYS } from "@/config/storage-keys";
import type {
  DelegateCache,
  DelegateCacheStats,
  DelegateInfo,
} from "@/types/delegate";
import delegateLabelsData from "@data/delegate-labels.json";

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
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEYS.SKIP_DELEGATE_CACHE);
    if (stored) {
      try {
        return JSON.parse(stored) === true;
      } catch {
        return false;
      }
    }
  }
  return false;
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
    console.log("[delegate-cache] Skipping preload cache (setting enabled)");
    return null;
  }

  if (cacheValidated) {
    return validatedCacheData;
  }

  cacheValidated = true;

  if (!staticCacheData) {
    console.debug(
      "[delegate-cache] Cache file not found - run cache build to generate"
    );
    return null;
  }

  // Validate cache version
  if (staticCacheData.version !== CURRENT_DELEGATE_CACHE_VERSION) {
    console.warn(
      `[delegate-cache] Cache version mismatch: expected ${CURRENT_DELEGATE_CACHE_VERSION}, got ${staticCacheData.version}`
    );
    return null;
  }

  // Validate that delegates exist
  if (!staticCacheData.delegates || !Array.isArray(staticCacheData.delegates)) {
    console.warn(
      "[delegate-cache] Invalid cache format: missing delegates array"
    );
    return null;
  }

  validatedCacheData = staticCacheData;

  console.log(
    `[delegate-cache] Loaded ${validatedCacheData.delegates.length} delegates from cache (block ${validatedCacheData.snapshotBlock})`
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
  const ageMs = Date.now() - generatedAt.getTime();
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
  const ageDays = Math.floor(ageHours / 24);

  const age =
    ageDays > 0
      ? `${ageDays}d ${ageHours % 24}h`
      : ageHours > 0
        ? `${ageHours}h`
        : "< 1h";

  return {
    totalDelegates: cache.stats.totalDelegates,
    snapshotBlock: cache.snapshotBlock,
    generatedAt,
    age,
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
