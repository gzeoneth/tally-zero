/**
 * Collection utilities
 * Common functions for working with arrays and maps
 */

/**
 * Build a lookup Map from an array for O(1) access by key
 *
 * @param items - Array of items to index
 * @param getKey - Function to extract the key from each item
 * @returns Map from key to item
 *
 * @example
 * const users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
 * const usersById = buildLookupMap(users, u => u.id);
 * usersById.get(1); // { id: 1, name: 'Alice' }
 */
export function buildLookupMap<T, K>(
  items: readonly T[],
  getKey: (item: T) => K
): Map<K, T> {
  return new Map(items.map((item) => [getKey(item), item]));
}

/**
 * Compare two BigInt values represented as strings
 * Useful for sorting arrays by BigInt fields
 *
 * @param a - First BigInt string
 * @param b - Second BigInt string
 * @returns Negative if a < b, positive if a > b, zero if equal
 *
 * @example
 * delegates.sort((a, b) => compareBigInt(b.votingPower, a.votingPower));
 */
export function compareBigInt(a: string, b: string): number {
  const diff = BigInt(a) - BigInt(b);
  if (diff > BigInt(0)) return 1;
  if (diff < BigInt(0)) return -1;
  return 0;
}

/**
 * Compare two BigInt values in descending order
 * Convenience wrapper for sorting from highest to lowest
 *
 * @param a - First BigInt string
 * @param b - Second BigInt string
 * @returns Comparison result for descending sort
 *
 * @example
 * delegates.sort((a, b) => compareBigIntDesc(a.votingPower, b.votingPower));
 */
export function compareBigIntDesc(a: string, b: string): number {
  return compareBigInt(b, a);
}

/**
 * Sum an array of BigInt values represented as strings
 *
 * @param items - Array of items to sum
 * @param getValue - Function to extract the BigInt string from each item
 * @returns Sum as a string
 *
 * @example
 * const total = sumBigInt(delegates, d => d.votingPower);
 */
export function sumBigInt<T>(
  items: readonly T[],
  getValue: (item: T) => string
): string {
  return items
    .reduce((sum, item) => sum + BigInt(getValue(item)), BigInt(0))
    .toString();
}
