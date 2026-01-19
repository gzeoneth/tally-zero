"use client";

import { CACHE_PREFIX, loadBundledCache } from "@/lib/bundled-cache-loader";
import {
  LocalStorageCache,
  TrackedStage,
  createTracker,
} from "@gzeoneth/gov-tracker";
import { ethers } from "ethers";
import { useCallback, useEffect, useRef, useState } from "react";

const L2_RPC = "https://arb1.arbitrum.io/rpc";
const L1_RPC = "https://eth.drpc.org";

export interface UseProposalStagesResult {
  stages: TrackedStage[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useProposalStages(
  txHash: string | undefined,
  enabled = true
): UseProposalStagesResult {
  const [stages, setStages] = useState<TrackedStage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);
  const trackingRef = useRef(false);

  const track = useCallback(async () => {
    if (!txHash) return;

    // Reset abort flag first - must happen before trackingRef check
    // to handle React Strict Mode double-effect cleanup
    abortRef.current = false;

    if (trackingRef.current) return;

    trackingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      await loadBundledCache();

      const cache = new LocalStorageCache(CACHE_PREFIX);
      const tracker = createTracker({
        l2Provider: new ethers.providers.StaticJsonRpcProvider(L2_RPC),
        l1Provider: new ethers.providers.StaticJsonRpcProvider(L1_RPC),
        cache,
        onProgress: (progress) => {
          if (abortRef.current) return;
          setStages((prev) => {
            const next = [...prev];
            next[progress.currentIndex] = progress.stage;
            return next;
          });
        },
      });

      const results = await tracker.trackByTxHash(txHash);
      if (!abortRef.current && results[0]) {
        setStages(results[0].stages);
      }
    } catch (err) {
      if (!abortRef.current) {
        const message = err instanceof Error ? err.message : "Tracking failed";
        setError(message);
        console.error("Stage tracking error:", err);
      }
    } finally {
      trackingRef.current = false;
      if (!abortRef.current) {
        setIsLoading(false);
      }
    }
  }, [txHash]);

  useEffect(() => {
    if (!enabled || !txHash) {
      setStages([]);
      setError(null);
      return;
    }

    track();

    return () => {
      abortRef.current = true;
    };
  }, [txHash, enabled, track]);

  const refetch = useCallback(() => {
    abortRef.current = false;
    trackingRef.current = false;
    track();
  }, [track]);

  return { stages, isLoading, error, refetch };
}
