import { STORAGE_KEYS } from "@/config/storage-keys";

// Get all TallyZero storage keys
export const ALL_STORAGE_KEYS = Object.values(STORAGE_KEYS).filter(
  (key) => !key.endsWith("-") // Exclude prefixes
);

/**
 * Get cache stats from localStorage
 */
export function getCacheStats(): { count: number; size: string } {
  let count = 0;
  let size = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_KEYS.STAGES_CACHE_PREFIX)) {
      count++;
      const value = localStorage.getItem(key);
      if (value) size += value.length;
    }
  }
  return { count, size: (size / 1024).toFixed(2) };
}

/**
 * Get total storage usage for TallyZero keys
 */
export function getTotalStorageUsage(): string {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("tally-zero")) {
      const value = localStorage.getItem(key);
      if (value) total += key.length + value.length;
    }
  }
  return (total / 1024).toFixed(2);
}

/**
 * Clear all cached proposal stages from localStorage
 */
export function clearCache(): number {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_KEYS.STAGES_CACHE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
  return keysToRemove.length;
}

/**
 * Clear all TallyZero settings (factory reset)
 */
export function clearAllSettings(): void {
  // Clear all TallyZero keys
  ALL_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  // Clear cache entries
  clearCache();
}

/**
 * Export all settings to a JSON object
 */
export function exportSettings(): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  ALL_STORAGE_KEYS.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value !== null) {
      try {
        settings[key] = JSON.parse(value);
      } catch {
        settings[key] = value;
      }
    }
  });
  return settings;
}

/**
 * Import settings from a JSON object
 */
export function importSettings(settings: Record<string, unknown>): void {
  Object.entries(settings).forEach(([key, value]) => {
    if (ALL_STORAGE_KEYS.includes(key as (typeof ALL_STORAGE_KEYS)[number])) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  });
}

/**
 * Format TTL value to human-readable string
 */
export function formatTtl(ttlSeconds: number): string {
  if (ttlSeconds >= 3600) {
    return `${Math.floor(ttlSeconds / 3600)}h ${Math.floor((ttlSeconds % 3600) / 60)}m`;
  }
  if (ttlSeconds >= 60) {
    return `${Math.floor(ttlSeconds / 60)}m ${ttlSeconds % 60}s`;
  }
  return `${ttlSeconds}s`;
}
