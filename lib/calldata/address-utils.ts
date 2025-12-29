import knownAddresses from "@data/known-addresses.json";

import { getAddressExplorerUrl } from "@/lib/explorer-utils";

import type { ChainContext } from "./types";

/**
 * Get explorer URL for an address based on chain
 * @deprecated Use getAddressExplorerUrl from explorer-utils instead
 */
export function getExplorerUrl(address: string, chain: ChainContext): string {
  return getAddressExplorerUrl(address, chain);
}

/**
 * Get chain label for display
 */
export function getChainLabel(chain: ChainContext): string {
  switch (chain) {
    case "arb1":
      return "Arb1";
    case "nova":
      return "Nova";
    case "ethereum":
      return "L1";
  }
}

/**
 * Look up known address label
 */
export function getAddressLabel(
  address: string,
  chain: ChainContext
): string | undefined {
  const chainAddresses = knownAddresses.addresses[chain] as
    | Record<string, string>
    | undefined;
  if (!chainAddresses) return undefined;

  // Try exact match first
  if (chainAddresses[address]) {
    return chainAddresses[address];
  }

  // Try case-insensitive match
  const lowerAddress = address.toLowerCase();
  for (const [addr, label] of Object.entries(chainAddresses)) {
    if (addr.toLowerCase() === lowerAddress) {
      return label;
    }
  }

  return undefined;
}
