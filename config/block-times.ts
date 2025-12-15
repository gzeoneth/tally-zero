// Block times in seconds per block
export const BLOCK_TIMES: Record<number, number> = {
  1: 12, // Ethereum
  10: 2, // Optimism
  137: 2, // Polygon
  42161: 0.25, // Arbitrum
  43114: 2, // Avalanche
};

const DEFAULT_BLOCK_TIME = 12;

export function getBlockTime(chainId: number): number {
  return BLOCK_TIMES[chainId] ?? DEFAULT_BLOCK_TIME;
}

export function getBlocksPerDay(chainId: number): number {
  return Math.floor(86400 / getBlockTime(chainId));
}

export function timeToBlocks(seconds: number, chainId: number): number {
  return Math.ceil(seconds / getBlockTime(chainId));
}

export function blocksToTime(blocks: number, chainId: number): number {
  return blocks * getBlockTime(chainId);
}

export const L1_SECONDS_PER_BLOCK = BLOCK_TIMES[1];

export const BLOCKS_PER_DAY = {
  ethereum: getBlocksPerDay(1),
  arbitrum: getBlocksPerDay(42161),
} as const;
