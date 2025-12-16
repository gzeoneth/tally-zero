export const STORAGE_KEYS = {
  L1_RPC: "tally-zero-l1-rpc",
  L2_RPC: "tally-zero-l2-rpc",
  BLOCK_RANGE: "tally-zero-block-range",
  L1_BLOCK_RANGE: "tally-zero-l1-block-range",
  STAGES_CACHE_PREFIX: "tally-zero-stages-",
  DAYS_TO_SEARCH: "tally-zero-days-to-search",
  NERD_MODE: "tally-zero-nerd-mode",
  CACHE_TTL: "tally-zero-cache-ttl",
  SKIP_PRELOAD_CACHE: "tally-zero-skip-preload-cache",
} as const;

export const CACHE_VERSION = 1;
export const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;

// Cache TTL options in seconds
export const CACHE_TTL_OPTIONS = [
  { label: "15 min", value: 900 },
  { label: "30 min", value: 1800 },
  { label: "1 hour", value: 3600 },
  { label: "2 hours", value: 7200 },
  { label: "6 hours", value: 21600 },
  { label: "24 hours", value: 86400 },
] as const;
