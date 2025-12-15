/**
 * Core Stage Tracking Utilities
 *
 * Shared tracking logic that can be used in both:
 * - Node.js build scripts
 * - Browser hooks
 *
 * This module provides a clean abstraction over the IncrementalStageTracker
 * for tracking proposal lifecycle stages.
 */

import {
  ARBITRUM_RPC_URL,
  CORE_GOVERNOR,
  DEFAULT_CHUNKING_CONFIG,
  ETHEREUM_RPC_URL,
  L1_TIMELOCK,
  L2_CORE_TIMELOCK,
  L2_TREASURY_TIMELOCK,
  TREASURY_GOVERNOR,
} from "@/config/arbitrum-governance";
import type { ChunkingConfig, ProposalStage } from "@/types/proposal-stage";
import { ArbitrumProvider } from "@arbitrum/sdk";
import { ethers } from "ethers";
import {
  IncrementalStageTracker,
  type StageProgressCallback,
} from "./incremental-stage-tracker";

export interface TrackStagesOptions {
  proposalId: string;
  creationTxHash: string;
  governorAddress: string;
  l2RpcUrl?: string;
  l1RpcUrl?: string;
  chunkingConfig?: Partial<ChunkingConfig>;
  onProgress?: StageProgressCallback;
  existingStages?: ProposalStage[];
  startFromStageIndex?: number;
}

export interface TrackStagesResult {
  stages: ProposalStage[];
  currentState?: string;
  error?: string;
}

/**
 * Determine if a governor address is the Core Governor
 */
export function isCoreGovernor(governorAddress: string): boolean {
  return governorAddress.toLowerCase() === CORE_GOVERNOR.address.toLowerCase();
}

/**
 * Determine if a governor address is the Treasury Governor
 */
export function isTreasuryGovernor(governorAddress: string): boolean {
  return (
    governorAddress.toLowerCase() === TREASURY_GOVERNOR.address.toLowerCase()
  );
}

/**
 * Create an IncrementalStageTracker for the given governor
 */
export function createTracker(
  governorAddress: string,
  l2RpcUrl: string = ARBITRUM_RPC_URL,
  l1RpcUrl: string = ETHEREUM_RPC_URL,
  chunkingConfig?: Partial<ChunkingConfig>
): IncrementalStageTracker {
  const baseL2Provider = new ethers.providers.JsonRpcProvider(l2RpcUrl);
  const l2Provider = new ArbitrumProvider(baseL2Provider, 42161);
  const l1Provider = new ethers.providers.JsonRpcProvider(l1RpcUrl);

  const config = { ...DEFAULT_CHUNKING_CONFIG, ...chunkingConfig };

  const isCore = isCoreGovernor(governorAddress);
  const l2TimelockAddress = isCore
    ? L2_CORE_TIMELOCK.address
    : L2_TREASURY_TIMELOCK.address;

  return new IncrementalStageTracker(
    l2Provider,
    l1Provider,
    governorAddress,
    l2TimelockAddress,
    L1_TIMELOCK.address,
    config,
    baseL2Provider
  );
}

/**
 * Track lifecycle stages for a proposal
 *
 * This is the main entry point for tracking stages in both
 * the build script and the browser hook.
 */
export async function trackProposalStages(
  options: TrackStagesOptions
): Promise<TrackStagesResult> {
  const {
    proposalId,
    creationTxHash,
    governorAddress,
    l2RpcUrl,
    l1RpcUrl,
    chunkingConfig,
    onProgress,
    existingStages,
    startFromStageIndex,
  } = options;

  // Validate governor address
  if (
    !isCoreGovernor(governorAddress) &&
    !isTreasuryGovernor(governorAddress)
  ) {
    return {
      stages: [],
      error: `Unknown governor address: ${governorAddress}`,
    };
  }

  try {
    const tracker = createTracker(
      governorAddress,
      l2RpcUrl,
      l1RpcUrl,
      chunkingConfig
    );

    const result = await tracker.trackProposal(
      proposalId,
      creationTxHash,
      onProgress,
      existingStages,
      startFromStageIndex
    );

    return {
      stages: result.stages,
      currentState: result.currentState,
    };
  } catch (error) {
    return {
      stages: existingStages || [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if a proposal state indicates it has progressed past voting
 * (i.e., it's worth tracking full lifecycle stages)
 */
export function shouldTrackStages(proposalState: string): boolean {
  const state = proposalState.toLowerCase();
  // Track stages for proposals that have completed voting
  return ["queued", "succeeded", "executed", "expired"].includes(state);
}

/**
 * Check if stages are complete (all stages have final status)
 */
export function areStagesComplete(stages: ProposalStage[]): boolean {
  if (!stages || stages.length === 0) return false;
  const lastStage = stages[stages.length - 1];
  return lastStage.status === "COMPLETED" || lastStage.status === "FAILED";
}

/**
 * Get the current stage index (last non-NOT_STARTED stage)
 */
export function getCurrentStageIndex(stages: ProposalStage[]): number {
  if (!stages || stages.length === 0) return -1;

  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].status !== "NOT_STARTED") {
      return i;
    }
  }

  return stages.length > 0 ? 0 : -1;
}
