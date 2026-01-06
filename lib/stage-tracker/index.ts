/**
 * Stage tracker module - wrapper around @gzeoneth/gov-tracker
 *
 * This module provides a convenient interface for tracking Arbitrum DAO
 * governance proposal lifecycle stages using the gov-tracker package.
 */

// Re-export everything from gov-tracker for convenience
export {
  // Address utilities
  ADDRESSES,
  areAllStagesComplete,
  buildDefaultTargets,
  // Timing utilities
  calculateEta,
  calculateExpectedEta,
  calculateRemainingSeconds,
  CHAIN_IDS,
  CHUNK_SIZES,
  createTracker,
  DEFAULT_RPC_URLS,
  detectGovernorCapabilities,
  // Discovery utilities
  detectProposalType,
  discoverProposalByTxHash,
  estimateTimestampFromBlock,
  extractOperationId,
  extractTimelockLink,
  findAllExecutableStages,
  findCallScheduledByTxHash,
  // Stage utilities
  findExecutableStage,
  formatStageTitle,
  getActionableStages,
  getAllStageMetadata,
  getCurrentStage,
  getL1BlockNumberFromL2,
  getProposalState,
  getStageData,
  // Metadata utilities
  getStageMetadata,
  getTimelockAddress,
  getTotalExpectedDuration,
  getTrackingStatusSummary,
  isElectionGovernor,
  isElectionProposal,
  // Type guards
  isStageType,
  isTimelockStage,
  needsAction,
  ProposalStageTracker,
} from "@gzeoneth/gov-tracker";

// Re-export types
export type {
  CallScheduledData,
  ChainType,
  ChunkingConfig,
  ExecutionResult,
  L1TimelockData,
  L2TimelockData,
  L2ToL1MessageStageData,
  OnProgressCallback,
  PreparedTransaction,
  PrepareResult,
  // Stage data types
  ProposalCreatedData,
  ProposalData,
  ProposalQueuedData,
  ProposalState,
  ProposalType,
  RetryableStageData,
  StageDataMap,
  StageMetadata,
  StageStatus,
  StageTiming,
  StageTransaction,
  StageType,
  TimelockLink,
  TimelockStageData,
  TrackedStage,
  TrackerOptions,
  TrackingCheckpoint,
  TrackingProgress,
  TrackingResult,
  TypedTrackedStage,
  VotingActiveData,
} from "@gzeoneth/gov-tracker";

// Import for internal use
import {
  createTracker as createGovTracker,
  type TrackedStage,
  type TrackerOptions,
  type TrackingProgress,
  type TrackingResult,
} from "@gzeoneth/gov-tracker";
import { ethers } from "ethers";

import {
  ARBITRUM_RPC_URL,
  ETHEREUM_RPC_URL,
} from "@/config/arbitrum-governance";
import type { ProposalTrackingResult } from "@/types/proposal-stage";

/**
 * Progress callback type for tracking stages
 */
export type StageProgressCallback = (
  stage: TrackedStage,
  stageIndex: number,
  isComplete: boolean
) => void;

/**
 * Create a proposal stage tracker with optional RPC URLs
 *
 * @param l2RpcUrl - Arbitrum One RPC URL (defaults to ARBITRUM_RPC_URL)
 * @param l1RpcUrl - Ethereum mainnet RPC URL (defaults to ETHEREUM_RPC_URL)
 * @param options - Additional tracker options
 * @returns A configured ProposalStageTracker instance
 */
export function createProposalTracker(
  l2RpcUrl: string = ARBITRUM_RPC_URL,
  l1RpcUrl: string = ETHEREUM_RPC_URL,
  options?: Partial<TrackerOptions>
) {
  const l2Provider = new ethers.providers.JsonRpcProvider(l2RpcUrl);
  const l1Provider = new ethers.providers.JsonRpcProvider(l1RpcUrl);

  return createGovTracker({
    l2Provider,
    l1Provider,
    ...options,
  });
}

/**
 * Track a proposal from its creation transaction hash
 *
 * @param creationTxHash - The transaction hash of the proposal creation
 * @param l2RpcUrl - Arbitrum One RPC URL
 * @param l1RpcUrl - Ethereum mainnet RPC URL
 * @param onProgress - Optional callback for progress updates
 * @returns Tracking result with stages
 */
export async function trackProposalByTxHash(
  creationTxHash: string,
  l2RpcUrl: string = ARBITRUM_RPC_URL,
  l1RpcUrl: string = ETHEREUM_RPC_URL,
  onProgress?: StageProgressCallback
): Promise<TrackingResult[]> {
  const tracker = createProposalTracker(l2RpcUrl, l1RpcUrl, {
    onProgress: onProgress
      ? (progress: TrackingProgress) => {
          onProgress(
            progress.stage,
            progress.currentIndex,
            progress.isComplete
          );
        }
      : undefined,
  });

  return tracker.trackByTxHash(creationTxHash);
}

/**
 * Convert gov-tracker TrackingResult to ProposalTrackingResult
 * Adds UI-specific metadata (proposalId, creationTxHash, governorAddress)
 * for session management and caching
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
