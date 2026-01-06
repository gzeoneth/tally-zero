/**
 * Shared utilities for timelock operation state checking
 *
 * This module consolidates the duplicate timelock state checking logic
 * used across l2-timelock.ts, l1-timelock-shared.ts, and timelock-operation-tracker.ts
 */

import TimelockABI from "@/data/ArbitrumTimelock_ABI.json";
import type { StageStatus } from "@/types/proposal-stage";
import { ethers } from "ethers";

export interface TimelockStateResult {
  status: StageStatus;
  isDone: boolean;
  isReady: boolean;
  isPending: boolean;
  eta?: string;
  message?: string;
}

/**
 * Check the state of a timelock operation using contract state functions.
 *
 * This is a fast check that avoids expensive log searches:
 * - isOperationDone: true if operation was executed (COMPLETED)
 * - isOperationReady: true if operation is ready to execute (PENDING, ready)
 * - isOperationPending: true if operation is waiting for timelock delay (PENDING)
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
      isDone: false,
      isReady: false,
      isPending: false,
    };
  }

  // Check if operation is done (executed) - this is the key optimization
  const isDone = await timelockContract.isOperationDone(operationId);
  if (isDone) {
    return {
      status: "COMPLETED",
      isDone: true,
      isReady: false,
      isPending: false,
      message: "Operation executed",
    };
  }

  // Check if ready for execution
  const isReady = await timelockContract.isOperationReady(operationId);
  if (isReady) {
    return {
      status: "PENDING",
      isDone: false,
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
      isDone: false,
      isReady: false,
      isPending: true,
      eta: timestamp.toString(),
    };
  }

  // Operation exists but in unknown state (cancelled?)
  return {
    status: "NOT_STARTED",
    isDone: false,
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
