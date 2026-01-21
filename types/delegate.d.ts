/**
 * Delegate type definitions for ARB token delegation tracking.
 */

import type { Address } from "@/types/search";

/**
 * Represents a single delegate with their voting power
 */
export interface DelegateInfo {
  /** Delegate address */
  address: Address;
  /** Current voting power in wei (string to handle BigNumber serialization) */
  votingPower: string;
  /** Block number of the last DelegateVotesChanged event */
  lastChangeBlock: number;
  /** Transaction hash of the last change */
  lastChangeTxHash?: string;
}

/**
 * Cache structure for delegate data
 */
export interface DelegateCache {
  /** Cache format version */
  version: number;
  /** ISO timestamp when cache was generated */
  generatedAt: string;
  /** Latest block indexed in this cache */
  snapshotBlock: number;
  /** Starting block for indexing */
  startBlock: number;
  /** Chain ID (42161 for Arbitrum One) */
  chainId: number;
  /** Total voting power across all delegates (in wei) */
  totalVotingPower: string;
  /** ARB token total supply (in wei) */
  totalSupply: string;
  /** Array of delegates sorted by voting power descending */
  delegates: DelegateInfo[];
  /** Cache statistics */
  stats: {
    /** Total number of delegates with non-zero voting power */
    totalDelegates: number;
    /** Number of DelegateVotesChanged events processed (optional, deprecated) */
    eventsProcessed?: number;
  };
}

/**
 * Statistics about the delegate cache for display
 */
export interface DelegateCacheStats {
  /** Total number of delegates with non-zero voting power */
  totalDelegates: number;
  /** Block number when cache was last updated */
  snapshotBlock: number;
  /** Date when cache was generated */
  generatedAt: Date;
  /** Human-readable age of cache (e.g., "2 hours ago") */
  age: string;
  /** Total voting power in formatted ETH units */
  totalVotingPower: string;
  /** ARB token total supply in formatted ETH units */
  totalSupply: string;
}
