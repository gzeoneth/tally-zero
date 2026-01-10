import type { SearchPlan } from "./types";

/**
 * Calculate search ranges - always fetch from RPC
 * (Preload cache removed in favor of gov-tracker's bundled cache)
 */
export function calculateSearchRanges(
  userStartBlock: number,
  userEndBlock: number
): SearchPlan {
  return {
    rpcRanges: [{ start: userStartBlock, end: userEndBlock }],
    rangeInfo: `Searching blocks ${userStartBlock.toLocaleString()}-${userEndBlock.toLocaleString()}`,
  };
}
