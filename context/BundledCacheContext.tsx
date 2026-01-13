"use client";

import { CACHE_VERSION, STORAGE_KEYS } from "@/config/storage-keys";
import { initializeBundledCache } from "@/lib/bundled-cache-loader";
import { debug, isBrowser } from "@/lib/debug";
import { getCacheAdapter } from "@/lib/gov-tracker-cache";
import { createContext, useContext, useEffect, useState } from "react";

interface BundledCacheContextValue {
  isInitialized: boolean;
}

const BundledCacheContext = createContext<BundledCacheContextValue>({
  isInitialized: false,
});

export function useBundledCacheStatus(): BundledCacheContextValue {
  return useContext(BundledCacheContext);
}

interface BundledCacheProviderProps {
  children: React.ReactNode;
}

function migrateCache(): void {
  if (!isBrowser) return;

  try {
    const lastVersion = localStorage.getItem(STORAGE_KEYS.LAST_CACHE_VERSION);
    const lastVersionNum = lastVersion ? parseInt(lastVersion, 10) : 0;

    if (lastVersionNum < CACHE_VERSION) {
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key?.startsWith(STORAGE_KEYS.STAGES_CACHE_PREFIX) ||
          key?.startsWith(STORAGE_KEYS.CHECKPOINT_CACHE_PREFIX) ||
          key?.startsWith(STORAGE_KEYS.TIMELOCK_OP_CACHE_PREFIX)
        ) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((key) => localStorage.removeItem(key));
      localStorage.setItem(
        STORAGE_KEYS.LAST_CACHE_VERSION,
        String(CACHE_VERSION)
      );
    }
  } catch {
    // Ignore migration errors
  }
}

export function BundledCacheProvider({ children }: BundledCacheProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    migrateCache();
    initializeBundledCache(getCacheAdapter())
      .catch((err) => debug.cache("Bundled cache init failed: %O", err))
      .finally(() => setIsInitialized(true));
  }, []);

  return (
    <BundledCacheContext.Provider value={{ isInitialized }}>
      {children}
    </BundledCacheContext.Provider>
  );
}
