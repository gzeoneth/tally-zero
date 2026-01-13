"use client";

import { initializeBundledCache } from "@/lib/bundled-cache-loader";
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

export function BundledCacheProvider({ children }: BundledCacheProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const cache = getCacheAdapter();
    initializeBundledCache(cache).then(() => {
      setIsInitialized(true);
    });
  }, []);

  return (
    <BundledCacheContext.Provider value={{ isInitialized }}>
      {children}
    </BundledCacheContext.Provider>
  );
}
