import { DEFAULT_CACHE_TTL_MS, STORAGE_KEYS } from "@/config/storage-keys";

import { debug } from "./debug";

// Runtime check for browser environment (can't use isBrowser constant due to test mocking)
const inBrowser = () =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

export function getStoredValue<T>(
  key: string,
  defaultValue: T,
  deserialize?: (value: string) => T
): T {
  if (!inBrowser()) return defaultValue;

  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;

    return deserialize ? deserialize(stored) : JSON.parse(stored);
  } catch (err) {
    debug.storage("failed to parse stored value for %s: %O", key, err);
    return defaultValue;
  }
}

export function getStoredString(key: string, defaultValue: string): string {
  if (!inBrowser()) return defaultValue;

  const stored = localStorage.getItem(key);
  return stored ?? defaultValue;
}

// Handles values stored via useLocalStorage which uses JSON.stringify
export function getStoredJsonString(key: string, defaultValue: string): string {
  if (!inBrowser()) return defaultValue;

  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;

    const parsed = JSON.parse(stored);
    return parsed || defaultValue;
  } catch (err) {
    debug.storage("failed to parse JSON string for %s: %O", key, err);
    return defaultValue;
  }
}

export function getStoredNumber(key: string, defaultValue: number): number {
  if (!inBrowser()) return defaultValue;

  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;

    const parsed = JSON.parse(stored);
    return typeof parsed === "number" && !isNaN(parsed) ? parsed : defaultValue;
  } catch (err) {
    debug.storage("failed to parse number for %s: %O", key, err);
    return defaultValue;
  }
}

export function setStoredValue<T>(
  key: string,
  value: T,
  serialize?: (value: T) => string
): void {
  if (!inBrowser()) return;

  try {
    const serialized = serialize ? serialize(value) : JSON.stringify(value);
    localStorage.setItem(key, serialized);
  } catch (err) {
    debug.storage("failed to store value for %s: %O", key, err);
  }
}

export function removeStoredValue(key: string): void {
  if (!inBrowser()) return;

  try {
    localStorage.removeItem(key);
  } catch (err) {
    debug.storage("failed to remove value for %s: %O", key, err);
  }
}

export function hasStoredValue(key: string): boolean {
  if (!inBrowser()) return false;

  try {
    return localStorage.getItem(key) !== null;
  } catch (err) {
    debug.storage("failed to check value for %s: %O", key, err);
    return false;
  }
}

/**
 * Get cache TTL in milliseconds from localStorage.
 * Stored value is in seconds, this converts to ms.
 */
export function getStoredCacheTtlMs(): number {
  const seconds = getStoredNumber(
    STORAGE_KEYS.CACHE_TTL,
    DEFAULT_CACHE_TTL_MS / 1000
  );
  return seconds > 0 ? seconds * 1000 : DEFAULT_CACHE_TTL_MS;
}
