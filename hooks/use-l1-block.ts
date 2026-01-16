"use client";

import { useEffect, useState } from "react";

import { useRpcSettings } from "./use-rpc-settings";

const L1_BLOCK_REFRESH_INTERVAL_MS = 60000;

interface UseL1BlockResult {
  currentL1Block: number | null;
  isLoading: boolean;
}

/**
 * Hook to fetch and cache the current L1 block number.
 * Refreshes periodically to keep block estimates accurate.
 */
export function useL1Block(): UseL1BlockResult {
  const { l1Rpc, isHydrated } = useRpcSettings();
  const [currentL1Block, setCurrentL1Block] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isHydrated) return;

    let isMounted = true;

    const fetchL1Block = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(l1Rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_blockNumber",
            params: [],
            id: 1,
          }),
        });
        const data = await response.json();
        if (data.result && isMounted) {
          setCurrentL1Block(parseInt(data.result, 16));
        }
      } catch {
        // Silently fail - L1 block is optional for timing estimates
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchL1Block();
    const interval = setInterval(fetchL1Block, L1_BLOCK_REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [l1Rpc, isHydrated]);

  return { currentL1Block, isLoading };
}
