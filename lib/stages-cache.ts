/**
 * Stage caching utilities for proposal lifecycle tracking
 * Provides localStorage-based caching with TTL and completion detection
 */

import { getFinalStageForGovernor } from "@/config/governors";
import {
  CACHE_VERSION,
  DEFAULT_CACHE_TTL_MS,
  STORAGE_KEYS,
} from "@/config/storage-keys";
import type {
  ProposalStage,
  ProposalTrackingResult,
} from "@/types/proposal-stage";
import { MS_PER_DAY } from "./date-utils";
import { debug, isBrowser } from "./debug";

/** Maximum age for tracking (60 days after proposal creation) */
export const MAX_TRACKING_AGE_MS = 60 * MS_PER_DAY;

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

/**
 * Generate localStorage cache key for proposal stages
 *
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor contract address
 * @returns The cache key string
 */
export function getCacheKey(
  proposalId: string,
  governorAddress: string
): string {
  return `${STORAGE_KEYS.STAGES_CACHE_PREFIX}${governorAddress.toLowerCase()}-${proposalId}`;
}

/** Proposal completion status */
export type CompletionStatus =
  | "pending"
  | "completed"
  | "failed"
  | "incomplete";

/**
 * Get completion status for a proposal based on its stages
 *
 * @param stages - Array of proposal stages
 * @param governorAddress - The governor contract address
 * @returns The completion status
 */
export function getCompletionStatus(
  stages: ProposalStage[],
  governorAddress: string
): CompletionStatus {
  if (!stages || stages.length === 0) return "pending";

  // Check if any stage has failed (defeated, canceled, expired)
  // A failed stage can appear anywhere in the stages array, not just at the end
  const hasFailedStage = stages.some((s) => s.status === "FAILED");
  if (hasFailedStage) {
    return "failed";
  }

  const lastStage = stages[stages.length - 1];

  // Check if we've reached the expected final stage for this governor
  const expectedFinalStage = getFinalStageForGovernor(governorAddress);

  if (!expectedFinalStage) {
    // Unknown governor - fall back to basic completion check
    return lastStage.status === "COMPLETED" ? "completed" : "incomplete";
  }

  // Check if the expected final stage is COMPLETED
  const finalStage = stages.find((s) => s.type === expectedFinalStage);
  if (finalStage?.status === "COMPLETED") {
    return "completed";
  }

  // Check if any stage is SKIPPED in the sequence
  // SKIPPED means that stage doesn't apply, and subsequent stages won't happen
  // In this case, find the last COMPLETED stage as the effective completion point
  // This handles:
  // - Final stage SKIPPED (e.g., no retryable needed)
  // - Mid-sequence SKIPPED (e.g., L2-only execution skipping L1 stages)
  // - Any other SKIPPED stage indicating a shortened execution path
  const hasSkippedStage = stages.some((s) => s.status === "SKIPPED");
  if (hasSkippedStage) {
    // Find the last COMPLETED stage - this is where execution actually ended
    for (let i = stages.length - 1; i >= 0; i--) {
      if (stages[i].status === "COMPLETED") {
        return "completed";
      }
    }
  }

  return "incomplete";
}

/**
 * Check if stages have reached the final stage for a specific governor
 *
 * @param stages - Array of proposal stages
 * @param governorAddress - The governor contract address
 * @returns True if the proposal has reached its final stage
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
 * @returns True if tracking should be skipped due to age
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
 * @returns True if cache is expired and needs refresh
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
 *
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor contract address
 * @param ttlMs - Cache TTL in milliseconds
 * @returns Cache load result with data, expiry, and completion status
 */
export function loadCachedStages(
  proposalId: string,
  governorAddress: string,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): CacheLoadResult {
  if (!isBrowser) {
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
  } catch (err) {
    debug.cache("failed to load cached stages for %s: %O", proposalId, err);
    return { result: null, isExpired: false, isComplete: false };
  }
}

/**
 * Save stages to localStorage cache
 *
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor contract address
 * @param result - The tracking result to cache
 */
export function saveCachedStages(
  proposalId: string,
  governorAddress: string,
  result: ProposalTrackingResult
): void {
  if (!isBrowser) return;

  try {
    const key = getCacheKey(proposalId, governorAddress);
    const cached: CachedStagesResult = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      result,
    };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch (err) {
    debug.cache("failed to save stages for %s: %O", proposalId, err);
  }
}

/**
 * Clear cached stages from localStorage
 *
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor contract address
 */
export function clearCachedStages(
  proposalId: string,
  governorAddress: string
): void {
  if (!isBrowser) return;

  try {
    const key = getCacheKey(proposalId, governorAddress);
    localStorage.removeItem(key);
  } catch (err) {
    debug.cache("failed to clear stages for %s: %O", proposalId, err);
  }
}

/**
 * Trim cached stages from a specific index onwards
 *
 * This removes all stages including and after the specified index,
 * allowing the tracker to re-track from that point.
 *
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor contract address
 * @param fromIndex - Index to start trimming from (inclusive)
 * @returns True if stages were trimmed, false if nothing to trim
 */
export function trimCachedStagesFromIndex(
  proposalId: string,
  governorAddress: string,
  fromIndex: number
): boolean {
  if (!isBrowser) return false;

  try {
    const key = getCacheKey(proposalId, governorAddress);
    const cached = localStorage.getItem(key);
    if (!cached) return false;

    const parsed: CachedStagesResult = JSON.parse(cached);
    if (parsed.version !== CACHE_VERSION) return false;

    // Trim stages from the specified index
    const trimmedStages = parsed.result.stages.slice(0, fromIndex);

    // If no stages left, clear the cache entirely
    if (trimmedStages.length === 0) {
      clearCachedStages(proposalId, governorAddress);
      return true;
    }

    // Update the cached result with trimmed stages
    const updatedResult: ProposalTrackingResult = {
      ...parsed.result,
      stages: trimmedStages,
      // Clear timelockLink if we're trimming before PROPOSAL_QUEUED stage
      timelockLink: trimmedStages.some((s) => s.type === "PROPOSAL_QUEUED")
        ? parsed.result.timelockLink
        : undefined,
    };

    // Save back to localStorage
    const updatedCache: CachedStagesResult = {
      version: CACHE_VERSION,
      timestamp: Date.now(), // Update timestamp to mark as fresh
      result: updatedResult,
    };

    localStorage.setItem(key, JSON.stringify(updatedCache));
    debug.cache("trimmed stages from index %d for %s", fromIndex, proposalId);
    return true;
  } catch (err) {
    debug.cache("failed to trim stages for %s: %O", proposalId, err);
    return false;
  }
}
