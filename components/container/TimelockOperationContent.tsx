"use client";

import { useCallback, useEffect, useMemo } from "react";

import { Button } from "@/components/ui/Button";
import { useTimelockOperation } from "@/hooks/use-timelock-operation";
import { type EstimatedTimeRange } from "@/lib/date-utils";
import { shortenAddress } from "@/lib/format-utils";
import { getAllStageMetadata } from "@/lib/incremental-stage-tracker";
import type { TimelockOperationInfo } from "@/lib/stage-tracker/timelock-operation-tracker";
import { formatAddress } from "@/lib/utils";
import type { ProposalStage, StageType } from "@/types/proposal-stage";
import { ExternalLinkIcon, ReloadIcon } from "@radix-ui/react-icons";

import { ActionView } from "../payload/ActionView";
import { LoadingSkeleton, StageItem } from "../proposal/stages";

interface TimelockOperationContentProps {
  /** Transaction hash to track */
  txHash: string;
}

/**
 * Reusable content for displaying timelock operation tracking
 * Used by both TimelockOperationTracker (button-triggered) and DeepLinkHandler (URL-triggered)
 */
export function TimelockOperationContent({
  txHash,
}: TimelockOperationContentProps) {
  const {
    operations,
    selectedOperation,
    stages,
    isLoading,
    isParsing,
    error,
    selectOperation,
    refetch,
  } = useTimelockOperation({
    txHash,
    enabled: true,
  });

  // Auto-select first operation if only one
  useEffect(() => {
    if (operations.length === 1 && !selectedOperation) {
      selectOperation(operations[0]);
    }
  }, [operations, selectedOperation, selectOperation]);

  if (isParsing) {
    return (
      <div className="p-6 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <ReloadIcon className="w-6 h-6 text-primary animate-spin" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Parsing Transaction</h3>
          <p className="text-sm text-muted-foreground">
            Looking for CallScheduled events...
          </p>
          <code className="text-xs text-muted-foreground block">
            {txHash.slice(0, 20)}...{txHash.slice(-8)}
          </code>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold">Error loading operation</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (operations.length === 0 && !isLoading) {
    return (
      <div className="p-6 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-yellow-100 dark:bg-yellow-900/50 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-yellow-600 dark:text-yellow-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold">No operations found</h3>
        <p className="text-sm text-muted-foreground">
          No CallScheduled events found in transaction{" "}
          <code className="px-1 py-0.5 bg-muted rounded text-xs">
            {txHash.slice(0, 10)}...{txHash.slice(-6)}
          </code>
        </p>
        <p className="text-xs text-muted-foreground">
          Make sure this transaction contains a timelock queue operation.
        </p>
      </div>
    );
  }

  // Operation selector (if multiple operations found)
  if (operations.length > 1 && !selectedOperation) {
    return (
      <div className="space-y-4 p-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold">Multiple Operations Found</h3>
          <p className="text-sm text-muted-foreground">
            Transaction contains {operations.length} operations. Select one to
            track:
          </p>
        </div>
        <OperationSelector operations={operations} onSelect={selectOperation} />
      </div>
    );
  }

  // Show lifecycle stages
  if (selectedOperation) {
    return (
      <div className="flex-1 overflow-y-auto space-y-4">
        <OperationHeader
          operation={selectedOperation}
          isLoading={isLoading}
          onRefresh={refetch}
        />

        {/* Operation Payload with decoded calldata */}
        <div className="glass rounded-xl p-4">
          <div className="mb-4 pb-3 border-b border-border/50">
            <h3 className="text-sm font-semibold">Operation Payload</h3>
          </div>
          <ActionView
            index={0}
            target={selectedOperation.target}
            value={selectedOperation.value}
            calldata={selectedOperation.data}
            governorAddress={selectedOperation.timelockAddress}
          />
        </div>

        <div className="glass rounded-xl p-4">
          <div className="mb-4 pb-3 border-b border-border/50">
            <h3 className="text-sm font-semibold">Operation Lifecycle</h3>
          </div>
          <StagesList
            stages={stages}
            isLoading={isLoading}
            operation={selectedOperation}
            onRefresh={refetch}
          />
        </div>
      </div>
    );
  }

  // Loading state (initial)
  return <LoadingSkeleton />;
}

interface OperationSelectorProps {
  operations: TimelockOperationInfo[];
  onSelect: (operation: TimelockOperationInfo) => void;
}

function OperationSelector({ operations, onSelect }: OperationSelectorProps) {
  return (
    <div className="space-y-2">
      {operations.map((op, idx) => (
        <button
          key={op.operationId}
          onClick={() => onSelect(op)}
          className="w-full p-3 text-left rounded-lg glass-subtle hover:bg-muted/50 transition-all duration-200"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Operation {idx + 1}</span>
            <span className="text-xs text-muted-foreground font-mono">
              {formatAddress(op.operationId)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Target: {shortenAddress(op.target)}
          </div>
        </button>
      ))}
    </div>
  );
}

interface OperationHeaderProps {
  operation: TimelockOperationInfo;
  isLoading: boolean;
  onRefresh: () => void;
}

function OperationHeader({
  operation,
  isLoading,
  onRefresh,
}: OperationHeaderProps) {
  const arbiscanUrl = `https://arbiscan.io/tx/${operation.txHash}`;

  return (
    <div className="glass-subtle rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Operation Details</h4>
        <div className="flex items-center gap-2">
          <a
            href={arbiscanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            View on Arbiscan
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            {isLoading ? (
              <ReloadIcon className="h-4 w-4 animate-spin" />
            ) : (
              <ReloadIcon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-muted-foreground">Operation ID:</span>
          <p className="font-mono truncate" title={operation.operationId}>
            {formatAddress(operation.operationId)}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Target:</span>
          <p className="font-mono truncate" title={operation.target}>
            {shortenAddress(operation.target)}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Delay:</span>
          <p>{formatDelay(parseInt(operation.delay))}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Scheduled At:</span>
          <p>{new Date(operation.timestamp * 1000).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

// Stage durations in seconds for ETA calculations
const STAGE_DURATIONS: Partial<Record<StageType, number>> = {
  L2_TIMELOCK_EXECUTED: 0, // Uses operation delay
  L2_TO_L1_MESSAGE_SENT: 0, // Immediate
  L2_TO_L1_MESSAGE_CONFIRMED: 7 * 24 * 60 * 60, // ~7 days challenge period
  L1_TIMELOCK_QUEUED: 0, // Immediate after confirmation
  L1_TIMELOCK_EXECUTED: 3 * 24 * 60 * 60, // 3 days L1 timelock
  RETRYABLE_CREATED: 0, // Immediate
  RETRYABLE_REDEEMED: 0, // Near-immediate (auto-redeem)
};

// Timelock operation stage types (subset of proposal stages, starting from queued)
const TIMELOCK_STAGE_TYPES: StageType[] = [
  "PROPOSAL_QUEUED", // We reuse this for "CallScheduled"
  "L2_TIMELOCK_EXECUTED",
  "L2_TO_L1_MESSAGE_SENT",
  "L2_TO_L1_MESSAGE_CONFIRMED",
  "L1_TIMELOCK_QUEUED",
  "L1_TIMELOCK_EXECUTED",
  "RETRYABLE_CREATED",
  "RETRYABLE_REDEEMED",
];

interface StagesListProps {
  stages: ProposalStage[];
  isLoading: boolean;
  operation: TimelockOperationInfo;
  onRefresh: () => void;
}

function StagesList({
  stages,
  isLoading,
  operation,
  onRefresh,
}: StagesListProps) {
  const stageMap = useMemo(() => {
    const map = new Map<StageType, ProposalStage>();
    for (const stage of stages) {
      map.set(stage.type, stage);
    }
    return map;
  }, [stages]);

  // Determine which stages to show based on what has been tracked
  const l2Executed = stageMap.get("L2_TIMELOCK_EXECUTED");
  const l2ToL1Sent = stageMap.get("L2_TO_L1_MESSAGE_SENT");

  // Get stage metadata for calculating ETAs
  const allStageMetadata = useMemo(() => getAllStageMetadata("core"), []);

  // Show all stages by default (like the regular lifecycle tracker)
  // Only hide crosschain stages if L2 execution is complete AND confirmed no L2→L1 path
  const relevantStageTypes = useMemo(() => {
    return TIMELOCK_STAGE_TYPES.filter((type) => {
      const idx = TIMELOCK_STAGE_TYPES.indexOf(type);

      // Always show the first two stages (CallScheduled, L2 Timelock Executed)
      if (idx <= 1) return true;

      // If L2 execution is complete AND no L2→L1 message was sent, hide crosschain stages
      // This means it was an L2-only operation
      if (l2Executed?.status === "COMPLETED" && !l2ToL1Sent && idx > 1) {
        return false;
      }

      // Show all crosschain stages otherwise (before L2 execution, or if there's an L2→L1 path)
      return true;
    });
  }, [l2Executed, l2ToL1Sent]);

  // Build stage metadata with estimated durations
  const relevantStages = useMemo(() => {
    return relevantStageTypes.map((type) => {
      const meta = allStageMetadata.find((m) => m.type === type);
      return {
        type,
        estimatedDuration: meta?.estimatedDuration,
      };
    });
  }, [relevantStageTypes, allStageMetadata]);

  // Calculate estimated completion times for each stage
  const estimatedTimes = useMemo(() => {
    const times = new Map<StageType, EstimatedTimeRange>();
    const operationDelay = parseInt(operation.delay);
    const scheduledTimestamp = operation.timestamp;

    // Find the last completed stage as reference point
    let referenceTimestamp = scheduledTimestamp;
    let startFromIndex = 0;

    for (let i = relevantStageTypes.length - 1; i >= 0; i--) {
      const stageType = relevantStageTypes[i];
      const stage = stageMap.get(stageType);

      if (stage?.status === "COMPLETED" && stage.transactions?.[0]?.timestamp) {
        referenceTimestamp = stage.transactions[0].timestamp;
        startFromIndex = i + 1;
        break;
      }
    }

    // Calculate cumulative times for future stages
    let cumulativeSeconds = 0;

    for (let i = startFromIndex; i < relevantStageTypes.length; i++) {
      const stageType = relevantStageTypes[i];
      const stage = stageMap.get(stageType);

      // Skip completed stages
      if (stage?.status === "COMPLETED") continue;

      // Get duration for this stage
      let duration = STAGE_DURATIONS[stageType] || 0;

      // L2 Timelock uses the operation's specific delay
      if (stageType === "L2_TIMELOCK_EXECUTED" && i === 1) {
        duration = operationDelay;
      }

      cumulativeSeconds += duration;

      const estimatedTime = new Date(
        (referenceTimestamp + cumulativeSeconds) * 1000
      );

      times.set(stageType, {
        minDate: estimatedTime,
        maxDate: estimatedTime,
      });
    }

    return times;
  }, [operation, relevantStageTypes, stageMap]);

  // Refresh handler for StageItem (refreshes from a specific stage index)
  const handleRefreshFromStage = useCallback(
    (_index: number) => {
      onRefresh();
    },
    [onRefresh]
  );

  // Find current stage index for tracking indicator
  const currentStageIndex = useMemo(() => {
    for (let i = relevantStageTypes.length - 1; i >= 0; i--) {
      const stage = stageMap.get(relevantStageTypes[i]);
      if (stage?.status === "COMPLETED") {
        return i;
      }
    }
    return -1;
  }, [relevantStageTypes, stageMap]);

  if (stages.length === 0 && isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="relative">
      {relevantStages.map((meta, idx) => {
        const stage = stageMap.get(meta.type);
        const isTrackingThis = isLoading && idx === currentStageIndex + 1;
        const estimatedCompletion = estimatedTimes.get(meta.type);

        return (
          <StageItem
            key={meta.type}
            stage={stage}
            stageType={meta.type}
            stageIndex={idx}
            isLast={idx === relevantStages.length - 1}
            isTracking={isTrackingThis}
            isLoading={isLoading}
            isRefreshing={false}
            onRefresh={handleRefreshFromStage}
            estimatedCompletion={estimatedCompletion}
            votingTimeRange={null}
            governorType="core"
            proposalId={operation.operationId}
            governorAddress={operation.timelockAddress}
          />
        );
      })}
    </div>
  );
}

function formatDelay(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);

  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""}${hours > 0 ? `, ${hours} hr${hours > 1 ? "s" : ""}` : ""}`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""}`;
  }
  return `${seconds} seconds`;
}
