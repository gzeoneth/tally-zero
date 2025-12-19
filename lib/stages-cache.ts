import { GOVERNORS, getFinalStageForGovernor } from "@/config/governors";
import {
  CACHE_VERSION,
  DEFAULT_CACHE_TTL_MS,
  STORAGE_KEYS,
} from "@/config/storage-keys";
import type {
  ProposalStage,
  ProposalTrackingResult,
} from "@/types/proposal-stage";

/** @deprecated Use GOVERNORS from @/config/governors instead */
export const CORE_GOVERNOR_ADDRESS = GOVERNORS.core.address.toLowerCase();
export const TREASURY_GOVERNOR_ADDRESS =
  GOVERNORS.treasury.address.toLowerCase();

/** @deprecated Use getFinalStageForGovernor from @/config/governors instead */
export const FINAL_STAGE_BY_GOVERNOR = {
  [CORE_GOVERNOR_ADDRESS]: GOVERNORS.core.finalStage,
  [TREASURY_GOVERNOR_ADDRESS]: GOVERNORS.treasury.finalStage,
};

// Time after proposal creation to stop tracking (60 days)
export const MAX_TRACKING_AGE_MS = 60 * 24 * 60 * 60 * 1000;

export interface CachedStagesResult {
  version: number;
  timestamp: number;
  result: ProposalTrackingResult;
}

export interface CacheLoadResult {
  result: ProposalTrackingResult | null;
  isExpired: boolean;
  isComplete: boolean;
}

export function getCacheKey(
  proposalId: string,
  governorAddress: string
): string {
  return `${STORAGE_KEYS.STAGES_CACHE_PREFIX}${governorAddress.toLowerCase()}-${proposalId}`;
}

export type CompletionStatus =
  | "pending"
  | "completed"
  | "failed"
  | "incomplete";

export function getCompletionStatus(
  stages: ProposalStage[],
  governorAddress: string
): CompletionStatus {
  if (!stages || stages.length === 0) return "pending";

  const lastStage = stages[stages.length - 1];

  // Failed proposals are complete (defeated, canceled, expired)
  if (lastStage.status === "FAILED") {
    return "failed";
  }

  // Check if we've reached the expected final stage for this governor
  const expectedFinalStage = getFinalStageForGovernor(governorAddress);

  if (!expectedFinalStage) {
    // Unknown governor - fall back to basic completion check
    return lastStage.status === "COMPLETED" ? "completed" : "incomplete";
  }

  // Check if the expected final stage exists and is COMPLETED
  const finalStage = stages.find((s) => s.type === expectedFinalStage);
  if (finalStage?.status === "COMPLETED") {
    return "completed";
  }

  return "incomplete";
}

/**
 * Check if stages are complete (have reached a terminal state)
 *
 * @deprecated Use getCompletionStatus() for more precise status
 *
 * Terminal states:
 * - COMPLETED: Proposal successfully executed through all stages
 * - FAILED: Proposal was defeated, canceled, or expired during voting
 */
export function areStagesComplete(stages: ProposalStage[]): boolean {
  if (!stages || stages.length === 0) return false;
  const lastStage = stages[stages.length - 1];
  return lastStage.status === "COMPLETED" || lastStage.status === "FAILED";
}

/**
 * Check if stages have reached the final stage for a specific governor
 *
 * @deprecated Use getCompletionStatus() for more precise status
 */
export function hasReachedFinalStage(
  stages: ProposalStage[],
  governorAddress: string
): boolean {
  const status = getCompletionStatus(stages, governorAddress);
  return status === "completed" || status === "failed";
}

/**
 * Check if a proposal's tracking has exceeded the maximum age
 *
 * This prevents old proposals without retryables from being re-tracked forever.
 * Once a proposal has been tracked for 60 days past creation, we stop updating.
 *
 * @param stagesTrackedAt - ISO timestamp of when stages were last tracked
 * @param proposalCreatedAt - ISO timestamp or block-based estimate of creation
 * @returns true if tracking should be skipped due to age
 */
export function hasExceededTrackingAge(
  stagesTrackedAt: string | undefined,
  proposalCreatedAt: Date | number
): boolean {
  if (!stagesTrackedAt) return false;

  const trackedTime = new Date(stagesTrackedAt).getTime();
  const createdTime =
    typeof proposalCreatedAt === "number"
      ? proposalCreatedAt
      : proposalCreatedAt.getTime();

  return trackedTime - createdTime > MAX_TRACKING_AGE_MS;
}

/**
 * Check if cached stages need refresh based on TTL
 *
 * @param stagesTrackedAt - ISO timestamp of when stages were last tracked
 * @param ttlMs - Time-to-live in milliseconds (default: DEFAULT_CACHE_TTL_MS)
 * @returns true if cache is expired and needs refresh
 */
export function isCacheExpired(
  stagesTrackedAt: string | undefined,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): boolean {
  if (!stagesTrackedAt) return true;

  const trackedTime = new Date(stagesTrackedAt).getTime();
  return Date.now() - trackedTime > ttlMs;
}

/**
 * Load cached stages from localStorage
 *
 * Uses hasReachedFinalStage to determine if the proposal is complete,
 * which accounts for governor-specific final stages:
 * - Core Governor: RETRYABLE_REDEEMED
 * - Treasury Governor: L2_TIMELOCK_EXECUTED
 */
export function loadCachedStages(
  proposalId: string,
  governorAddress: string,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): CacheLoadResult {
  if (typeof window === "undefined") {
    return { result: null, isExpired: false, isComplete: false };
  }

  try {
    const key = getCacheKey(proposalId, governorAddress);
    const cached = localStorage.getItem(key);

    if (!cached) {
      return { result: null, isExpired: false, isComplete: false };
    }

    const parsed: CachedStagesResult = JSON.parse(cached);

    if (parsed.version !== CACHE_VERSION) {
      return { result: null, isExpired: false, isComplete: false };
    }

    const isExpired = Date.now() - parsed.timestamp > ttlMs;
    // Use governor-aware completion check
    const isComplete = hasReachedFinalStage(
      parsed.result.stages,
      governorAddress
    );

    return {
      result: parsed.result,
      isExpired,
      isComplete,
    };
  } catch {
    return { result: null, isExpired: false, isComplete: false };
  }
}

/**
 * Save stages to localStorage cache
 */
export function saveCachedStages(
  proposalId: string,
  governorAddress: string,
  result: ProposalTrackingResult
): void {
  if (typeof window === "undefined") return;

  try {
    const key = getCacheKey(proposalId, governorAddress);
    const cached: CachedStagesResult = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      result,
    };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch {
    // Storage full or unavailable
  }
}

/**
 * Clear cached stages from localStorage
 */
export function clearCachedStages(
  proposalId: string,
  governorAddress: string
): void {
  if (typeof window === "undefined") return;

  try {
    const key = getCacheKey(proposalId, governorAddress);
    localStorage.removeItem(key);
  } catch {
    // Ignore errors
  }
}

/**
 * Seed localStorage with stages from a preloaded proposal
 *
 * Used by proposal-cache.ts to populate localStorage from the static cache.
 * Only seeds if the proposal has more stages than what's currently cached.
 *
 * @returns true if stages were seeded, false if skipped
 */
export function seedStagesFromProposal(proposal: {
  id: string;
  contractAddress: string;
  creationTxHash?: string;
  stages?: ProposalStage[];
  state: string;
  stagesTrackedAt?: string;
}): boolean {
  if (typeof window === "undefined") return false;
  if (!proposal.stages || proposal.stages.length === 0) return false;
  if (!proposal.creationTxHash) return false;

  const key = getCacheKey(proposal.id, proposal.contractAddress);

  try {
    // Check if we already have cached stages with same or more data
    const existing = localStorage.getItem(key);
    if (existing) {
      const parsed: CachedStagesResult = JSON.parse(existing);
      if (parsed.version === CACHE_VERSION && parsed.result.stages) {
        if (parsed.result.stages.length >= proposal.stages.length) {
          return false;
        }
      }
    }

    const cachedResult: CachedStagesResult = {
      version: CACHE_VERSION,
      timestamp: proposal.stagesTrackedAt
        ? new Date(proposal.stagesTrackedAt).getTime()
        : Date.now(),
      result: {
        proposalId: proposal.id,
        creationTxHash: proposal.creationTxHash,
        governorAddress: proposal.contractAddress,
        stages: proposal.stages,
        currentState: proposal.state,
      },
    };

    localStorage.setItem(key, JSON.stringify(cachedResult));
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a proposal has preloaded stages in localStorage
 */
export function hasPreloadedStages(
  proposalId: string,
  governorAddress: string
): boolean {
  if (typeof window === "undefined") return false;

  const key = getCacheKey(proposalId, governorAddress);
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return false;

    const parsed: CachedStagesResult = JSON.parse(cached);
    return (
      parsed.version === CACHE_VERSION &&
      parsed.result.stages &&
      parsed.result.stages.length > 0
    );
  } catch {
    return false;
  }
}

/**
 * Get preloaded stages from localStorage
 */
export function getPreloadedStages(
  proposalId: string,
  governorAddress: string
): ProposalTrackingResult | null {
  if (typeof window === "undefined") return null;

  const key = getCacheKey(proposalId, governorAddress);
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const parsed: CachedStagesResult = JSON.parse(cached);
    if (parsed.version !== CACHE_VERSION) return null;

    return parsed.result;
  } catch {
    return null;
  }
}
