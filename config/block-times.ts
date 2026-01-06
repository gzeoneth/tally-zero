/**
 * Block time configuration for various EVM chains
 * Used for time calculations and block number estimations
 */

import { SECONDS_PER_DAY } from "@/lib/date-utils";

/** Block times in seconds per block, indexed by chain ID */
export const BLOCK_TIMES: Record<number, number> = {
  1: 12, // Ethereum
  10: 2, // Optimism
  137: 2, // Polygon
  42161: 0.25, // Arbitrum
  43114: 2, // Avalanche
};

/** Default block time in seconds for unknown chains (Ethereum mainnet default) */
const DEFAULT_BLOCK_TIME = 12;

/**
 * Get the block time for a specific chain
 * @param chainId - The chain ID to look up
 * @returns Block time in seconds
 */
export function getBlockTime(chainId: number): number {
  return BLOCK_TIMES[chainId] ?? DEFAULT_BLOCK_TIME;
}

/**
 * Calculate the number of blocks produced per day on a chain
 * @param chainId - The chain ID to calculate for
 * @returns Number of blocks per day
 */
export function getBlocksPerDay(chainId: number): number {
  return Math.floor(SECONDS_PER_DAY / getBlockTime(chainId));
}

/**
 * Convert a time duration to approximate block count
 * @param seconds - Duration in seconds
 * @param chainId - The chain ID to calculate for
 * @returns Approximate number of blocks (rounded up)
 */
export function timeToBlocks(seconds: number, chainId: number): number {
  return Math.ceil(seconds / getBlockTime(chainId));
}

/**
 * Convert a block count to approximate time duration
 * @param blocks - Number of blocks
 * @param chainId - The chain ID to calculate for
 * @returns Approximate duration in seconds
 */
export function blocksToTime(blocks: number, chainId: number): number {
  return blocks * getBlockTime(chainId);
}

/** Ethereum L1 block time in seconds */
export const L1_SECONDS_PER_BLOCK = BLOCK_TIMES[1];

/** Pre-calculated blocks per day for common chains */
export const BLOCKS_PER_DAY = {
  ethereum: getBlocksPerDay(1),
  arbitrum: getBlocksPerDay(42161),
} as const;
