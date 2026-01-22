import { L1_SECONDS_PER_BLOCK } from "@/config/arbitrum-governance";
import {
  createGoogleCalendarUrl,
  MS_PER_DAY,
  type EstimatedTimeRange,
} from "@/lib/date-utils";
import { getTxExplorerUrl, type ChainId } from "@/lib/explorer-utils";
import {
  getStageData,
  type ProposalStage,
  type StageType,
} from "@/types/proposal-stage";
import type { Chain } from "@gzeoneth/gov-tracker";

/**
 * Get the explorer URL for a transaction based on chain
 * Supports gov-tracker's Chain type ("ethereum", "arb1", "nova")
 */
export function getStageTxExplorerUrl(
  hash: string,
  chain: Chain,
  targetChain?: Chain
): string {
  // For cross-chain transactions (retryables), use targetChain if provided
  const effectiveChain = targetChain || chain;
  return getTxExplorerUrl(hash, effectiveChain as ChainId);
}

/**
 * Parse estimated duration string to min/max days
 */
export function parseEstimatedDurationRange(duration?: string): {
  min: number;
  max: number;
} {
  if (!duration) return { min: 0, max: 0 };

  // Remove ~ prefix if present
  const cleaned = duration.replace(/^~/, "").trim();

  // Check for range (e.g., "14-16 days")
  const rangeMatch = cleaned.match(/(\d+)-(\d+)\s*days?/i);
  if (rangeMatch) {
    return {
      min: parseInt(rangeMatch[1], 10),
      max: parseInt(rangeMatch[2], 10),
    };
  }

  // Check for single value (e.g., "3 days")
  const singleMatch = cleaned.match(/(\d+)\s*days?/i);
  if (singleMatch) {
    const days = parseInt(singleMatch[1], 10);
    return { min: days, max: days };
  }

  return { min: 0, max: 0 };
}

export const VOTING_EXTENSION_DAYS = 2;

export interface BlockBasedTiming {
  startBlock: number;
  endBlock: number;
  currentL1Block: number;
}

export interface VotingTimeRange {
  votingStartDate: Date;
  votingEndMinDate: Date;
  votingEndMaxDate: Date;
}

export interface EstimatedTimesResult {
  estimatedTimes: Map<StageType, EstimatedTimeRange>;
  votingTimeRange: VotingTimeRange | null;
}

interface StageMetaWithDuration {
  type: StageType;
  estimatedDuration?: string;
}

interface ReferencePoint {
  time: Date;
  startFromIndex: number;
}

/**
 * Find the last completed stage to use as reference point for time calculations
 */
function findReferencePoint(
  allStageTypes: StageMetaWithDuration[],
  stageMap: Map<StageType, ProposalStage>
): ReferencePoint {
  for (let i = allStageTypes.length - 1; i >= 0; i--) {
    const stage = stageMap.get(allStageTypes[i].type);
    if (stage?.status === "COMPLETED" && stage.transactions?.[0]?.timestamp) {
      return {
        time: new Date(stage.transactions[0].timestamp * 1000),
        startFromIndex: i + 1,
      };
    }
  }
  return { time: new Date(), startFromIndex: 0 };
}

interface VotingTimingParams {
  startBlock: number;
  endBlock: number;
  currentL1Block: number;
  extensionPossible: boolean;
  extendedDeadline: number | null;
  wasExtended: boolean;
}

/**
 * Calculate voting time range from L1 block data
 */
function calculateVotingTimeRange(
  params: VotingTimingParams
): { timing: BlockBasedTiming; range: VotingTimeRange } | null {
  const {
    startBlock,
    endBlock,
    currentL1Block,
    extensionPossible,
    extendedDeadline,
    wasExtended,
  } = params;

  if (isNaN(startBlock) || isNaN(endBlock)) return null;

  const now = Date.now();
  const blocksUntilStart = startBlock - currentL1Block;

  const actualEndBlock =
    wasExtended && extendedDeadline && !isNaN(extendedDeadline)
      ? extendedDeadline
      : endBlock;
  const blocksUntilEnd = actualEndBlock - currentL1Block;

  const votingStartMs = now + blocksUntilStart * L1_SECONDS_PER_BLOCK * 1000;
  const votingEndMinMs = now + blocksUntilEnd * L1_SECONDS_PER_BLOCK * 1000;
  const votingEndMaxMs = extensionPossible
    ? votingEndMinMs + VOTING_EXTENSION_DAYS * MS_PER_DAY
    : votingEndMinMs;

  return {
    timing: { startBlock, endBlock, currentL1Block },
    range: {
      votingStartDate: new Date(votingStartMs),
      votingEndMinDate: new Date(votingEndMinMs),
      votingEndMaxDate: new Date(votingEndMaxMs),
    },
  };
}

/**
 * Calculate estimated completion times for all stages
 */
export function calculateEstimatedCompletionTimes(
  allStageTypes: StageMetaWithDuration[],
  stageMap: Map<StageType, ProposalStage>,
  currentL1Block?: number
): EstimatedTimesResult {
  const estimatedTimes = new Map<StageType, EstimatedTimeRange>();

  const { time: referenceTime, startFromIndex } = findReferencePoint(
    allStageTypes,
    stageMap
  );

  // Extract stage data using type guards
  const proposalCreatedStage = stageMap.get("PROPOSAL_CREATED");
  const votingStage = stageMap.get("VOTING_ACTIVE");
  const proposalData = proposalCreatedStage
    ? getStageData(proposalCreatedStage, "PROPOSAL_CREATED")
    : null;
  const votingData = votingStage
    ? getStageData(votingStage, "VOTING_ACTIVE")
    : null;

  const extensionPossible = votingData?.extensionPossible !== false;
  const wasExtended = Boolean(votingData?.wasExtended);
  const extendedDeadline = votingData?.extendedDeadline
    ? Number(votingData.extendedDeadline)
    : null;

  // Calculate block-based voting timing if we have block data
  let votingResult: {
    timing: BlockBasedTiming;
    range: VotingTimeRange;
  } | null = null;
  if (currentL1Block && proposalData?.startBlock && proposalData?.endBlock) {
    votingResult = calculateVotingTimeRange({
      startBlock: Number(proposalData.startBlock),
      endBlock: Number(proposalData.endBlock),
      currentL1Block,
      extensionPossible,
      extendedDeadline,
      wasExtended,
    });
  }

  // Calculate cumulative time ranges for each pending stage
  let cumulativeMinMs = referenceTime.getTime();
  let cumulativeMaxMs = referenceTime.getTime();

  for (let i = startFromIndex; i < allStageTypes.length; i++) {
    const meta = allStageTypes[i];
    const stage = stageMap.get(meta.type);

    if (stage?.status === "COMPLETED") continue;

    if (meta.type === "VOTING_ACTIVE" && votingResult) {
      cumulativeMinMs = votingResult.range.votingEndMinDate.getTime();
      cumulativeMaxMs = votingResult.range.votingEndMaxDate.getTime();
      estimatedTimes.set(meta.type, {
        minDate: votingResult.range.votingEndMinDate,
        maxDate: votingResult.range.votingEndMaxDate,
      });
    } else {
      const durationRange = parseEstimatedDurationRange(meta.estimatedDuration);
      cumulativeMinMs += durationRange.min * MS_PER_DAY;
      cumulativeMaxMs += durationRange.max * MS_PER_DAY;

      if (meta.type === "VOTING_ACTIVE" && extensionPossible) {
        cumulativeMaxMs += VOTING_EXTENSION_DAYS * MS_PER_DAY;
      }

      estimatedTimes.set(meta.type, {
        minDate: new Date(cumulativeMinMs),
        maxDate: new Date(cumulativeMaxMs),
      });
    }
  }

  return { estimatedTimes, votingTimeRange: votingResult?.range ?? null };
}

/**
 * Create Google Calendar URL for a proposal stage
 */
export function createStageCalendarUrl(
  stageTitle: string,
  estimatedTime: EstimatedTimeRange,
  proposalId: string
): string {
  const details = `Estimated completion for proposal stage.\n\nProposal ID: ${proposalId}\nStage: ${stageTitle}\n\nView proposal at TallyZero`;
  return createGoogleCalendarUrl(
    `Arbitrum DAO: ${stageTitle}`,
    estimatedTime.minDate,
    details
  );
}
