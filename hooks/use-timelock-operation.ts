"use client";

import { DEFAULT_FORM_VALUES } from "@/config/arbitrum-governance";
import {
  CACHE_VERSION,
  DEFAULT_CACHE_TTL_MS,
  STORAGE_KEYS,
} from "@/config/storage-keys";
import {
  createTimelockOperationTracker,
  parseTimelockTransaction,
  type TimelockOperationInfo,
  type TimelockTrackingResult,
} from "@/lib/stage-tracker/timelock-operation-tracker";
import type { StageProgressCallback } from "@/lib/stage-tracker/types";
import { getStoredNumber } from "@/lib/storage-utils";
import type { ProposalStage } from "@/types/proposal-stage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRpcSettings } from "./use-rpc-settings";

interface CachedTimelockResult {
  version: number;
  timestamp: number;
  result: TimelockTrackingResult;
}

function getTimelockCacheKey(txHash: string, operationId: string): string {
  return `${STORAGE_KEYS.TIMELOCK_OP_CACHE_PREFIX}${txHash.toLowerCase()}-${operationId.toLowerCase()}`;
}

function loadCachedTimelockResult(
  txHash: string,
  operationId: string,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): { result: TimelockTrackingResult | null; isExpired: boolean } {
  if (typeof window === "undefined") {
    return { result: null, isExpired: false };
  }

  try {
    const key = getTimelockCacheKey(txHash, operationId);
    const cached = localStorage.getItem(key);
    if (!cached) {
      return { result: null, isExpired: false };
    }

    const parsed: CachedTimelockResult = JSON.parse(cached);
    if (parsed.version !== CACHE_VERSION) {
      return { result: null, isExpired: false };
    }

    const isExpired = Date.now() - parsed.timestamp > ttlMs;
    return { result: parsed.result, isExpired };
  } catch {
    return { result: null, isExpired: false };
  }
}

function saveCachedTimelockResult(
  txHash: string,
  operationId: string,
  result: TimelockTrackingResult
): void {
  if (typeof window === "undefined") return;

  try {
    const key = getTimelockCacheKey(txHash, operationId);
    const cached: CachedTimelockResult = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      result,
    };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch {
    // Storage full or unavailable
  }
}

interface UseTimelockOperationOptions {
  txHash: string;
  enabled?: boolean;
  l1RpcUrl?: string;
  l2RpcUrl?: string;
}

interface UseTimelockOperationResult {
  operations: TimelockOperationInfo[];
  selectedOperation: TimelockOperationInfo | null;
  stages: ProposalStage[];
  isLoading: boolean;
  isParsing: boolean;
  isTracking: boolean;
  error: string | null;
  result: TimelockTrackingResult | null;
  selectOperation: (operation: TimelockOperationInfo) => void;
  deselectOperation: () => void;
  refetch: () => void;
}

export function useTimelockOperation({
  txHash,
  enabled = true,
  l1RpcUrl,
  l2RpcUrl,
}: UseTimelockOperationOptions): UseTimelockOperationResult {
  const { l1Rpc, l2Rpc, isHydrated: rpcHydrated } = useRpcSettings();

  const storedL1BlockRange = getStoredNumber(
    STORAGE_KEYS.L1_BLOCK_RANGE,
    DEFAULT_FORM_VALUES.l1BlockRange
  );

  const effectiveL1RpcUrl = l1RpcUrl || l1Rpc;
  const effectiveL2RpcUrl = l2RpcUrl || l2Rpc;

  const [operations, setOperations] = useState<TimelockOperationInfo[]>([]);
  const [selectedOperation, setSelectedOperation] =
    useState<TimelockOperationInfo | null>(null);
  const [stages, setStages] = useState<ProposalStage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TimelockTrackingResult | null>(null);

  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Parse transaction to find CallScheduled events
  const parseTransaction = useCallback(async () => {
    if (!txHash || !enabled || !rpcHydrated) return;

    // Validate tx hash format
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      setError("Invalid transaction hash format");
      return;
    }

    setIsParsing(true);
    setError(null);
    setOperations([]);
    setSelectedOperation(null);
    setStages([]);
    setResult(null);

    try {
      const { ethers } = await import("ethers");
      const l2Provider = new ethers.providers.JsonRpcProvider(
        effectiveL2RpcUrl
      );

      const ops = await parseTimelockTransaction(txHash, l2Provider);

      if (!isMounted.current) return;

      if (ops.length === 0) {
        setError("No CallScheduled events found in this transaction");
        setIsParsing(false);
        return;
      }

      setOperations(ops);

      // Auto-select if there's only one operation
      if (ops.length === 1) {
        setSelectedOperation(ops[0]);
      }

      setIsParsing(false);
    } catch (err) {
      if (!isMounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setIsParsing(false);
    }
  }, [txHash, enabled, rpcHydrated, effectiveL2RpcUrl]);

  // Track selected operation
  const trackOperation = useCallback(
    async (forceRefresh: boolean = false) => {
      if (!selectedOperation || !enabled || !rpcHydrated) return;

      // Check cache first (unless forcing refresh)
      if (!forceRefresh) {
        const cacheTtlMs = getStoredNumber(
          STORAGE_KEYS.CACHE_TTL,
          DEFAULT_CACHE_TTL_MS / 1000
        );
        const ttlMs = cacheTtlMs > 0 ? cacheTtlMs * 1000 : DEFAULT_CACHE_TTL_MS;

        const { result: cachedResult, isExpired } = loadCachedTimelockResult(
          selectedOperation.txHash,
          selectedOperation.operationId,
          ttlMs
        );

        if (cachedResult && !isExpired) {
          setResult(cachedResult);
          setStages(cachedResult.stages);
          setIsLoading(false);
          setIsTracking(false);
          return;
        }
      }

      // Abort any existing tracking
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      // Capture the signal locally to avoid race condition when user switches operations
      const signal = controller.signal;

      setIsTracking(true);
      setIsLoading(true);
      setError(null);
      setStages([]);
      setResult(null);

      try {
        const tracker = createTimelockOperationTracker(
          effectiveL2RpcUrl || undefined,
          effectiveL1RpcUrl || undefined,
          { l1ChunkSize: storedL1BlockRange }
        );

        const onProgress: StageProgressCallback = (stage, index) => {
          if (signal.aborted) return;
          if (!isMounted.current) return;

          setStages((prev) => {
            const newStages = [...prev];
            newStages[index] = stage;
            return newStages;
          });
        };

        const trackingResult = await tracker.trackOperation(
          selectedOperation,
          onProgress
        );

        if (signal.aborted) return;
        if (!isMounted.current) return;

        setResult(trackingResult);
        setStages(trackingResult.stages);
        setIsLoading(false);
        setIsTracking(false);

        // Save to cache
        saveCachedTimelockResult(
          selectedOperation.txHash,
          selectedOperation.operationId,
          trackingResult
        );
      } catch (err) {
        if (signal.aborted) return;
        if (!isMounted.current) return;

        setError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
        setIsTracking(false);
      }
    },
    [
      selectedOperation,
      enabled,
      rpcHydrated,
      effectiveL1RpcUrl,
      effectiveL2RpcUrl,
      storedL1BlockRange,
    ]
  );

  // Select an operation and start tracking
  const selectOperation = useCallback((operation: TimelockOperationInfo) => {
    setSelectedOperation(operation);
  }, []);

  // Deselect the current operation to go back to the list
  const deselectOperation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setSelectedOperation(null);
    setStages([]);
    setResult(null);
    setError(null);
  }, []);

  // Refetch (force refresh tracking, bypassing cache)
  const refetch = useCallback(() => {
    if (selectedOperation) {
      trackOperation(true);
    } else {
      parseTransaction();
    }
  }, [selectedOperation, trackOperation, parseTransaction]);

  // Mount/unmount effect
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // Parse transaction when txHash changes
  useEffect(() => {
    if (txHash && enabled) {
      parseTransaction();
    }
  }, [txHash, enabled, parseTransaction]);

  // Track operation when selection changes
  useEffect(() => {
    if (selectedOperation && enabled) {
      trackOperation();
    }
  }, [selectedOperation, enabled, trackOperation]);

  return {
    operations,
    selectedOperation,
    stages,
    isLoading,
    isParsing,
    isTracking,
    error,
    result,
    selectOperation,
    deselectOperation,
    refetch,
  };
}
