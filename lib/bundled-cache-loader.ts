import type { CacheAdapter } from "@gzeoneth/gov-tracker";

import {
  BUNDLED_CACHE_BATCH_SIZE,
  BUNDLED_CACHE_MAX_RETRIES,
  BUNDLED_CACHE_RETRY_DELAY_MS,
  STORAGE_KEYS,
} from "@/config/storage-keys";

import { debug } from "./debug";
import { getStoredValue } from "./storage-utils";

let bundledCacheInitialized = false;
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
    const existingKeys = new Set(await cache.keys());

    // Filter to only entries that don't already exist in cache
    const newEntries = entries.filter(([key]) => !existingKeys.has(key));

    if (newEntries.length === 0) {
      debug.cache(
        "cache already has all %d bundled checkpoints",
        entries.length
      );
      bundledCacheInitialized = true;
      return;
    }

    debug.cache(
      "merging %d new bundled checkpoints (existing: %d)",
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

    debug.cache(
      "merged %d bundled checkpoints (total: %d)",
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
  bundledCacheData = null;
}

/** Proposal seed data from bundled cache */
export interface ProposalSeed {
  proposalId: string;
  governorAddress: string;
  creationTxHash: string;
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
 */
export async function getBundledCacheWatermark(): Promise<BundledCacheWatermark | null> {
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

/**
 * Get proposal seeds from bundled cache
 * These are proposal IDs that can be fetched directly instead of scanning blocks
 */
export async function getBundledProposalSeeds(): Promise<ProposalSeed[]> {
  try {
    const cache = await loadBundledCache();
    const seeds: ProposalSeed[] = [];

    for (const [key, value] of Object.entries(cache)) {
      if (!key.startsWith("tx:")) continue;

      const checkpoint = value as {
        input?: {
          type?: string;
          proposalId?: string;
          governorAddress?: string;
          creationTxHash?: string;
        };
      };

      if (
        checkpoint.input?.type === "governor" &&
        checkpoint.input.proposalId &&
        checkpoint.input.governorAddress
      ) {
        seeds.push({
          proposalId: checkpoint.input.proposalId,
          governorAddress: checkpoint.input.governorAddress,
          creationTxHash: checkpoint.input.creationTxHash ?? key.slice(3),
        });
      }
    }

    debug.cache("found %d proposal seeds in bundled cache", seeds.length);
    return seeds;
  } catch {
    return [];
  }
}
