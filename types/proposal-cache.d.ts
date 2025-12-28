import type { ParsedProposal } from "./proposal";

/**
 * Proposal Cache Structure
 *
 * The cache stores proposals fetched at build time to give clients a head start.
 * Since the blockchain is immutable, finalized proposals (state >= 2) won't change.
 *
 * States:
 * - 0: Pending - can change
 * - 1: Active - can change (voting ongoing)
 * - 2: Canceled - finalized
 * - 3: Defeated - finalized
 * - 4: Succeeded - finalized
 * - 5: Queued - finalized
 * - 6: Expired - finalized
 * - 7: Executed - finalized
 */

export interface ProposalCache {
  /**
   * Cache format version for invalidation
   */
  version: number;

  /**
   * ISO timestamp when the cache was generated
   */
  generatedAt: string;

  /**
   * The block number at which the cache was created
   * Client should fetch from snapshotBlock + 1 forward
   */
  snapshotBlock: number;

  /**
   * The starting block from which proposals were fetched
   */
  startBlock: number;

  /**
   * Chain ID (42161 for Arbitrum One)
   */
  chainId: number;

  /**
   * Array of all proposals from all governors
   */
  proposals: ParsedProposal[];

  /**
   * Metadata about each governor's proposal count
   */
  governorStats: {
    [address: string]: {
      name: string;
      proposalCount: number;
    };
  };
}

/**
 * Check if a proposal state is finalized (won't change)
 */
export function isProposalFinalized(state: string): boolean;

/**
 * Proposal state types matching PROPOSAL_STATE_NAMES in config/arbitrum-governance.ts
 */
export type FinalizedState =
  | "Canceled"
  | "Defeated"
  | "Succeeded"
  | "Queued"
  | "Expired"
  | "Executed";

export type PendingState = "Pending" | "Active";

export const CURRENT_CACHE_VERSION = 1;
