/**
 * Shared utilities for timelock operation state checking
 *
 * This module consolidates the duplicate timelock state checking logic
 * used across l2-timelock.ts, l1-timelock-shared.ts, and timelock-operation-tracker.ts
 */

import TimelockABI from "@/data/ArbitrumTimelock_ABI.json";
import type {
  ProposalStage,
  StageStatus,
  StageType,
} from "@/types/proposal-stage";
import { ethers } from "ethers";

export interface TimelockStateResult {
  status: StageStatus;
  isReady: boolean;
  isPending: boolean;
  eta?: string;
  message?: string;
}

/**
 * Check the state of a timelock operation
 *
 * @returns Status information about the operation
 */
export async function checkTimelockOperationState(
  timelockContract: ethers.Contract,
  operationId: string
): Promise<TimelockStateResult> {
  // Check if it's a valid operation first
  const isOperation = await timelockContract.isOperation(operationId);
  if (!isOperation) {
    return {
      status: "NOT_STARTED",
      isReady: false,
      isPending: false,
    };
  }

  // Check if ready for execution
  const isReady = await timelockContract.isOperationReady(operationId);
  if (isReady) {
    return {
      status: "PENDING",
      isReady: true,
      isPending: false,
      message: "Operation ready for execution",
    };
  }

  // Check if pending (waiting for timelock delay)
  const isPending = await timelockContract.isOperationPending(operationId);
  if (isPending) {
    const timestamp = await timelockContract.getTimestamp(operationId);
    return {
      status: "PENDING",
      isReady: false,
      isPending: true,
      eta: timestamp.toString(),
    };
  }

  // Operation exists but in unknown state (possibly done or cancelled)
  return {
    status: "NOT_STARTED",
    isReady: false,
    isPending: false,
  };
}

/**
 * Create a timelock contract instance
 */
export function createTimelockContract(
  timelockAddress: string,
  provider: ethers.providers.Provider
): ethers.Contract {
  return new ethers.Contract(timelockAddress, TimelockABI, provider);
}

/**
 * Build a ProposalStage from timelock state check result
 */
export function buildTimelockStageFromState(
  stageType: StageType,
  operationId: string,
  state: TimelockStateResult
): ProposalStage {
  const data: Record<string, unknown> = { operationId };

  if (state.message) {
    data.message = state.message;
  }
  if (state.eta) {
    data.eta = state.eta;
  }

  return {
    type: stageType,
    status: state.status,
    transactions: [],
    data,
  };
}

/**
 * Check timelock state and return a ProposalStage
 *
 * Convenience function that combines checkTimelockOperationState and buildTimelockStageFromState
 */
export async function checkTimelockAndBuildStage(
  timelockAddress: string,
  provider: ethers.providers.Provider,
  operationId: string,
  stageType: StageType,
  debugLabel: string = "checkTimelockState"
): Promise<ProposalStage> {
  const timelock = createTimelockContract(timelockAddress, provider);

  try {
    const state = await checkTimelockOperationState(timelock, operationId);
    return buildTimelockStageFromState(stageType, operationId, state);
  } catch (e) {
    console.debug(`[${debugLabel}] Failed to check timelock state:`, e);
    return {
      type: stageType,
      status: "NOT_STARTED",
      transactions: [],
      data: { operationId },
    };
  }
}
