import type { CacheAdapter } from "@gzeoneth/gov-tracker";

import { STORAGE_KEYS } from "@/config/storage-keys";

import { debug } from "./debug";
import { getStoredValue } from "./storage-utils";

let bundledCacheInitialized = false;

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

    const bundledCache = await import(
      "@gzeoneth/gov-tracker/bundled-cache.json"
    );

    let count = 0;
    for (const [key, checkpoint] of Object.entries(bundledCache.default)) {
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
}
