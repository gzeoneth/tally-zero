/**
 * Arbitrum Governance Contract Configuration
 *
 * Contains addresses for all governance-related contracts on Arbitrum and Ethereum mainnet
 */

import type { ChunkingConfig } from "@/types/proposal-stage";

export const ARBITRUM_CHAIN_ID = 42161;

/** Default Arbitrum One RPC URL */
export const ARBITRUM_RPC_URL = "https://arb1.arbitrum.io/rpc";

/** Default Arbitrum Nova RPC URL */
export const ARBITRUM_NOVA_RPC_URL = "https://nova.arbitrum.io/rpc";

/** Default Ethereum Mainnet RPC URL */
export const ETHEREUM_RPC_URL = "https://eth.drpc.org";

/**
 * Core Governor Contract (Constitutional Proposals)
 * 4.5% quorum, ~42-44 day lifecycle
 */
const CORE_GOVERNOR = {
  address: "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9",
  name: "Core Governor",
  description: "Constitutional and non-emergency proposals",
  quorum: "4.5%",
} as const;

/**
 * Treasury Governor Contract (Non-Constitutional Proposals)
 * 3% quorum, ~24-27 day lifecycle (no L1 round-trip)
 */
const TREASURY_GOVERNOR = {
  address: "0x789fC99093B09aD01C34DC7251D0C89ce743e5a4",
  name: "Treasury Governor",
  description: "Treasury and funding proposals",
  quorum: "3%",
} as const;

/**
 * L2 Treasury Timelock Contract (Arbitrum One)
 * 3-day delay for Treasury Governor funding proposals
 */
export const L2_TREASURY_TIMELOCK = {
  address: "0xbFc1FECa8B09A5c5D3EFfE7429eBE24b9c09EF58",
  name: "L2 Treasury Timelock",
  delay: "3 days",
} as const;

/**
 * L1 Timelock Contract (Ethereum Mainnet)
 * 3-day delay, only used for Core Governor proposals
 */
export const L1_TIMELOCK = {
  address: "0xE6841D92B0C345144506576eC13ECf5103aC7f49",
  name: "L1 Timelock",
  delay: "3 days",
} as const;

/**
 * ARB Token Contract
 */
export const ARB_TOKEN = {
  address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
  name: "ARB Token",
} as const;

/**
 * Combined list of all Arbitrum governors
 */
export const ARBITRUM_GOVERNORS = [
  { id: "core" as const, ...CORE_GOVERNOR },
  { id: "treasury" as const, ...TREASURY_GOVERNOR },
] as const;

/**
 * Default form values for search configuration
 * These are the single source of truth for form defaults and placeholders
 */
export const DEFAULT_FORM_VALUES = {
  daysToSearch: 120,
  blockRange: 10000000, // arb1.arbitrum.io/rpc can handle 10M block ranges
  l1BlockRange: 1000, // private L1 RPCs can handle larger ranges
} as const;

/**
 * Default chunking configuration for event searches
 * Optimized for default public RPCs (arb1.arbitrum.io, eth.drpc.org)
 */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  l2ChunkSize: DEFAULT_FORM_VALUES.blockRange,
  l1ChunkSize: DEFAULT_FORM_VALUES.l1BlockRange,
  delayBetweenChunks: 100, // ms delay between chunk queries
};

export { L1_SECONDS_PER_BLOCK } from "@/config/block-times";
