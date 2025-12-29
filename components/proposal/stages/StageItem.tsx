"use client";

import {
  formatEstimatedCompletion,
  type EstimatedTimeRange,
} from "@/lib/date-utils";
import { getStageMetadata } from "@/lib/incremental-stage-tracker";
import { cn } from "@/lib/utils";
import type { ProposalStage, StageType } from "@/types/proposal-stage";
import { CalendarIcon, ReloadIcon } from "@radix-ui/react-icons";

import { createStageCalendarUrl, type VotingTimeRange } from "./stage-utils";
import { StageDataDisplay } from "./StageDataDisplay";
import { StatusIcon } from "./StatusIcon";
import { TransactionsList } from "./TransactionsList";
import { VotingStageContent } from "./VotingStageContent";

export interface StageItemProps {
  stage?: ProposalStage;
  stageType: StageType;
  stageIndex: number;
  isLast: boolean;
  isTracking: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: (index: number) => void;
  estimatedCompletion?: EstimatedTimeRange;
  votingTimeRange?: VotingTimeRange | null;
  governorType: "core" | "treasury";
  proposalId: string;
  governorAddress: string;
}

export function StageItem({
  stage,
  stageType,
  stageIndex,
  isLast,
  isTracking,
  isLoading,
  isRefreshing,
  onRefresh,
  estimatedCompletion,
  votingTimeRange,
  governorType,
  proposalId,
  governorAddress,
}: StageItemProps) {
  const metadata = getStageMetadata(stageType, governorType);
  const status = stage?.status || "NOT_STARTED";
  const isActive = isTracking && !stage;
  const canRefresh = Boolean(stage && !isLoading);

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
        {isActive || isRefreshing ? (
          <ReloadIcon className="h-5 w-5 text-blue-500 animate-spin" />
        ) : (
          <StatusIcon status={status} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-6">
        <StageHeader
          metadata={metadata}
          stageType={stageType}
          status={status}
          isRefreshing={isRefreshing}
          canRefresh={canRefresh}
          stageIndex={stageIndex}
          onRefresh={onRefresh}
        />

        <p className="text-xs text-muted-foreground mt-0.5">
          {metadata?.description}
        </p>

        {/* Voting stage specific content */}
        {stageType === "VOTING_ACTIVE" && (
          <VotingStageContent
            stage={stage}
            votingTimeRange={votingTimeRange}
            estimatedCompletion={estimatedCompletion}
            metadata={metadata}
            stageType={stageType}
            proposalId={proposalId}
            governorAddress={governorAddress}
          />
        )}

        {/* Estimated completion for non-voting stages */}
        {status !== "COMPLETED" &&
          stageType !== "VOTING_ACTIVE" &&
          (estimatedCompletion || metadata?.estimatedDuration) && (
            <EstimatedCompletionDisplay
              metadata={metadata}
              estimatedCompletion={estimatedCompletion}
              stageType={stageType}
              proposalId={proposalId}
            />
          )}

        {/* Transactions */}
        {stage?.transactions && stage.transactions.length > 0 && (
          <TransactionsList transactions={stage.transactions} />
        )}

        {/* Stage data */}
        {stage?.data && <StageDataDisplay data={stage.data} />}
      </div>
    </div>
  );
}

interface StageHeaderProps {
  metadata?: {
    title: string;
    description: string;
    chain: string;
    estimatedDuration?: string;
  } | null;
  stageType: StageType;
  status: string;
  isRefreshing: boolean;
  canRefresh: boolean;
  stageIndex: number;
  onRefresh: (index: number) => void;
}

function StageHeader({
  metadata,
  stageType,
  status,
  isRefreshing,
  canRefresh,
  stageIndex,
  onRefresh,
}: StageHeaderProps) {
  return (
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
      {isRefreshing && (
        <span className="text-xs text-blue-500 animate-pulse">
          Refreshing...
        </span>
      )}
      {canRefresh && (
        <button
          onClick={() => onRefresh(stageIndex)}
          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Re-track from this stage"
        >
          <ReloadIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

interface EstimatedCompletionDisplayProps {
  metadata?: {
    title: string;
    description: string;
    chain: string;
    estimatedDuration?: string;
  } | null;
  estimatedCompletion?: EstimatedTimeRange;
  stageType: StageType;
  proposalId: string;
}

function EstimatedCompletionDisplay({
  metadata,
  estimatedCompletion,
  stageType,
  proposalId,
}: EstimatedCompletionDisplayProps) {
  return (
    <div className="text-xs text-muted-foreground mt-1 italic space-y-0.5">
      {metadata?.estimatedDuration && (
        <p>Est. duration: {metadata.estimatedDuration}</p>
      )}
      {estimatedCompletion && (
        <p className="text-blue-600 dark:text-blue-400 flex items-center gap-1.5 not-italic">
          <span>
            Est. completion: {formatEstimatedCompletion(estimatedCompletion)}
          </span>
          <a
            href={createStageCalendarUrl(
              metadata?.title || stageType,
              estimatedCompletion,
              proposalId
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            title="Add to Google Calendar"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
          </a>
        </p>
      )}
    </div>
  );
}
