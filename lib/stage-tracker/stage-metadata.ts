import {
  L1_TIMELOCK,
  L2_CORE_TIMELOCK,
  L2_TREASURY_TIMELOCK,
} from "@/config/arbitrum-governance";
import type { StageType } from "@/types/proposal-stage";

export interface StageMetadata {
  type: StageType;
  title: string;
  description: string;
  chain: "L1" | "L2" | "Cross-chain";
  estimatedDuration?: string;
}

/**
 * Base stage metadata without duration (duration depends on governor type)
 */
const BASE_STAGE_METADATA: Omit<StageMetadata, "estimatedDuration">[] = [
  {
    type: "PROPOSAL_CREATED",
    title: "Proposal Created",
    description: "Proposal submitted to the Governor contract",
    chain: "L2",
  },
  {
    type: "VOTING_ACTIVE",
    title: "Voting",
    description: "Token holders vote on the proposal",
    chain: "L2",
  },
  {
    type: "PROPOSAL_QUEUED",
    title: "Queued in L2 Timelock",
    description: "Proposal queued in the L2 Timelock",
    chain: "L2",
  },
  {
    type: "L2_TIMELOCK_EXECUTED",
    title: "L2 Timelock Executed",
    description: "Timelock delay passed, execution triggers L2→L1 message",
    chain: "L2",
  },
  {
    type: "L2_TO_L1_MESSAGE_SENT",
    title: "L2→L1 Message Sent",
    description: "Cross-chain message initiated from Arbitrum to Ethereum",
    chain: "Cross-chain",
  },
  {
    type: "L2_TO_L1_MESSAGE_CONFIRMED",
    title: "L2→L1 Message Confirmed",
    description: "Challenge period completed, message ready for L1 execution",
    chain: "Cross-chain",
  },
  {
    type: "L1_TIMELOCK_QUEUED",
    title: "Queued in L1 Timelock",
    description: "Scheduled on Ethereum L1 Timelock",
    chain: "L1",
  },
  {
    type: "L1_TIMELOCK_EXECUTED",
    title: "L1 Timelock Executed",
    description: "Executed on Ethereum mainnet",
    chain: "L1",
  },
  {
    type: "RETRYABLE_CREATED",
    title: "Retryable Ticket Created",
    description: "L1→L2 retryable ticket created (if proposal targets L2)",
    chain: "Cross-chain",
  },
  {
    type: "RETRYABLE_REDEEMED",
    title: "Retryable Redeemed",
    description: "Final execution on L2 complete",
    chain: "L2",
  },
];

/**
 * Voting duration is the same for both governors
 */
const VOTING_DURATION = "14-16 days";

/**
 * Challenge period duration (~7 days based on CHALLENGE_PERIOD_L1_BLOCKS)
 */
const CHALLENGE_PERIOD_DURATION = "~7 days";

/**
 * Get estimated duration for a stage based on governor type
 * Durations are read from config (L2_CORE_TIMELOCK, L2_TREASURY_TIMELOCK, L1_TIMELOCK)
 */
function getEstimatedDuration(
  type: StageType,
  governorType?: "core" | "treasury"
): string | undefined {
  switch (type) {
    case "VOTING_ACTIVE":
      return VOTING_DURATION;
    case "L2_TIMELOCK_EXECUTED":
      // Core Governor uses L2_CORE_TIMELOCK (8 days), Treasury uses L2_TREASURY_TIMELOCK (3 days)
      return governorType === "treasury"
        ? L2_TREASURY_TIMELOCK.delay
        : L2_CORE_TIMELOCK.delay;
    case "L2_TO_L1_MESSAGE_CONFIRMED":
      return CHALLENGE_PERIOD_DURATION;
    case "L1_TIMELOCK_EXECUTED":
      return L1_TIMELOCK.delay;
    default:
      return undefined;
  }
}

/**
 * Get stage metadata with estimated duration based on governor type
 * @param type - The stage type
 * @param governorType - Optional governor type to determine L2 timelock duration
 */
export function getStageMetadata(
  type: StageType,
  governorType?: "core" | "treasury"
): StageMetadata | undefined {
  const base = BASE_STAGE_METADATA.find((s) => s.type === type);
  if (!base) return undefined;

  const estimatedDuration = getEstimatedDuration(type, governorType);
  return estimatedDuration ? { ...base, estimatedDuration } : { ...base };
}

export function getAllStageMetadata(
  governorType: "core" | "treasury" = "core"
): StageMetadata[] {
  return BASE_STAGE_METADATA.map((base) => {
    const estimatedDuration = getEstimatedDuration(base.type, governorType);
    return estimatedDuration ? { ...base, estimatedDuration } : { ...base };
  });
}

/** @deprecated Use getAllStageMetadata(governorType) instead */
export const STAGE_METADATA: StageMetadata[] = getAllStageMetadata("core");
