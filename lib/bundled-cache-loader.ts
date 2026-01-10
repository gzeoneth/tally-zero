/**
 * Bundled cache loader for gov-tracker 0.2.1
 *
 * Loads the pre-built proposal cache included in gov-tracker package
 * and initializes localStorage with TrackingCheckpoints on first run.
 *
 * Note: In static export builds (Next.js output: "export"), the bundled cache
 * from node_modules is not available at runtime. This function will gracefully
 * fail and the app will work normally by making RPC calls for stage discovery.
 * The bundled cache is primarily beneficial for server-side or CLI usage.
 */

import type { CacheAdapter } from "@gzeoneth/gov-tracker";

import { STORAGE_KEYS } from "@/config/storage-keys";

import { debug } from "./debug";
import { getStoredValue } from "./storage-utils";

// Flag to track if we've already initialized the bundled cache
let bundledCacheInitialized = false;

/**
 * Initialize cache with bundled checkpoints from gov-tracker
 *
 * On first run, this copies the bundled cache from gov-tracker to localStorage,
 * eliminating the need for initial RPC discovery calls.
 *
 * @param cache - The cache adapter to initialize
 * @returns Promise that resolves when initialization is complete
 */
export async function initializeBundledCache(
  cache: CacheAdapter
): Promise<void> {
  // Skip if already initialized in this session
  if (bundledCacheInitialized) {
    return;
  }

  // Check if user has disabled bundled cache via settings
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
    // Check if localStorage already has checkpoints
    const existingKeys = await cache.keys();
    const keyCount = Array.isArray(existingKeys)
      ? existingKeys.length
      : Array.from(existingKeys).length;

    if (keyCount > 0) {
      debug.cache("cache already initialized with %d checkpoints", keyCount);
      bundledCacheInitialized = true;
      return;
    }

    // Dynamically import the bundled cache
    // This will work in development but may not be available in static export builds
    const bundledCache = await import(
      "@gzeoneth/gov-tracker/dist/data/bundled-cache.json"
    );

    // Copy checkpoints to localStorage
    let count = 0;
    for (const [key, checkpoint] of Object.entries(bundledCache.default)) {
      await cache.set(key, checkpoint);
      count++;
    }

    debug.cache("initialized cache with %d bundled checkpoints", count);
    bundledCacheInitialized = true;
  } catch (err) {
    // Expected to fail in production static export builds
    // The app will work fine without it, just with more RPC calls
    debug.cache(
      "bundled cache not available (expected in static builds): %O",
      err
    );
    bundledCacheInitialized = true; // Don't try again
  }
}

/**
 * Reset the initialization flag (mainly for testing)
 */
export function resetBundledCacheFlag(): void {
  bundledCacheInitialized = false;
}
