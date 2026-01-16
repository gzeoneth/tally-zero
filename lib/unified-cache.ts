/**
 * Unified cache resolution for proposal lifecycle stages
 *
 * All proposal stages are stored in a single cache entry.
 * Gov-tracker's trackByTxHash returns all stages in one result.
 *
 * Separate timelock cache functions are provided for the
 * TimelockOperationContent feature (tracking timelock operations directly).
 */

import { getFinalStageForGovernor } from "@/config/governors";
import {
  CACHE_VERSION,
  DEFAULT_CACHE_TTL_MS,
  STORAGE_KEYS,
} from "@/config/storage-keys";
import type { TimelockTrackingResult } from "@/hooks/use-timelock-operation";
import type {
  ProposalStage,
  ProposalTrackingResult,
  TimelockLink,
} from "@/types/proposal-stage";
import { debug, isBrowser } from "./debug";
import {
  getCacheKey,
  getCompletionStatus,
  trimCachedStagesFromIndex,
  type CachedStagesResult,
  type CompletionStatus,
} from "./stages-cache";

/**
 * Cached timelock operation result (for direct timelock tracking feature)
 */
export interface CachedTimelockResult {
  version: number;
  timestamp: number;
  result: TimelockTrackingResult;
}

/**
 * Result of unified cache loading
 */
export interface UnifiedCacheResult {
  /** All stages from the proposal cache */
  stages: ProposalStage[];
  /** Link to timelock operation (for cross-reference) */
  timelockLink?: TimelockLink;
  /** Whether proposal cache is expired */
  proposalCacheExpired: boolean;
  /** Completion status */
  completionStatus: CompletionStatus;
  /** Whether tracking is complete (no refresh needed) */
  isComplete: boolean;
  /** Original proposal tracking result */
  proposalResult: ProposalTrackingResult | null;
}

/**
 * Get cache key for timelock operations (for direct timelock tracking feature)
 */
export function getTimelockCacheKey(
  txHash: string,
  operationId: string
): string {
  return `${STORAGE_KEYS.TIMELOCK_OP_CACHE_PREFIX}${txHash.toLowerCase()}-${operationId.toLowerCase()}`;
}

/**
 * Load cached timelock result from localStorage (for direct timelock tracking feature)
 */
export function loadCachedTimelockResult(
  txHash: string,
  operationId: string,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): { result: TimelockTrackingResult | null; isExpired: boolean } {
  if (!isBrowser) {
    return { result: null, isExpired: false };
  }

  try {
    const key = getTimelockCacheKey(txHash, operationId);
    const cached = localStorage.getItem(key);
    if (!cached) {
      return { result: null, isExpired: false };
    }

    const parsed: CachedTimelockResult = JSON.parse(cached);
    if (parsed.version !== CACHE_VERSION) {
      return { result: null, isExpired: false };
    }

    const isExpired = Date.now() - parsed.timestamp > ttlMs;
    return { result: parsed.result, isExpired };
  } catch (err) {
    debug.cache("failed to load timelock cache for %s: %O", txHash, err);
    return { result: null, isExpired: false };
  }
}

/**
 * Save timelock result to localStorage cache (for direct timelock tracking feature)
 */
export function saveCachedTimelockResult(
  txHash: string,
  operationId: string,
  result: TimelockTrackingResult
): void {
  if (!isBrowser) return;

  try {
    const key = getTimelockCacheKey(txHash, operationId);
    const cached: CachedTimelockResult = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      result,
    };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch (err) {
    debug.cache("failed to save timelock cache for %s: %O", txHash, err);
  }
}

/**
 * Clear timelock result from localStorage cache
 */
export function clearCachedTimelockResult(
  txHash: string,
  operationId: string
): void {
  if (!isBrowser) return;

  try {
    const key = getTimelockCacheKey(txHash, operationId);
    localStorage.removeItem(key);
  } catch (err) {
    debug.cache("failed to clear timelock cache for %s: %O", txHash, err);
  }
}

/**
 * Load unified stages from proposal cache
 *
 * All stages are stored together in the proposal cache.
 * Gov-tracker's trackByTxHash returns all stages in one result.
 *
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor contract address
 * @param ttlMs - Cache TTL in milliseconds
 * @returns Cache result with all stages
 */
export function loadUnifiedStages(
  proposalId: string,
  governorAddress: string,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): UnifiedCacheResult {
  if (!isBrowser) {
    return {
      stages: [],
      proposalCacheExpired: false,
      completionStatus: "pending",
      isComplete: false,
      proposalResult: null,
    };
  }

  const proposalCacheKey = getCacheKey(proposalId, governorAddress);
  let proposalResult: ProposalTrackingResult | null = null;
  let proposalCacheExpired = false;

  try {
    const cachedProposal = localStorage.getItem(proposalCacheKey);
    if (cachedProposal) {
      const parsed: CachedStagesResult = JSON.parse(cachedProposal);
      if (parsed.version === CACHE_VERSION) {
        proposalResult = parsed.result;
        proposalCacheExpired = Date.now() - parsed.timestamp > ttlMs;
      }
    }
  } catch (err) {
    debug.cache("failed to load unified stages for %s: %O", proposalId, err);
  }

  if (!proposalResult) {
    return {
      stages: [],
      proposalCacheExpired: false,
      completionStatus: "pending",
      isComplete: false,
      proposalResult: null,
    };
  }

  const completionStatus = getCompletionStatus(
    proposalResult.stages,
    governorAddress
  );

  return {
    stages: proposalResult.stages,
    timelockLink: proposalResult.timelockLink,
    proposalCacheExpired,
    completionStatus,
    isComplete:
      completionStatus === "completed" || completionStatus === "failed",
    proposalResult,
  };
}

/**
 * Check if unified cache needs refresh
 *
 * @param unifiedResult - Result from loadUnifiedStages
 * @returns true if cache is expired and not complete
 */
export function needsRefresh(unifiedResult: UnifiedCacheResult): boolean {
  if (unifiedResult.isComplete) {
    return false;
  }
  return unifiedResult.proposalCacheExpired;
}

/**
 * Get the expected final stage for a governor
 * Re-exported for convenience
 */
export { getFinalStageForGovernor };

/**
 * Trim unified cache from a specific stage index
 *
 * Removes all stages including and after the specified index,
 * allowing the tracker to re-track from that point.
 *
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor contract address
 * @param unifiedStageIndex - Index to trim from (inclusive)
 * @returns True if stages were trimmed
 */
export function trimUnifiedCacheFromIndex(
  proposalId: string,
  governorAddress: string,
  unifiedStageIndex: number
): boolean {
  if (!isBrowser) return false;

  return trimCachedStagesFromIndex(
    proposalId,
    governorAddress,
    unifiedStageIndex
  );
}

/**
 * Check if timelock cache exists and is valid (for direct timelock tracking feature)
 */
export function hasTimelockCache(txHash: string, operationId: string): boolean {
  if (!isBrowser) return false;

  try {
    const key = getTimelockCacheKey(txHash, operationId);
    const cached = localStorage.getItem(key);
    if (!cached) return false;

    const parsed: CachedTimelockResult = JSON.parse(cached);
    return parsed.version === CACHE_VERSION && parsed.result.stages.length > 0;
  } catch (err) {
    debug.cache("failed to check timelock cache for %s: %O", txHash, err);
    return false;
  }
}
