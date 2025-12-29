"use client";

import { TopDelegatesNotVoted } from "@/components/proposal/TopDelegatesNotVoted";
import { Badge } from "@/components/ui/Badge";
import {
  formatDateRange,
  formatDateShort,
  formatEstimatedCompletion,
  type EstimatedTimeRange,
} from "@/lib/date-utils";
import type { ProposalStage, StageType } from "@/types/proposal-stage";
import { CalendarIcon } from "@radix-ui/react-icons";

import { QuorumProgressBar } from "./QuorumProgressBar";
import { createStageCalendarUrl, type VotingTimeRange } from "./stage-utils";
import { VoteDistributionBar } from "./VoteDistributionBar";

export interface VotingStageContentProps {
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

export function VotingStageContent({
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
