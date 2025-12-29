import { DEFAULT_CACHE_TTL_MS, STORAGE_KEYS } from "@/config/storage-keys";

export function getStoredValue<T>(
  key: string,
  defaultValue: T,
  deserialize?: (value: string) => T
): T {
  if (typeof window === "undefined") return defaultValue;

  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;

    return deserialize ? deserialize(stored) : JSON.parse(stored);
  } catch {
    return defaultValue;
  }
}

export function getStoredString(key: string, defaultValue: string): string {
  if (typeof window === "undefined") return defaultValue;

  const stored = localStorage.getItem(key);
  return stored ?? defaultValue;
}

// Handles values stored via useLocalStorage which uses JSON.stringify
export function getStoredJsonString(key: string, defaultValue: string): string {
  if (typeof window === "undefined") return defaultValue;

  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;

    const parsed = JSON.parse(stored);
    return parsed || defaultValue;
  } catch {
    return defaultValue;
  }
}

export function getStoredNumber(key: string, defaultValue: number): number {
  if (typeof window === "undefined") return defaultValue;

  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;

    const parsed = JSON.parse(stored);
    return typeof parsed === "number" && !isNaN(parsed) ? parsed : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setStoredValue<T>(
  key: string,
  value: T,
  serialize?: (value: T) => string
): void {
  if (typeof window === "undefined") return;

  try {
    const serialized = serialize ? serialize(value) : JSON.stringify(value);
    localStorage.setItem(key, serialized);
  } catch {
    // localStorage full or unavailable
  }
}

export function removeStoredValue(key: string): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(key);
  } catch {
    // localStorage unavailable
  }
}

export function hasStoredValue(key: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    return localStorage.getItem(key) !== null;
  } catch {
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
