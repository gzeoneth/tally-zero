import type { ParsedProposal } from "@/types/proposal";

import type { CacheHitInfo, SearchPlan } from "./types";

/**
 * Result of loading cached proposals
 */
export interface CacheLoadResult {
  /** Proposals loaded from cache */
  proposals: ParsedProposal[];
  /** Cache metadata */
  cacheInfo: CacheHitInfo;
  /** Search plan for any additional RPC queries needed */
  searchPlan: SearchPlan;
}

/**
 * Calculate search ranges with cache awareness
 *
 * If cache covers the requested range, returns cache info.
 * Otherwise, determines which blocks need to be fetched from RPC.
 */
export function calculateSearchRanges(
  userStartBlock: number,
  userEndBlock: number,
  cacheSnapshotBlock?: number | null,
  cacheStartBlock?: number | null
): SearchPlan {
  // No cache - search entire range
  if (!cacheSnapshotBlock || !cacheStartBlock) {
    return {
      rpcRanges: [{ start: userStartBlock, end: userEndBlock }],
      rangeInfo: `Searching blocks ${userStartBlock.toLocaleString()}-${userEndBlock.toLocaleString()} (no cache)`,
    };
  }

  // Cache covers the entire requested range
  if (userStartBlock >= cacheStartBlock && userEndBlock <= cacheSnapshotBlock) {
    return {
      rpcRanges: [],
      rangeInfo: `Using cache for blocks ${userStartBlock.toLocaleString()}-${userEndBlock.toLocaleString()}`,
    };
  }

  // Cache covers beginning, need to fetch recent blocks
  if (
    userStartBlock >= cacheStartBlock &&
    userStartBlock <= cacheSnapshotBlock
  ) {
    return {
      rpcRanges: [{ start: cacheSnapshotBlock + 1, end: userEndBlock }],
      rangeInfo: `Cache blocks ${userStartBlock.toLocaleString()}-${cacheSnapshotBlock.toLocaleString()}, RPC blocks ${(cacheSnapshotBlock + 1).toLocaleString()}-${userEndBlock.toLocaleString()}`,
    };
  }

  // Cache doesn't cover request - search entire range
  return {
    rpcRanges: [{ start: userStartBlock, end: userEndBlock }],
    rangeInfo: `Searching blocks ${userStartBlock.toLocaleString()}-${userEndBlock.toLocaleString()} (cache out of range)`,
  };
}
