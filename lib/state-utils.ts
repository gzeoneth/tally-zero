import { states } from "@/data/table/data";

export type StateValue = (typeof states)[number];

/**
 * Find a state configuration by its value (case-insensitive)
 * @param stateValue - The proposal state value to look up
 * @returns The state configuration object, or undefined if not found
 */
export function findStateByValue(
  stateValue: string | undefined | null
): StateValue | undefined {
  if (!stateValue) return undefined;
  const normalizedValue = stateValue.toLowerCase();
  return states.find((state) => state.value.toLowerCase() === normalizedValue);
}
