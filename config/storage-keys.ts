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

export const CACHE_TTL_OPTIONS = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 },
  { label: "6 hours", value: 360 },
  { label: "24 hours", value: 1440 },
] as const;
