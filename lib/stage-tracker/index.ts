/**
 * Stage tracker utilities for TallyZero
 *
 * Thin convenience layer over @gzeoneth/gov-tracker for creating trackers
 * with RPC URLs and adding UI-specific metadata to tracking results.
 */

import {
  createTracker as createGovTracker,
  getStageMetadata,
  type CacheAdapter,
  type ChunkingConfig,
  type StageMetadata,
  type StageType,
  type TrackerOptions,
  type TrackingResult,
} from "@gzeoneth/gov-tracker";
import { ethers } from "ethers";

import {
  ARBITRUM_RPC_URL,
  DEFAULT_CHUNKING_CONFIG,
  ETHEREUM_RPC_URL,
} from "@/config/arbitrum-governance";
import type { ProposalTrackingResult } from "@/types/proposal-stage";

/**
 * Create a proposal stage tracker with RPC URLs
 *
 * Helper that creates ethers providers from RPC URLs and configures gov-tracker.
 * Use this when you have RPC URLs and need to create a tracker.
 *
 * @param l2RpcUrl - Arbitrum One RPC URL (defaults to ARBITRUM_RPC_URL)
 * @param l1RpcUrl - Ethereum mainnet RPC URL (defaults to ETHEREUM_RPC_URL)
 * @param options - Additional tracker options (onProgress, chunkingConfig, cache, etc)
 * @returns A configured ProposalStageTracker instance from gov-tracker
 */
export function createProposalTracker(
  l2RpcUrl: string = ARBITRUM_RPC_URL,
  l1RpcUrl: string = ETHEREUM_RPC_URL,
  options?: Omit<Partial<TrackerOptions>, "chunkingConfig"> & {
    chunkingConfig?: Partial<ChunkingConfig>;
    cache?: CacheAdapter;
  }
) {
  const l2Provider = new ethers.providers.StaticJsonRpcProvider(l2RpcUrl);
  const l1Provider = new ethers.providers.StaticJsonRpcProvider(l1RpcUrl);

  const {
    chunkingConfig: userChunkingConfig,
    cache,
    ...restOptions
  } = options || {};

  const chunkingConfig: ChunkingConfig = {
    ...DEFAULT_CHUNKING_CONFIG,
    ...userChunkingConfig,
  };

  return createGovTracker({
    l2Provider,
    l1Provider,
    chunkingConfig,
    cache,
    ...restOptions,
  });
}

/**
 * Convert gov-tracker TrackingResult to ProposalTrackingResult
 *
 * Adds UI-specific metadata (proposalId, creationTxHash, governorAddress)
 * for session management and caching in TallyZero.
 *
 * @param result - Tracking result from gov-tracker
 * @param proposalId - The proposal ID
 * @param creationTxHash - The creation transaction hash
 * @param governorAddress - The governor contract address
 * @returns ProposalTrackingResult with UI metadata
 */
export function toProposalTrackingResult(
  result: TrackingResult,
  proposalId: string,
  creationTxHash: string,
  governorAddress: string
): ProposalTrackingResult {
  return {
    proposalId,
    creationTxHash,
    governorAddress,
    stages: result.stages,
    currentState: result.currentState,
    timelockLink: result.timelockLink,
    isComplete: result.isComplete,
    proposalType: result.proposalType,
  };
}

const ALL_STAGE_TYPES: StageType[] = [
  "PROPOSAL_CREATED",
  "VOTING_ACTIVE",
  "PROPOSAL_QUEUED",
  "L2_TIMELOCK",
  "L2_TO_L1_MESSAGE",
  "L1_TIMELOCK",
  "RETRYABLE_EXECUTED",
  "CREATE_ELECTION",
  "NOMINEE_ELECTION",
  "NOMINEE_VETTING",
  "MEMBER_ELECTION",
];

let cachedStageMetadata: Record<StageType, StageMetadata> | null = null;

/**
 * Get metadata for all stage types (memoized)
 *
 * Builds a record mapping each StageType to its StageMetadata
 * by calling gov-tracker's getStageMetadata for each type.
 * Result is cached after first call.
 *
 * @returns Record of StageType to StageMetadata
 */
export function getAllStageMetadata(): Record<StageType, StageMetadata> {
  if (cachedStageMetadata) return cachedStageMetadata;

  const result: Partial<Record<StageType, StageMetadata>> = {};
  for (const type of ALL_STAGE_TYPES) {
    result[type] = getStageMetadata(type);
  }
  cachedStageMetadata = result as Record<StageType, StageMetadata>;
  return cachedStageMetadata;
}
