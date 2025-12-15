/**
 * LocalStorage keys used throughout the application
 */

// RPC URL settings
export const STORAGE_KEYS = {
  L1_RPC: "tally-zero-l1-rpc",
  L2_RPC: "tally-zero-l2-rpc",
  BLOCK_RANGE: "tally-zero-block-range",
  L1_BLOCK_RANGE: "tally-zero-l1-block-range",
  STAGES_CACHE_PREFIX: "tally-zero-stages-",
} as const;

export const CACHE_VERSION = 1;

/**
 * Cache TTL in milliseconds (default: 1 hour)
 * Cached lifecycle data will be refreshed in the background after this duration
 */
export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
