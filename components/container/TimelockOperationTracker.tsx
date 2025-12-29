"use client";

import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useTimelockOperation } from "@/hooks/use-timelock-operation";
import { type EstimatedTimeRange } from "@/lib/date-utils";
import { shortenAddress } from "@/lib/format-utils";
import { getAllStageMetadata } from "@/lib/incremental-stage-tracker";
import type { TimelockOperationInfo } from "@/lib/stage-tracker/timelock-operation-tracker";
import { formatAddress } from "@/lib/utils";
import type { ProposalStage, StageType } from "@/types/proposal-stage";
import {
  ExternalLinkIcon,
  MagnifyingGlassIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { useCallback, useMemo, useState } from "react";

import { ActionView } from "../payload/ActionView";
import { LoadingSkeleton, StageItem } from "../proposal/stages";

interface TimelockOperationTrackerProps {
  defaultTxHash?: string;
}

export function TimelockOperationTracker({
  defaultTxHash = "",
}: TimelockOperationTrackerProps) {
  const [txHashInput, setTxHashInput] = useState(defaultTxHash);
  const [activeTxHash, setActiveTxHash] = useState("");
  const [isOpen, setIsOpen] = useState(false);

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
    txHash: activeTxHash,
    enabled: activeTxHash.length > 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (txHashInput && /^0x[a-fA-F0-9]{64}$/.test(txHashInput)) {
      setActiveTxHash(txHashInput);
    }
  };

  const handleClear = () => {
    setTxHashInput("");
    setActiveTxHash("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <MagnifyingGlassIcon className="mr-2 h-4 w-4" />
          Track Timelock Operation
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Timelock Operation Tracker</DialogTitle>
          <DialogDescription>
            Enter a transaction hash containing a CallScheduled event to track
            its lifecycle through the Arbitrum governance system.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="txHash">Transaction Hash</Label>
            <div className="flex gap-2">
              <Input
                id="txHash"
                type="text"
                placeholder="0x..."
                value={txHashInput}
                onChange={(e) => setTxHashInput(e.target.value)}
                className="font-mono text-sm"
              />
              <Button type="submit" disabled={isParsing || !txHashInput}>
                {isParsing ? (
                  <ReloadIcon className="h-4 w-4 animate-spin" />
                ) : (
                  "Track"
                )}
              </Button>
              {activeTxHash && (
                <Button type="button" variant="outline" onClick={handleClear}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </form>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Operation selector (if multiple operations found) */}
        {operations.length > 1 && !selectedOperation && (
          <OperationSelector
            operations={operations}
            onSelect={selectOperation}
          />
        )}

        {/* Lifecycle stages */}
        {selectedOperation && (
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
        )}
      </DialogContent>
    </Dialog>
  );
}

interface OperationSelectorProps {
  operations: TimelockOperationInfo[];
  onSelect: (operation: TimelockOperationInfo) => void;
}

function OperationSelector({ operations, onSelect }: OperationSelectorProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">
        Found {operations.length} operations. Select one to track:
      </p>
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
