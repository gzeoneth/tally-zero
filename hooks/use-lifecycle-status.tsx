"use client";

import { STAGE_METADATA } from "@/lib/incremental-stage-tracker";
import type { TrackingStatus } from "@/lib/proposal-tracker-manager";
import type { ProposalStage } from "@/types/proposal-stage";
import { useMemo } from "react";
import { useProposalStages } from "./use-proposal-stages";

export interface LifecycleStatus {
  status: TrackingStatus;
  currentState: string | null;
  queuePosition: number | null;
  currentStageIndex: number;
  totalStages: number;
  stages: ProposalStage[];
}

interface UseLifecycleStatusOptions {
  proposalId: string;
  creationTxHash?: string;
  governorAddress: string;
  enabled?: boolean;
}

/**
 * Simplified wrapper around useProposalStages that provides backward compatibility
 * for components using the LifecycleStatus interface.
 *
 * This hook maps the result from useProposalStages to the LifecycleStatus shape.
 */
export function useLifecycleStatus({
  proposalId,
  creationTxHash,
  governorAddress,
  enabled = true,
}: UseLifecycleStatusOptions): LifecycleStatus {
  const proposalStagesResult = useProposalStages({
    proposalId,
    creationTxHash: creationTxHash || "",
    governorAddress,
    enabled: enabled && !!creationTxHash,
  });

  const status: TrackingStatus = useMemo(() => {
    if (proposalStagesResult.isQueued) return "queued";
    if (proposalStagesResult.isLoading) return "loading";
    if (proposalStagesResult.error) return "error";
    if (proposalStagesResult.isComplete) return "complete";
    return "idle";
  }, [
    proposalStagesResult.isQueued,
    proposalStagesResult.isLoading,
    proposalStagesResult.error,
    proposalStagesResult.isComplete,
  ]);

  const currentState = useMemo(() => {
    return proposalStagesResult.result?.currentState || null;
  }, [proposalStagesResult.result]);

  return {
    status,
    currentState,
    queuePosition: proposalStagesResult.queuePosition,
    currentStageIndex: proposalStagesResult.currentStageIndex,
    totalStages: STAGE_METADATA.length,
    stages: proposalStagesResult.stages,
  };
}
