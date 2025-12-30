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
  DEFAULT_CHUNKING_CONFIG,
  ETHEREUM_RPC_URL,
  L1_TIMELOCK,
} from "@/config/arbitrum-governance";
import {
  getGovernorByAddress,
  isCoreGovernor as isCoreGov,
  isTreasuryGovernor as isTreasuryGov,
} from "@/config/governors";
import type {
  ChunkingConfig,
  ProposalStage,
  TimelockLink,
} from "@/types/proposal-stage";
import { ArbitrumProvider } from "@arbitrum/sdk";
import { ethers } from "ethers";
import {
  IncrementalStageTracker,
  type StageProgressCallback,
} from "./stage-tracker";

// Re-export areStagesComplete from stages-cache for backward compatibility
export { areStagesComplete } from "./stages-cache";

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
  timelockLink?: TimelockLink;
  error?: string;
}

/**
 * Determine if a governor address is the Core Governor
 */
export const isCoreGovernor = isCoreGov;

/**
 * Determine if a governor address is the Treasury Governor
 */
export const isTreasuryGovernor = isTreasuryGov;

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

  const governorConfig = getGovernorByAddress(governorAddress);
  const l2TimelockAddress = governorConfig?.l2TimelockAddress ?? "";

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
  const governorConfig = getGovernorByAddress(governorAddress);
  if (!governorConfig) {
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
      timelockLink: result.timelockLink,
    };
  } catch (error) {
    return {
      stages: existingStages || [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
