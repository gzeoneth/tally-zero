"use client";

import { useMemo } from "react";

import { isTreasuryGovernor } from "@/config/governors";
import {
  getAllStageTypes,
  useProposalStages,
} from "@/hooks/use-proposal-stages";
import type { ProposalStage, StageType } from "@/types/proposal-stage";
import { ReloadIcon } from "@radix-ui/react-icons";

import ProposalStagesError from "./ProposalStagesError";
import {
  calculateEstimatedCompletionTimes,
  LoadingSkeleton,
  StageItem,
} from "./stages";

const ALL_STAGE_TYPES = getAllStageTypes();

interface ProposalStagesProps {
  proposalId: string;
  creationTxHash: string;
  governorAddress: string;
  l1RpcUrl?: string;
  currentL1Block?: number;
}

export default function ProposalStages({
  proposalId,
  creationTxHash,
  governorAddress,
  l1RpcUrl,
  currentL1Block: currentL1BlockProp,
}: ProposalStagesProps) {
  const {
    stages,
    currentStageIndex,
    isLoading,
    isQueued,
    queuePosition,
    isComplete,
    error,
    result,
    refetchFromStage,
    refreshingFromIndex,
    currentL1Block: currentL1BlockFromHook,
  } = useProposalStages({
    proposalId,
    creationTxHash,
    governorAddress,
    enabled: true,
    l1RpcUrl,
  });

  // Use prop override if provided, otherwise use hook value (convert null to undefined)
  const currentL1Block =
    currentL1BlockProp ?? currentL1BlockFromHook ?? undefined;

  const isTreasuryProposal = isTreasuryGovernor(governorAddress);
  const governorType = isTreasuryProposal ? "treasury" : "core";

  const stageMap = useMemo(() => {
    const map = new Map<StageType, ProposalStage>();
    for (const stage of stages) {
      map.set(stage.type, stage);
    }
    return map;
  }, [stages]);

  const isDefeated = result?.currentState?.toLowerCase() === "defeated";

  const relevantStageTypes = useMemo(() => {
    return ALL_STAGE_TYPES.filter((meta) => {
      if (isDefeated) {
        const votingIdx = ALL_STAGE_TYPES.findIndex(
          (s) => s.type === "VOTING_ACTIVE"
        );
        const currentIdx = ALL_STAGE_TYPES.findIndex(
          (s) => s.type === meta.type
        );
        return currentIdx <= votingIdx;
      }
      if (isTreasuryProposal) {
        const l2ExecutedIdx = ALL_STAGE_TYPES.findIndex(
          (s) => s.type === "L2_TIMELOCK"
        );
        const currentIdx = ALL_STAGE_TYPES.findIndex(
          (s) => s.type === meta.type
        );
        return currentIdx <= l2ExecutedIdx;
      }
      return true;
    });
  }, [isDefeated, isTreasuryProposal]);

  const { estimatedTimes, votingTimeRange } = calculateEstimatedCompletionTimes(
    relevantStageTypes,
    stages,
    stageMap,
    currentL1Block
  );

  if (error) {
    return (
      <div className="glass-subtle rounded-xl">
        <ProposalStagesError
          error={new Error(error)}
          onReset={() => refetchFromStage(0)}
        />
      </div>
    );
  }

  if (isQueued) {
    return (
      <div className="p-4 text-center glass-subtle rounded-xl">
        <div className="flex items-center justify-center gap-2 mb-2">
          <ReloadIcon className="h-4 w-4 text-yellow-500 animate-spin" />
          <span className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
            Waiting in queue (position #{queuePosition})
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Max 2 proposals tracked concurrently. Will start automatically.
        </p>
      </div>
    );
  }

  if (stages.length === 0 && isLoading) {
    return <LoadingSkeleton stageCount={isTreasuryProposal ? 4 : 7} />;
  }

  return (
    <div className="glass rounded-xl p-4">
      {/* Header */}
      <div className="mb-4 pb-3 border-b border-border/50">
        <h3 className="text-sm font-semibold">Governance Lifecycle</h3>
        {result?.currentState && (
          <p className="text-xs text-muted-foreground">
            Current state: {result.currentState}
          </p>
        )}
      </div>

      <div className="relative">
        {relevantStageTypes.map((meta, idx) => {
          const stage = stageMap.get(meta.type);
          const isTrackingThis =
            isLoading && !isComplete && idx === currentStageIndex + 1;
          const isRefreshingThis =
            refreshingFromIndex !== null && idx >= refreshingFromIndex;
          const estimatedCompletion = estimatedTimes.get(meta.type);

          return (
            <StageItem
              key={meta.type}
              stage={stage}
              stageType={meta.type}
              stageIndex={idx}
              isLast={idx === relevantStageTypes.length - 1}
              isTracking={isTrackingThis}
              isLoading={isLoading}
              isRefreshing={isRefreshingThis && isLoading}
              onRefresh={refetchFromStage}
              estimatedCompletion={isDefeated ? undefined : estimatedCompletion}
              votingTimeRange={isDefeated ? null : votingTimeRange}
              governorType={governorType}
              proposalId={proposalId}
              governorAddress={governorAddress}
            />
          );
        })}
      </div>
    </div>
  );
}
