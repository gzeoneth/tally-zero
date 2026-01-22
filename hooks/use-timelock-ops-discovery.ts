"use client";

/**
 * Hook for discovering timelock operations that are not part of proposals
 *
 * These "orphan" timelock operations include:
 * - Security Council operations
 * - Direct timelock executions not from governor proposals
 */

import { DEFAULT_FORM_VALUES } from "@/config/arbitrum-governance";
import { BLOCKS_PER_DAY } from "@/config/block-times";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { getErrorMessage } from "@/lib/error-utils";
import { getCacheAdapter } from "@/lib/gov-tracker-cache";
import { createProposalTracker } from "@/lib/stage-tracker";
import {
  ADDRESSES,
  type DiscoveredTimelockOp,
  type TrackingCheckpoint,
  isChildCheckpoint,
} from "@gzeoneth/gov-tracker";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalStorage } from "./use-local-storage";
import { useRpcSettings } from "./use-rpc-settings";

/** Discovered timelock operation with orphan status */
export interface TimelockOpWithStatus extends DiscoveredTimelockOp {
  isOrphan: boolean;
  timelockName: string;
}

/** Options for timelock discovery */
interface UseTimelockOpsDiscoveryOptions {
  enabled?: boolean;
  daysToSearch?: number;
}

/** Return type for the hook */
interface UseTimelockOpsDiscoveryResult {
  operations: TimelockOpWithStatus[];
  isLoading: boolean;
  error: string | null;
  progress: number;
  refetch: () => void;
}

function getTimelockName(address: string): string {
  const addr = address.toLowerCase();
  if (addr === ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK.toLowerCase()) {
    return "Core Timelock";
  }
  if (addr === ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK.toLowerCase()) {
    return "Treasury Timelock";
  }
  return "Unknown Timelock";
}

/**
 * Hook for discovering orphan timelock operations
 */
export function useTimelockOpsDiscovery({
  enabled = true,
  daysToSearch,
}: UseTimelockOpsDiscoveryOptions = {}): UseTimelockOpsDiscoveryResult {
  const { l2Rpc, l2ChunkSize, isHydrated: rpcHydrated } = useRpcSettings();

  const [storedDays] = useLocalStorage<number>(
    STORAGE_KEYS.DAYS_TO_SEARCH,
    DEFAULT_FORM_VALUES.daysToSearch
  );

  const effectiveDays = daysToSearch ?? storedDays;

  const [operations, setOperations] = useState<TimelockOpWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const discover = useCallback(async () => {
    if (!enabled || !rpcHydrated) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    setOperations([]);
    setProgress(0);

    try {
      const cache = getCacheAdapter();

      // Create tracker instance to use discovery methods
      const tracker = createProposalTracker(l2Rpc, undefined, {
        chunkingConfig: { l2ChunkSize },
        cache,
      });

      const l2Provider = tracker.getProviders().l2;
      const currentBlock = await l2Provider.getBlockNumber();
      const blocksToSearch = effectiveDays * BLOCKS_PER_DAY.arbitrum;
      const fromBlock = Math.max(0, currentBlock - blocksToSearch);

      if (controller.signal.aborted) return;
      setProgress(10);

      // Discover from both L2 timelocks in parallel using tracker methods
      const [coreOps, treasuryOps] = await Promise.all([
        tracker.discoverTimelockOps(
          ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
          fromBlock,
          currentBlock
        ),
        tracker.discoverTimelockOps(
          ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK,
          fromBlock,
          currentBlock
        ),
      ]);

      if (controller.signal.aborted) return;
      setProgress(60);

      const allOps = [...coreOps, ...treasuryOps];

      // Check which operations are orphans (not linked to proposals)
      const opsWithStatus: TimelockOpWithStatus[] = [];
      const totalOps = allOps.length;

      for (let i = 0; i < allOps.length; i++) {
        if (controller.signal.aborted) return;

        const op = allOps[i];
        const cacheKey = `tx:${op.scheduledTxHash.toLowerCase()}`;

        // Check if this operation has a parent checkpoint
        const isChild = await isChildCheckpoint(cacheKey, cache);

        // Also check if there's a governor checkpoint for this tx
        const checkpoint = await cache.get<TrackingCheckpoint>(cacheKey);
        const isGovernorCheckpoint = checkpoint?.input?.type === "governor";

        const isOrphan = !isChild && !isGovernorCheckpoint;

        opsWithStatus.push({
          ...op,
          isOrphan,
          timelockName: getTimelockName(op.timelockAddress),
        });

        // Update progress between 60-90%
        setProgress(60 + Math.floor((i / totalOps) * 30));
      }

      if (controller.signal.aborted) return;

      // Sort by block number descending (most recent first)
      opsWithStatus.sort((a, b) => b.queueBlock - a.queueBlock);

      if (!isMounted.current) return;

      setOperations(opsWithStatus);
      setProgress(100);
      setIsLoading(false);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (!isMounted.current) return;

      setError(getErrorMessage(err, "discover timelock operations"));
      setIsLoading(false);
    }
  }, [enabled, rpcHydrated, l2Rpc, l2ChunkSize, effectiveDays]);

  const refetch = useCallback(() => {
    discover();
  }, [discover]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (enabled && rpcHydrated) {
      discover();
    }
  }, [enabled, rpcHydrated, discover]);

  return {
    operations,
    isLoading,
    error,
    progress,
    refetch,
  };
}
