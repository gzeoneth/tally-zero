"use client";

import { TopDelegatesNotVoted } from "@/components/proposal/TopDelegatesNotVoted";
import { Badge } from "@/components/ui/Badge";
import {
  formatDateRange,
  formatDateShort,
  formatEstimatedCompletion,
  formatEtaTimestamp,
  formatRelativeTimestamp,
  type EstimatedTimeRange,
} from "@/lib/date-utils";
import { getStageMetadata } from "@/lib/incremental-stage-tracker";
import { cn } from "@/lib/utils";
import type { ProposalStage, StageType } from "@/types/proposal-stage";
import {
  CalendarIcon,
  ExternalLinkIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";

import { QuorumProgressBar } from "./QuorumProgressBar";
import {
  createStageCalendarUrl,
  getStageTxExplorerUrl,
  type VotingTimeRange,
} from "./stage-utils";
import { StatusIcon } from "./StatusIcon";
import { VoteDistributionBar } from "./VoteDistributionBar";

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

/**
 * Single stage item in the proposal lifecycle timeline
 */
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
  const canRefresh = stage && !isLoading;

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
            <div className="text-xs text-muted-foreground mt-1 italic space-y-0.5">
              {metadata?.estimatedDuration && (
                <p>Est. duration: {metadata.estimatedDuration}</p>
              )}
              {estimatedCompletion && (
                <p className="text-blue-600 dark:text-blue-400 flex items-center gap-1.5 not-italic">
                  <span>
                    Est. completion:{" "}
                    {formatEstimatedCompletion(estimatedCompletion)}
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

interface VotingStageContentProps {
  stage?: ProposalStage;
  votingTimeRange?: VotingTimeRange | null;
  estimatedCompletion?: EstimatedTimeRange;
  metadata?: {
    title: string;
    description: string;
    chain: string;
    estimatedDuration?: string;
  } | null;
  stageType: StageType;
  proposalId: string;
  governorAddress: string;
}

function VotingStageContent({
  stage,
  votingTimeRange,
  estimatedCompletion,
  metadata,
  stageType,
  proposalId,
  governorAddress,
}: VotingStageContentProps) {
  return (
    <div className="mt-3 space-y-3">
      {votingTimeRange && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">
              Voting Period
            </span>
            <span className="text-foreground">
              {formatDateShort(votingTimeRange.votingStartDate)} →{" "}
              {stage?.data?.extensionPossible === false
                ? formatDateShort(votingTimeRange.votingEndMaxDate)
                : formatDateRange(
                    votingTimeRange.votingEndMinDate,
                    votingTimeRange.votingEndMaxDate
                  )}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Boolean(stage?.data?.quorumReached) && (
              <Badge
                variant="secondary"
                className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 text-xs py-0 px-1.5"
              >
                Quorum Reached
              </Badge>
            )}
            {Boolean(stage?.data?.wasExtended) && (
              <Badge
                variant="secondary"
                className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 text-xs py-0 px-1.5"
              >
                Extended
              </Badge>
            )}
            {Boolean(
              stage?.data?.extensionPossible !== false &&
                !stage?.data?.wasExtended
            ) && (
              <Badge variant="outline" className="text-xs py-0 px-1.5">
                +2d extension possible
              </Badge>
            )}
          </div>
        </div>
      )}

      <TopDelegatesNotVoted
        proposalId={proposalId}
        governorAddress={governorAddress}
      />

      {Boolean(stage?.data?.quorumRequired) && (
        <QuorumProgressBar
          current={String(stage?.data?.votesTowardsQuorum ?? "0")}
          required={String(stage?.data?.quorumRequired)}
          reached={Boolean(stage?.data?.quorumReached)}
        />
      )}

      {Boolean(stage?.data?.forVotes) && (
        <VoteDistributionBar
          forVotes={String(stage?.data?.forVotes)}
          againstVotes={String(stage?.data?.againstVotes ?? "0")}
          abstainVotes={String(stage?.data?.abstainVotes ?? "0")}
        />
      )}

      {estimatedCompletion && (
        <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
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
        </div>
      )}
    </div>
  );
}

interface TransactionsListProps {
  transactions: Array<{
    hash: string;
    chain: "L1" | "L2";
    timestamp?: number;
  }>;
}

function TransactionsList({ transactions }: TransactionsListProps) {
  return (
    <div className="mt-2 space-y-1">
      {transactions.map((tx, idx) => (
        <div
          key={`${tx.hash}-${idx}`}
          className="flex items-center gap-2 text-xs"
        >
          <a
            href={getStageTxExplorerUrl(tx.hash, tx.chain)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
          {tx.timestamp && (
            <span className="text-muted-foreground">
              {formatRelativeTimestamp(tx.timestamp)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

interface StageDataDisplayProps {
  data: Record<string, unknown>;
}

function StageDataDisplay({ data }: StageDataDisplayProps) {
  return (
    <div className="mt-2 text-xs">
      {"eta" in data && data.eta ? (
        <p className="text-muted-foreground">
          ETA: {formatEtaTimestamp(String(data.eta))}
        </p>
      ) : null}
      {"note" in data && data.note ? (
        <p className="text-muted-foreground italic">{String(data.note)}</p>
      ) : null}
      {"message" in data && data.message && !("note" in data && data.note) ? (
        <p className="text-muted-foreground italic">{String(data.message)}</p>
      ) : null}
      {"creationDetails" in data &&
      Array.isArray(data.creationDetails) &&
      data.creationDetails.length > 0 ? (
        <RetryableCreationDetails details={data.creationDetails} />
      ) : null}
      {"redemptionDetails" in data &&
      Array.isArray(data.redemptionDetails) &&
      data.redemptionDetails.length > 0 ? (
        <RetryableRedemptionDetails details={data.redemptionDetails} />
      ) : null}
    </div>
  );
}

interface RetryableCreationDetailsProps {
  details: Array<{
    index: number;
    targetChain: "Arb1" | "Nova";
    l2TxHash: string | null;
  }>;
}

function RetryableCreationDetails({ details }: RetryableCreationDetailsProps) {
  const createdCount = details.filter((d) => d.l2TxHash).length;

  return (
    <div className="space-y-1 mt-1">
      <p className="text-muted-foreground">
        Retryable tickets created: {createdCount}/{details.length}
      </p>
      {details
        .filter((d) => d.l2TxHash)
        .map((detail) => (
          <div
            key={`creation-${detail.index}`}
            className="flex items-center gap-2"
          >
            <span className="text-xs px-1 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
              {detail.targetChain}
            </span>
            <a
              href={getStageTxExplorerUrl(
                detail.l2TxHash!,
                "L2",
                detail.targetChain
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              {detail.l2TxHash!.slice(0, 10)}...
              {detail.l2TxHash!.slice(-8)}
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          </div>
        ))}
    </div>
  );
}

interface RetryableRedemptionDetailsProps {
  details: Array<{
    index: number;
    targetChain: "Arb1" | "Nova";
    status: string;
    l2TxHash: string | null;
  }>;
}

function RetryableRedemptionDetails({
  details,
}: RetryableRedemptionDetailsProps) {
  const redeemedCount = details.filter((d) => d.l2TxHash).length;

  return (
    <div className="space-y-1 mt-1">
      <p className="text-muted-foreground">
        Redemptions: {redeemedCount}/{details.length}
      </p>
      {details.map((detail) => (
        <div
          key={`redemption-${detail.index}`}
          className="flex items-center gap-2"
        >
          <span className="text-xs px-1 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
            {detail.targetChain}
          </span>
          {detail.l2TxHash ? (
            <a
              href={getStageTxExplorerUrl(
                detail.l2TxHash,
                "L2",
                detail.targetChain
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              {detail.l2TxHash.slice(0, 10)}...
              {detail.l2TxHash.slice(-8)}
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          ) : (
            <span className="text-muted-foreground">{detail.status}</span>
          )}
        </div>
      ))}
    </div>
  );
}
