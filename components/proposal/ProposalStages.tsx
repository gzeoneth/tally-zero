"use client";

import { Button } from "@/components/ui/Button";
import {
  getAllStageTypes,
  useProposalStages,
} from "@/hooks/use-proposal-stages";
import { getStageMetadata } from "@/lib/incremental-stage-tracker";
import { cn } from "@/lib/utils";
import type {
  ProposalStage,
  StageStatus,
  StageType,
} from "@/types/proposal-stage";
import {
  CheckCircledIcon,
  CircleIcon,
  CrossCircledIcon,
  DotsHorizontalIcon,
  ExternalLinkIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";

interface ProposalStagesProps {
  proposalId: string;
  creationTxHash: string;
  governorAddress: string;
  l1RpcUrl?: string;
}

function getExplorerUrl(hash: string, chain: "L1" | "L2"): string {
  return chain === "L1"
    ? `https://etherscan.io/tx/${hash}`
    : `https://arbiscan.io/tx/${hash}`;
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
}

function formatEta(eta?: string): string {
  if (!eta) return "";
  const timestamp = parseInt(eta, 10);
  if (isNaN(timestamp)) return "";
  const date = new Date(timestamp * 1000);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusIcon({ status }: { status: StageStatus }) {
  switch (status) {
    case "COMPLETED":
      return <CheckCircledIcon className="h-5 w-5 text-green-500" />;
    case "PENDING":
      return (
        <DotsHorizontalIcon className="h-5 w-5 text-yellow-500 animate-pulse" />
      );
    case "FAILED":
      return <CrossCircledIcon className="h-5 w-5 text-red-500" />;
    case "NOT_STARTED":
    default:
      return <CircleIcon className="h-5 w-5 text-muted-foreground" />;
  }
}

function StageItem({
  stage,
  stageType,
  isLast,
  isTracking,
}: {
  stage?: ProposalStage;
  stageType: StageType;
  isLast: boolean;
  isTracking: boolean;
}) {
  const metadata = getStageMetadata(stageType);
  const status = stage?.status || "NOT_STARTED";
  const isActive = isTracking && !stage;

  return (
    <div className="relative flex gap-4">
      {/* Timeline line */}
      {!isLast && (
        <div
          className={cn(
            "absolute left-[10px] top-7 w-0.5 h-[calc(100%-12px)]",
            status === "COMPLETED" ? "bg-green-500" : "bg-muted"
          )}
        />
      )}

      {/* Status icon */}
      <div className="relative z-10 flex-shrink-0 mt-0.5">
        {isActive ? (
          <ReloadIcon className="h-5 w-5 text-blue-500 animate-spin" />
        ) : (
          <StatusIcon status={status} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-6">
        <div className="flex items-center gap-2">
          <h4
            className={cn(
              "text-sm font-medium",
              status === "COMPLETED"
                ? "text-foreground"
                : status === "PENDING"
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-muted-foreground"
            )}
          >
            {metadata?.title || stageType}
          </h4>
          <span
            className={cn(
              "text-xs px-1.5 py-0.5 rounded",
              metadata?.chain === "L1"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                : metadata?.chain === "L2"
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
                  : "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300"
            )}
          >
            {metadata?.chain}
          </span>
        </div>

        <p className="text-xs text-muted-foreground mt-0.5">
          {metadata?.description}
        </p>

        {metadata?.estimatedDuration && status !== "COMPLETED" && (
          <p className="text-xs text-muted-foreground mt-1 italic">
            Est. duration: {metadata.estimatedDuration}
          </p>
        )}

        {/* Transactions */}
        {stage?.transactions && stage.transactions.length > 0 && (
          <div className="mt-2 space-y-1">
            {stage.transactions.slice(0, 3).map((tx, idx) => (
              <div
                key={`${tx.hash}-${idx}`}
                className="flex items-center gap-2 text-xs"
              >
                <a
                  href={getExplorerUrl(tx.hash, tx.chain)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
                  <ExternalLinkIcon className="h-3 w-3" />
                </a>
                {tx.timestamp && (
                  <span className="text-muted-foreground">
                    {formatTimestamp(tx.timestamp)}
                  </span>
                )}
              </div>
            ))}
            {stage.transactions.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{stage.transactions.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Stage data */}
        {stage?.data && (
          <div className="mt-2 text-xs">
            {"eta" in stage.data && stage.data.eta ? (
              <p className="text-muted-foreground">
                ETA: {formatEta(String(stage.data.eta))}
              </p>
            ) : null}
            {"forVotes" in stage.data && stage.data.forVotes ? (
              <div className="flex gap-3 mt-1">
                <span className="text-green-600 dark:text-green-400">
                  For:{" "}
                  {parseFloat(String(stage.data.forVotes)).toLocaleString()}
                </span>
                <span className="text-red-600 dark:text-red-400">
                  Against:{" "}
                  {parseFloat(String(stage.data.againstVotes)).toLocaleString()}
                </span>
                <span className="text-muted-foreground">
                  Abstain:{" "}
                  {parseFloat(String(stage.data.abstainVotes)).toLocaleString()}
                </span>
              </div>
            ) : null}
            {"note" in stage.data && stage.data.note ? (
              <p className="text-muted-foreground italic">
                {String(stage.data.note)}
              </p>
            ) : null}
            {"message" in stage.data &&
            stage.data.message &&
            !("note" in stage.data && stage.data.note) ? (
              <p className="text-muted-foreground italic">
                {String(stage.data.message)}
              </p>
            ) : null}
            {"retryableCount" in stage.data && stage.data.retryableCount ? (
              <p className="text-muted-foreground">
                Retryable tickets: {Number(stage.data.retryableCount)}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="w-5 h-5 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 bg-muted rounded animate-pulse" />
            <div className="h-3 w-48 bg-muted rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProposalStages({
  proposalId,
  creationTxHash,
  governorAddress,
  l1RpcUrl,
}: ProposalStagesProps) {
  const {
    stages,
    currentStageIndex,
    isLoading,
    isComplete,
    error,
    result,
    refetch,
  } = useProposalStages({
    proposalId,
    creationTxHash,
    governorAddress,
    enabled: true,
    l1RpcUrl,
  });

  const allStageTypes = getAllStageTypes();
  const stageMap = new Map<StageType, ProposalStage>();
  for (const stage of stages) {
    stageMap.set(stage.type, stage);
  }

  const lastTrackedIndex =
    stages.length > 0
      ? allStageTypes.findIndex(
          (s) => s.type === stages[stages.length - 1]?.type
        )
      : -1;

  const stagesToShow =
    lastTrackedIndex >= 0
      ? allStageTypes.slice(0, Math.max(lastTrackedIndex + 2, 4))
      : allStageTypes.slice(0, 4);

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-red-500 mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={refetch}>
          <ReloadIcon className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (stages.length === 0 && isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">Governance Lifecycle</h3>
          {result?.currentState && (
            <p className="text-xs text-muted-foreground">
              Current state: {result.currentState}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refetch}
          disabled={isLoading}
        >
          <ReloadIcon className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </Button>
      </div>

      {/* Timeline */}
      <div className="relative">
        {stagesToShow.map((meta, idx) => {
          const stage = stageMap.get(meta.type);
          const isTrackingThis =
            isLoading && !isComplete && idx === currentStageIndex + 1;

          return (
            <StageItem
              key={meta.type}
              stage={stage}
              stageType={meta.type}
              isLast={idx === stagesToShow.length - 1}
              isTracking={isTrackingThis}
            />
          );
        })}
      </div>

      {/* Show more stages hint if not complete */}
      {!isComplete && lastTrackedIndex < allStageTypes.length - 1 && (
        <p className="text-xs text-muted-foreground text-center mt-2">
          {isLoading
            ? "Tracking additional stages..."
            : `${allStageTypes.length - lastTrackedIndex - 1} more stages in full lifecycle`}
        </p>
      )}
    </div>
  );
}
