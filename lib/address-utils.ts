/**
 * Address utilities for Ethereum address handling
 * Provides case-insensitive address comparison and validation
 */

/**
 * Compare two Ethereum addresses in a case-insensitive manner
 * Ethereum addresses are case-insensitive, but EIP-55 checksum encoding uses mixed case
 */
export function addressesEqual(
  addr1: string | undefined | null,
  addr2: string | undefined | null
): boolean {
  if (!addr1 || !addr2) return false;
  return addr1.toLowerCase() === addr2.toLowerCase();
}

/**
 * Check if an address matches any address in a list (case-insensitive)
 */
export function addressInList(
  address: string | undefined | null,
  list: readonly string[]
): boolean {
  if (!address) return false;
  const normalized = address.toLowerCase();
  return list.some((addr) => addr.toLowerCase() === normalized);
}

/**
 * Find an item in an array by comparing its address property (case-insensitive)
 */
export function findByAddress<T extends { address: string }>(
  items: readonly T[],
  address: string | undefined | null
): T | undefined {
  if (!address) return undefined;
  const normalized = address.toLowerCase();
  return items.find((item) => item.address.toLowerCase() === normalized);
}
