/**
 * Bundled cache loader for gov-tracker
 *
 * Loads pre-tracked proposal checkpoints from the gov-tracker package into localStorage.
 * This enables near-instant resume for previously tracked proposals without RPC calls.
 */

import { LocalStorageCache } from "@gzeoneth/gov-tracker";
import { bundledCache as bundledCacheData } from "./bundled-cache-data";

export const CACHE_PREFIX = "tally-stages:";
const BUNDLED_CACHE_LOADED_KEY = "tally-stages:bundled-loaded";
const BUNDLED_CACHE_VERSION_KEY = "tally-stages:bundled-version";
const CURRENT_BUNDLED_VERSION = "0.3.0";

let loadingPromise: Promise<void> | null = null;
let loaded = false;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function isAlreadyLoaded(): boolean {
  if (!isBrowser()) return true;

  const loadedFlag = localStorage.getItem(BUNDLED_CACHE_LOADED_KEY);
  const version = localStorage.getItem(BUNDLED_CACHE_VERSION_KEY);

  return loadedFlag === "true" && version === CURRENT_BUNDLED_VERSION;
}

function markAsLoaded(): void {
  if (!isBrowser()) return;

  localStorage.setItem(BUNDLED_CACHE_LOADED_KEY, "true");
  localStorage.setItem(BUNDLED_CACHE_VERSION_KEY, CURRENT_BUNDLED_VERSION);
}

export async function loadBundledCache(): Promise<void> {
  if (!isBrowser()) return;
  if (loaded || isAlreadyLoaded()) return;

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      const cache = new LocalStorageCache(CACHE_PREFIX);
      const entries = Object.entries(bundledCacheData);

      let loadedCount = 0;
      for (const [key, checkpoint] of entries) {
        const exists = await cache.has(key);
        if (!exists) {
          await cache.set(key, checkpoint);
          loadedCount++;
        }
      }

      markAsLoaded();
      loaded = true;

      if (loadedCount > 0) {
        console.log(
          `[tally-stages] Loaded ${loadedCount} checkpoints from bundled cache`
        );
      }
    } catch (error) {
      console.warn("[tally-stages] Failed to load bundled cache:", error);
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

export function clearBundledCacheFlag(): void {
  if (!isBrowser()) return;

  localStorage.removeItem(BUNDLED_CACHE_LOADED_KEY);
  localStorage.removeItem(BUNDLED_CACHE_VERSION_KEY);
  loaded = false;
}

export function isBundledCacheLoaded(): boolean {
  return loaded || isAlreadyLoaded();
}
