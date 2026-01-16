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
    const bundledCache = await import(
      "@gzeoneth/gov-tracker/bundled-cache.json"
    );

    const entries = Object.entries(bundledCache.default);
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
}
