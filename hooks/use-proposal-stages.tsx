"use client";

import {
  CORE_GOVERNOR,
  ETHEREUM_RPC_URL,
  TREASURY_GOVERNOR,
} from "@/config/arbitrum-governance";
import {
  STAGE_METADATA,
  createCoreGovernorTracker,
  createTreasuryGovernorTracker,
  type StageProgressCallback,
} from "@/lib/incremental-stage-tracker";
import type {
  ProposalStage,
  ProposalTrackingResult,
} from "@/types/proposal-stage";
import { useCallback, useEffect, useRef, useState } from "react";

const L1_RPC_KEY = "tally-zero-l1-rpc";
const L2_RPC_KEY = "tally-zero-l2-rpc";

interface UseProposalStagesOptions {
  proposalId: string;
  creationTxHash: string;
  governorAddress: string;
  enabled?: boolean;
  l1RpcUrl?: string;
  l2RpcUrl?: string;
}

interface UseProposalStagesResult {
  stages: ProposalStage[];
  currentStageIndex: number;
  isLoading: boolean;
  isComplete: boolean;
  error: string | null;
  result: ProposalTrackingResult | null;
  refetch: () => void;
}

function getStoredRpc(key: string, defaultValue: string): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem(key) || defaultValue;
  }
  return defaultValue;
}

export function useProposalStages({
  proposalId,
  creationTxHash,
  governorAddress,
  enabled = true,
  l1RpcUrl,
  l2RpcUrl,
}: UseProposalStagesOptions): UseProposalStagesResult {
  // Get RPC URLs from localStorage if not provided
  const effectiveL1RpcUrl =
    l1RpcUrl || getStoredRpc(L1_RPC_KEY, ETHEREUM_RPC_URL);
  const effectiveL2RpcUrl = l2RpcUrl || getStoredRpc(L2_RPC_KEY, "");
  const [stages, setStages] = useState<ProposalStage[]>([]);
  const [currentStageIndex, setCurrentStageIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProposalTrackingResult | null>(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const isMounted = useRef(true);

  const refetch = useCallback(() => {
    setStages([]);
    setCurrentStageIndex(-1);
    setIsComplete(false);
    setError(null);
    setResult(null);
    setFetchTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !proposalId || !creationTxHash || !governorAddress) {
      return;
    }

    let cancelled = false;

    const trackStages = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Determine which governor to use
        const isCoreGovernor =
          governorAddress.toLowerCase() === CORE_GOVERNOR.address.toLowerCase();
        const isTreasuryGovernor =
          governorAddress.toLowerCase() ===
          TREASURY_GOVERNOR.address.toLowerCase();

        if (!isCoreGovernor && !isTreasuryGovernor) {
          throw new Error(`Unknown governor address: ${governorAddress}`);
        }

        const tracker = isCoreGovernor
          ? createCoreGovernorTracker(
              effectiveL2RpcUrl || undefined,
              effectiveL1RpcUrl
            )
          : createTreasuryGovernorTracker(
              effectiveL2RpcUrl || undefined,
              effectiveL1RpcUrl
            );

        const onProgress: StageProgressCallback = (stage, index, isLast) => {
          if (cancelled || !isMounted.current) return;

          setStages((prev) => {
            const newStages = [...prev];
            newStages[index] = stage;
            return newStages;
          });
          setCurrentStageIndex(index);

          if (isLast) {
            setIsComplete(true);
          }
        };

        const trackingResult = await tracker.trackProposal(
          proposalId,
          creationTxHash,
          onProgress
        );

        if (cancelled || !isMounted.current) return;

        setResult(trackingResult);
        setStages(trackingResult.stages);
        setIsComplete(true);
      } catch (err) {
        if (cancelled || !isMounted.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled && isMounted.current) {
          setIsLoading(false);
        }
      }
    };

    trackStages();

    return () => {
      cancelled = true;
    };
  }, [
    proposalId,
    creationTxHash,
    governorAddress,
    enabled,
    effectiveL1RpcUrl,
    effectiveL2RpcUrl,
    fetchTrigger,
  ]);

  return {
    stages,
    currentStageIndex,
    isLoading,
    isComplete,
    error,
    result,
    refetch,
  };
}

export function getAllStageTypes() {
  return STAGE_METADATA;
}
