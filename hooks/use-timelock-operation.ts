"use client";

import {
  DEFAULT_FORM_VALUES,
  ETHEREUM_RPC_URL,
} from "@/config/arbitrum-governance";
import { STORAGE_KEYS } from "@/config/storage-keys";
import {
  createTimelockOperationTracker,
  parseTimelockTransaction,
  type TimelockOperationInfo,
  type TimelockTrackingResult,
} from "@/lib/stage-tracker/timelock-operation-tracker";
import type { StageProgressCallback } from "@/lib/stage-tracker/types";
import { getStoredJsonString, getStoredNumber } from "@/lib/storage-utils";
import type { ProposalStage } from "@/types/proposal-stage";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const storedL1Rpc = getStoredJsonString(
    STORAGE_KEYS.L1_RPC,
    ETHEREUM_RPC_URL
  );
  const storedL2Rpc = getStoredJsonString(STORAGE_KEYS.L2_RPC, "");
  const storedL1BlockRange = getStoredNumber(
    STORAGE_KEYS.L1_BLOCK_RANGE,
    DEFAULT_FORM_VALUES.l1BlockRange
  );

  const effectiveL1RpcUrl = l1RpcUrl || storedL1Rpc;
  const effectiveL2RpcUrl = l2RpcUrl || storedL2Rpc;

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
    if (!txHash || !enabled) return;

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
        effectiveL2RpcUrl || "https://arb1.arbitrum.io/rpc"
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
  }, [txHash, enabled, effectiveL2RpcUrl]);

  // Track selected operation
  const trackOperation = useCallback(async () => {
    if (!selectedOperation || !enabled) return;

    // Abort any existing tracking
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

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
        if (abortControllerRef.current?.signal.aborted) return;
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

      if (abortControllerRef.current?.signal.aborted) return;
      if (!isMounted.current) return;

      setResult(trackingResult);
      setStages(trackingResult.stages);
      setIsLoading(false);
      setIsTracking(false);
    } catch (err) {
      if (abortControllerRef.current?.signal.aborted) return;
      if (!isMounted.current) return;

      setError(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
      setIsTracking(false);
    }
  }, [
    selectedOperation,
    enabled,
    effectiveL1RpcUrl,
    effectiveL2RpcUrl,
    storedL1BlockRange,
  ]);

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

  // Refetch (re-parse and re-track)
  const refetch = useCallback(() => {
    parseTransaction();
  }, [parseTransaction]);

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
