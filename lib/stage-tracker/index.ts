/**
 * Stage tracker module - wrapper around @gzeoneth/gov-tracker
 *
 * This module provides a convenient interface for tracking Arbitrum DAO
 * governance proposal lifecycle stages using the gov-tracker package.
 */

// Re-export everything from gov-tracker for convenience
export {
  createTracker,
  ProposalStageTracker,
  extractTimelockLink,
  // Discovery utilities
  detectProposalType,
  isElectionProposal,
  detectGovernorCapabilities,
  getTimelockAddress,
  getProposalState,
  discoverProposalByTxHash,
  findCallScheduledByTxHash,
  // Stage utilities
  findExecutableStage,
  findAllExecutableStages,
  needsAction,
  getTrackingStatusSummary,
  getCurrentStage,
  areAllStagesComplete,
  extractOperationId,
  isTimelockStage,
  // Metadata utilities
  getStageMetadata,
  getAllStageMetadata,
  getActionableStages,
  formatStageTitle,
  getTotalExpectedDuration,
  // Timing utilities
  calculateEta,
  calculateExpectedEta,
  calculateRemainingSeconds,
  estimateTimestampFromBlock,
  getL1BlockNumberFromL2,
  // Address utilities
  ADDRESSES,
  CHAIN_IDS,
  DEFAULT_RPC_URLS,
  CHUNK_SIZES,
  isElectionGovernor,
  buildDefaultTargets,
  // Type guards
  isStageType,
  getStageData,
} from "@gzeoneth/gov-tracker";

// Re-export types
export type {
  StageType,
  StageStatus,
  ChainType,
  TrackedStage,
  StageTransaction,
  StageTiming,
  StageDataMap,
  TypedTrackedStage,
  TrackingResult,
  TrackingCheckpoint,
  TrackerOptions,
  OnProgressCallback,
  TimelockLink,
  ProposalType,
  ProposalState,
  ProposalData,
  PrepareResult,
  PreparedTransaction,
  ExecutionResult,
  ChunkingConfig,
  StageMetadata,
  TrackingProgress,
  CallScheduledData,
  // Stage data types
  ProposalCreatedData,
  VotingActiveData,
  ProposalQueuedData,
  L2TimelockData,
  L1TimelockData,
  L2ToL1MessageStageData,
  RetryableStageData,
  TimelockStageData,
} from "@gzeoneth/gov-tracker";

// Import for internal use
import {
  createTracker as createGovTracker,
  type TrackerOptions,
  type TrackingResult,
  type TrackedStage,
  type TrackingProgress,
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
          onProgress(progress.stage, progress.currentIndex, progress.isComplete);
        }
      : undefined,
  });

  return tracker.trackByTxHash(creationTxHash);
}

/**
 * Convert gov-tracker TrackingResult to ProposalTrackingResult
 * for backwards compatibility with existing UI code
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

/**
 * Legacy factory function for Core Governor tracker
 * Creates a tracker configured for core governance proposals
 *
 * @deprecated Use createProposalTracker instead
 */
export function createCoreGovernorTracker(
  l2RpcUrl: string = ARBITRUM_RPC_URL,
  l1RpcUrl: string = ETHEREUM_RPC_URL
) {
  return createProposalTracker(l2RpcUrl, l1RpcUrl);
}

/**
 * Legacy factory function for Treasury Governor tracker
 * Creates a tracker configured for treasury proposals
 *
 * @deprecated Use createProposalTracker instead
 */
export function createTreasuryGovernorTracker(
  l2RpcUrl: string = ARBITRUM_RPC_URL,
  l1RpcUrl: string = ETHEREUM_RPC_URL
) {
  return createProposalTracker(l2RpcUrl, l1RpcUrl);
}
