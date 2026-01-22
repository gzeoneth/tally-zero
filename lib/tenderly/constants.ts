/**
 * Constants for Tenderly simulation
 */

import type { ChainType } from "./types";

export const ADDRESS_ALIAS_OFFSET = BigInt(
  "0x1111000000000000000000000000000000001111"
);

export const CHAIN_IDS = {
  arb1: "42161",
  nova: "42170",
  ethereum: "1",
} as const;

export const FUNCTION_SELECTORS = {
  schedule: "0x01d5062a",
  execute: "0x134008d3",
  scheduleBatch: "0x8f2a0bb0",
  executeBatch: "0xe38335e5",
} as const;

/**
 * Get the Tenderly network ID for a chain type
 * @param chain - The chain type
 * @param defaultChain - Default chain to use for "unknown" type (default: arb1)
 * @returns The network ID string
 */
export function getNetworkIdForChain(
  chain: ChainType,
  defaultChain: "arb1" | "ethereum" = "arb1"
): string {
  switch (chain) {
    case "ethereum":
      return CHAIN_IDS.ethereum;
    case "arb1":
      return CHAIN_IDS.arb1;
    case "nova":
      return CHAIN_IDS.nova;
    default:
      return CHAIN_IDS[defaultChain];
  }
}
