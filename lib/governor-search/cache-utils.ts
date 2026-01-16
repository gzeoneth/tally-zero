import type { SearchPlan } from "./types";

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

  // User wants older blocks than cache, but there's overlap - fetch old blocks via RPC
  if (userStartBlock < cacheStartBlock && userEndBlock >= cacheStartBlock) {
    // If user end is within cache, only fetch blocks before cache
    if (userEndBlock <= cacheSnapshotBlock) {
      return {
        rpcRanges: [{ start: userStartBlock, end: cacheStartBlock - 1 }],
        rangeInfo: `RPC blocks ${userStartBlock.toLocaleString()}-${(cacheStartBlock - 1).toLocaleString()}, cache for rest`,
      };
    }
    // User range spans before and after cache - fetch both ends
    return {
      rpcRanges: [
        { start: userStartBlock, end: cacheStartBlock - 1 },
        { start: cacheSnapshotBlock + 1, end: userEndBlock },
      ],
      rangeInfo: `RPC blocks ${userStartBlock.toLocaleString()}-${(cacheStartBlock - 1).toLocaleString()} and ${(cacheSnapshotBlock + 1).toLocaleString()}-${userEndBlock.toLocaleString()}, cache for middle`,
    };
  }

  // Cache doesn't cover request - search entire range
  return {
    rpcRanges: [{ start: userStartBlock, end: userEndBlock }],
    rangeInfo: `Searching blocks ${userStartBlock.toLocaleString()}-${userEndBlock.toLocaleString()} (cache out of range)`,
  };
}
