/**
 * Bundled cache loader for gov-tracker 0.2.1
 *
 * Loads the pre-built proposal cache included in gov-tracker package
 * and initializes localStorage with TrackingCheckpoints on first run.
 */

import type { CacheAdapter } from "@gzeoneth/gov-tracker";
import { debug } from "./debug";

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
    // This is bundled with the npm package at build time
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
    // If bundled cache is not available, just log and continue
    // The app will work fine without it, just with more RPC calls
    debug.cache("could not load bundled cache: %O", err);
    bundledCacheInitialized = true; // Don't try again
  }
}

/**
 * Reset the initialization flag (mainly for testing)
 */
export function resetBundledCacheFlag(): void {
  bundledCacheInitialized = false;
}
