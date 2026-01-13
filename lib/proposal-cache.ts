/**
 * Proposal cache utilities
 *
 * Provides utility functions for working with proposals.
 * Includes loading the pre-built proposal cache for faster startup.
 */

import type { ParsedProposal } from "@/types/proposal";
import type { ProposalCache } from "@/types/proposal-cache";

// Static import of the proposal cache JSON
// This is bundled at build time and available immediately
import proposalCacheData from "@data/proposal-cache.json";

/** Cache version - increment to invalidate old caches */
export const CACHE_VERSION = 1;

/** Cached proposal data */
const cachedData: ProposalCache | null = (() => {
  try {
    const cache = proposalCacheData as ProposalCache;
    if (cache.version !== CACHE_VERSION) {
      console.warn(
        `Proposal cache version mismatch: ${cache.version} !== ${CACHE_VERSION}`
      );
      return null;
    }
    return cache;
  } catch (error) {
    console.warn("Failed to load proposal cache:", error);
    return null;
  }
})();

/**
 * Load the pre-built proposal cache
 *
 * Returns the statically imported cache data.
 */
export async function loadProposalCache(): Promise<ProposalCache | null> {
  return cachedData;
}

/**
 * Get all proposals from cache
 *
 * Note: The cache contains all historical proposals. The startBlock in each
 * proposal refers to the voting start block, not the block where it was created.
 * Since the cache covers all proposals from the initial governance deployment,
 * we return all cached proposals regardless of the user's search range.
 *
 * @returns All cached proposals, or null if cache not available
 */
export async function getCachedProposals(): Promise<ParsedProposal[] | null> {
  if (!cachedData) {
    return null;
  }

  return cachedData.proposals;
}

/**
 * Get the snapshot block from the cache
 *
 * @returns The snapshot block number, or null if cache not available
 */
export async function getCacheSnapshotBlock(): Promise<number | null> {
  return cachedData?.snapshotBlock ?? null;
}

/**
 * Get the start block from the cache
 *
 * @returns The cache start block, or null if cache not available
 */
export async function getCacheStartBlock(): Promise<number | null> {
  return cachedData?.startBlock ?? null;
}

/** Proposal states that don't need refresh */
const FINALIZED_STATES = new Set([
  "canceled",
  "defeated",
  "succeeded",
  "queued",
  "expired",
  "executed",
]);

/**
 * Check if a proposal state is finalized (won't change)
 *
 * @param state - The proposal state string
 * @returns True if the proposal is in a finalized state
 */
export function isProposalFinalized(state: string): boolean {
  return FINALIZED_STATES.has(state.toLowerCase());
}

/**
 * Check if a proposal state needs to be refreshed
 *
 * @param state - The proposal state string
 * @returns True if the proposal is pending or active
 */
export function needsStateRefresh(state: string): boolean {
  const lowerState = state.toLowerCase();
  return lowerState === "pending" || lowerState === "active";
}

/**
 * Merge cached proposals with freshly fetched proposals
 *
 * Keeps finalized proposals from cache, uses fresh data for active proposals,
 * and adds any new proposals not in cache.
 *
 * @param cachedProposals - Proposals from cache
 * @param freshProposals - Proposals freshly fetched from RPC
 * @returns Merged array of proposals
 */
export function mergeProposals(
  cachedProposals: ParsedProposal[],
  freshProposals: ParsedProposal[]
): ParsedProposal[] {
  const freshMap = new Map<string, ParsedProposal>();
  for (const p of freshProposals) {
    freshMap.set(p.id, p);
  }

  const cachedIds = new Set(cachedProposals.map((p) => p.id));
  const merged: ParsedProposal[] = [];

  for (const cached of cachedProposals) {
    if (isProposalFinalized(cached.state)) {
      merged.push(cached);
    } else {
      const fresh = freshMap.get(cached.id);
      merged.push(fresh ?? cached);
    }
  }

  for (const fresh of freshProposals) {
    if (!cachedIds.has(fresh.id)) {
      merged.push(fresh);
    }
  }

  return merged;
}

/**
 * Sort proposals by state and start block
 *
 * Active proposals come first, then sorted by start block descending.
 *
 * @param proposals - Array of proposals to sort
 * @returns Sorted array of proposals
 */
export function sortProposals(proposals: ParsedProposal[]): ParsedProposal[] {
  return [...proposals].sort((a, b) => {
    if (a.state === "Active" && b.state !== "Active") return -1;
    if (a.state !== "Active" && b.state === "Active") return 1;
    return parseInt(b.startBlock, 10) - parseInt(a.startBlock, 10);
  });
}
