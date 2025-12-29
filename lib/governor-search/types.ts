import type { ProposalCache } from "@/lib/proposal-cache";
import type { ParsedProposal, Proposal } from "@/types/proposal";

/**
 * Options for multi-governor search hook
 */
export interface UseMultiGovernorSearchOptions {
  daysToSearch: number;
  enabled: boolean;
  customRpcUrl?: string;
  blockRange?: number;
  skipCache?: boolean;
}

/**
 * Information about cache usage
 */
export interface CacheHitInfo {
  loaded: boolean;
  snapshotBlock: number;
  cacheStartBlock: number;
  cachedCount: number;
  freshCount: number;
  cacheUsed: boolean;
  rangeInfo?: string;
}

/**
 * Result from multi-governor search hook
 */
export interface UseMultiGovernorSearchResult {
  proposals: ParsedProposal[];
  progress: number;
  error: Error | null;
  isSearching: boolean;
  isProviderReady: boolean;
  cacheInfo?: CacheHitInfo;
}

/**
 * Range of blocks to search
 */
export interface BlockRange {
  start: number;
  end: number;
}

/**
 * Search plan with RPC ranges and cache filter
 */
export interface SearchPlan {
  rpcRanges: BlockRange[];
  useCache: boolean;
  cacheFilter?: { minBlock: number; maxBlock: number };
  rangeInfo: string;
}

export type { ParsedProposal, Proposal, ProposalCache };
