"use client";

import { DEFAULT_FORM_VALUES } from "@/config/arbitrum-governance";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { isValidTxHash } from "@/lib/address-utils";
import { getErrorMessage } from "@/lib/error-utils";
import {
  createTimelockOperationTracker,
  parseTimelockTransaction,
  type TimelockOperationInfo,
  type TimelockTrackingResult,
} from "@/lib/stage-tracker/timelock-operation-tracker";
import type { StageProgressCallback } from "@/lib/stage-tracker/types";
import { getStoredCacheTtlMs, getStoredNumber } from "@/lib/storage-utils";
import {
  loadCachedTimelockResult,
  saveCachedTimelockResult,
} from "@/lib/unified-cache";
import type { ProposalStage } from "@/types/proposal-stage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRpcSettings } from "./use-rpc-settings";

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

    if (!isValidTxHash(txHash)) {
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
      setError(getErrorMessage(err, "parse transaction"));
      setIsParsing(false);
    }
  }, [txHash, enabled, rpcHydrated, effectiveL2RpcUrl]);

  // Track selected operation
  const trackOperation = useCallback(
    async (forceRefresh: boolean = false) => {
      if (!selectedOperation || !enabled || !rpcHydrated) return;

      // Check cache first (unless forcing refresh)
      if (!forceRefresh) {
        const { result: cachedResult, isExpired } = loadCachedTimelockResult(
          selectedOperation.txHash,
          selectedOperation.operationId,
          getStoredCacheTtlMs()
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

        setError(getErrorMessage(err, "track operation"));
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
