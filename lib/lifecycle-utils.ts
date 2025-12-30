import { isCoreGovernor } from "@/config/governors";
import type { ProposalStage } from "@/types/proposal-stage";

export function formatStageName(stageName: string): string {
  return stageName
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Get the total expected stages for a proposal based on governor type
 * - Core Governor: 10 stages (includes L1 round-trip)
 * - Treasury Governor: 4 stages (L2 only)
 */
export function getTotalStages(governorAddress: string): number {
  return isCoreGovernor(governorAddress) ? 10 : 4;
}

/**
 * Determine the current active stage (1-indexed) from the stages array
 */
export function getCurrentStageNumber(stages: ProposalStage[]): number {
  if (!stages || stages.length === 0) return 0;

  // Find the last stage that isn't NOT_STARTED
  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].status !== "NOT_STARTED") {
      return i + 1; // 1-indexed
    }
  }
  return 1;
}

/**
 * Check if a proposal has truly completed all stages
 */
export function isProposalFullyExecuted(
  stages: ProposalStage[],
  governorAddress: string
): boolean {
  const totalExpected = getTotalStages(governorAddress);
  if (stages.length < totalExpected) return false;

  // For Core Governor, check if the last stage (RETRYABLE_REDEEMED or L1_TIMELOCK_EXECUTED) is COMPLETED
  const lastStage = stages[stages.length - 1];
  return lastStage?.status === "COMPLETED";
}

/**
 * Get the effective display state for a proposal
 * For Core Governor proposals that show "Executed" but haven't completed L1 stages,
 * returns "Stage x/y" instead
 */
export function getEffectiveDisplayState(
  governorState: string | null,
  stages: ProposalStage[],
  governorAddress: string
): { display: string; isInProgress: boolean } {
  // If not "Executed", return the governor state as-is
  if (governorState?.toLowerCase() !== "executed") {
    return { display: formatCurrentState(governorState), isInProgress: false };
  }

  // For Treasury Governor, "Executed" is accurate after L2 timelock
  if (!isCoreGovernor(governorAddress)) {
    return { display: "Executed", isInProgress: false };
  }

  // For Core Governor, check if truly completed
  if (isProposalFullyExecuted(stages, governorAddress)) {
    return { display: "Executed", isInProgress: false };
  }

  // Core Governor with "Executed" state but not fully done - show stage progress
  const currentStage = getCurrentStageNumber(stages);
  const totalStages = getTotalStages(governorAddress);
  return {
    display: `Stage ${currentStage}/${totalStages}`,
    isInProgress: true,
  };
}

export function formatCurrentState(state: string | null): string {
  if (!state) return "Unknown";

  const stateMap: Record<string, string> = {
    active: "Active",
    pending: "Pending",
    succeeded: "Passed",
    defeated: "Defeated",
    queued: "Queued",
    executed: "Executed",
    canceled: "Canceled",
    expired: "Expired",
  };

  const normalized = state.toLowerCase();
  return stateMap[normalized] || state;
}

export type StateStyleColor =
  | "text-green-600 dark:text-green-400"
  | "text-blue-600 dark:text-blue-400"
  | "text-yellow-600 dark:text-yellow-400"
  | "text-red-600 dark:text-red-400"
  | "text-muted-foreground";

export type StateStyleIcon = "check" | "reload" | "clock" | "cross";

export function getStateStyle(state: string | null): {
  icon: StateStyleIcon;
  color: StateStyleColor;
} {
  const normalizedState = state?.toLowerCase();

  switch (normalizedState) {
    case "executed":
      return {
        icon: "check",
        color: "text-green-600 dark:text-green-400",
      };
    case "active":
    case "pending":
      return {
        icon: "reload",
        color: "text-blue-600 dark:text-blue-400",
      };
    case "queued":
    case "succeeded":
      return {
        icon: "clock",
        color: "text-yellow-600 dark:text-yellow-400",
      };
    case "defeated":
    case "canceled":
    case "expired":
      return {
        icon: "cross",
        color: "text-red-600 dark:text-red-400",
      };
    default:
      return {
        icon: "clock",
        color: "text-muted-foreground",
      };
  }
}
