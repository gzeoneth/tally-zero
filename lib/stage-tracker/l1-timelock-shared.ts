/**
 * Shared L1 timelock tracking logic
 *
 * This module provides shared functions for tracking L1 timelock stages
 * (L1_TIMELOCK_QUEUED and L1_TIMELOCK_EXECUTED) used by both the proposal
 * tracker and the timelock operation tracker.
 *
 * The key insight is that we use the operation ID from the CallScheduled event
 * to identify the corresponding CallExecuted event, ensuring we track the
 * correct execution even when multiple proposals are in flight.
 */

import { OLD_CHALLENGE_PERIOD_L1_BLOCKS } from "@/config/arbitrum-governance";
import TimelockABI from "@/data/ArbitrumTimelock_ABI.json";
import type { ChunkingConfig, ProposalStage } from "@/types/proposal-stage";
import { ChildTransactionReceipt } from "@arbitrum/sdk";
import { ethers } from "ethers";
import { findL1ExecutionTransaction } from "./l1-message-utils";
import { getL1BlockNumberFromReceipt, searchLogsInChunks } from "./log-search";
import {
  checkTimelockOperationState,
  createTimelockContract,
} from "./timelock-utils";

export interface L1TimelockTrackingParams {
  l2Provider: ethers.providers.Provider;
  l1Provider: ethers.providers.Provider;
  baseL2Provider: ethers.providers.Provider;
  l2TimelockTxHash: string;
  l1TimelockAddress: string;
  chunkingConfig: ChunkingConfig;
}

export interface L1TimelockTrackingResult {
  stages: ProposalStage[];
  /** The L1 operation ID extracted from CallScheduled, used for CallExecuted lookup */
  operationId?: string;
  /** The L1 execution transaction hash (CallExecuted) */
  l1ExecutionTxHash?: string;
}

const timelockInterface = new ethers.utils.Interface(TimelockABI);

/**
 * Track L1 timelock stages (queued and executed)
 *
 * Uses the Arbitrum SDK to track the L2→L1 message execution on L1.
 * The key insight is that we:
 * 1. Find the OutBoxTransactionExecuted event to get the L1 transaction
 * 2. Parse CallScheduled from that transaction to get the operation ID
 * 3. Use the operation ID to find the corresponding CallExecuted event
 *
 * This ensures we track the correct L1 transaction even when multiple
 * proposals are being processed around the same time.
 */
export async function trackL1TimelockStages(
  params: L1TimelockTrackingParams
): Promise<L1TimelockTrackingResult> {
  const {
    l2Provider,
    l1Provider,
    baseL2Provider,
    l2TimelockTxHash,
    l1TimelockAddress,
    chunkingConfig,
  } = params;

  const stages: ProposalStage[] = [];
  const currentBlock = await l1Provider.getBlockNumber();

  // Get L2 receipt
  const receipt = await l2Provider.getTransactionReceipt(l2TimelockTxHash);
  if (!receipt) {
    return {
      stages: [
        {
          type: "L1_TIMELOCK_QUEUED",
          status: "FAILED",
          transactions: [],
          data: { error: "No L2 receipt" },
        },
      ],
    };
  }

  // Get L2→L1 messages
  const childReceipt = new ChildTransactionReceipt(receipt);
  const messages = await childReceipt.getChildToParentMessages(l1Provider);

  if (messages.length === 0) {
    return {
      stages: [
        {
          type: "L1_TIMELOCK_QUEUED",
          status: "FAILED",
          transactions: [],
          data: { error: "No L2→L1 messages" },
        },
      ],
    };
  }

  // Get the first executable block for calculating search range
  const executableBlock =
    await messages[0].getFirstExecutableBlock(baseL2Provider);
  let fromBlock: number;
  if (executableBlock) {
    fromBlock = executableBlock.toNumber();
  } else {
    const l1BlockAtL2Tx = getL1BlockNumberFromReceipt(receipt);
    fromBlock = l1BlockAtL2Tx + OLD_CHALLENGE_PERIOD_L1_BLOCKS;
  }

  // Use the message position to find the exact L1 execution transaction
  // by searching for OutBoxTransactionExecuted events on the Outbox contract
  const l1ExecutionTx = await findL1ExecutionTransaction(
    {
      l2Provider,
      l1Provider,
      l1TimelockAddress,
      chunkingConfig,
    },
    receipt,
    fromBlock,
    currentBlock
  );

  if (!l1ExecutionTx) {
    // Message not yet executed on L1 - check if it's still pending
    return {
      stages: [
        {
          type: "L1_TIMELOCK_QUEUED",
          status: "NOT_STARTED",
          transactions: [],
          data: { message: "Waiting for L1 Timelock scheduling" },
        },
      ],
    };
  }

  // Get the transaction receipt to find CallScheduled events
  const txReceipt = await l1Provider.getTransactionReceipt(l1ExecutionTx.hash);
  if (!txReceipt) {
    return {
      stages: [
        {
          type: "L1_TIMELOCK_QUEUED",
          status: "FAILED",
          transactions: [],
          data: { error: "Could not fetch L1 execution receipt" },
        },
      ],
    };
  }

  // Find CallScheduled events in this specific transaction
  const scheduledTopic = timelockInterface.getEventTopic("CallScheduled");
  const scheduledLogs = txReceipt.logs.filter(
    (log) =>
      log.address.toLowerCase() === l1TimelockAddress.toLowerCase() &&
      log.topics[0] === scheduledTopic
  );

  if (scheduledLogs.length === 0) {
    return {
      stages: [
        {
          type: "L1_TIMELOCK_QUEUED",
          status: "FAILED",
          transactions: [],
          data: { error: "No CallScheduled events in L1 execution tx" },
        },
      ],
    };
  }

  // Extract operation ID from the CallScheduled event
  // This is the key linkage between CallScheduled and CallExecuted
  const log = scheduledLogs[scheduledLogs.length - 1];
  const parsed = timelockInterface.parseLog(log);
  const operationId = parsed.args.id as string;

  const block = await l1Provider.getBlock(l1ExecutionTx.blockNumber);
  stages.push({
    type: "L1_TIMELOCK_QUEUED",
    status: "COMPLETED",
    transactions: [
      {
        hash: l1ExecutionTx.hash,
        blockNumber: l1ExecutionTx.blockNumber,
        timestamp: block.timestamp,
        chain: "L1",
      },
    ],
    data: { operationId },
  });

  // Track execution using the operation ID from CallScheduled
  const executedStage = await trackL1TimelockExecution(
    l1Provider,
    l1TimelockAddress,
    operationId,
    l1ExecutionTx.blockNumber,
    currentBlock,
    chunkingConfig
  );
  stages.push(executedStage);

  return {
    stages,
    operationId,
    l1ExecutionTxHash:
      executedStage.status === "COMPLETED"
        ? executedStage.transactions[0]?.hash
        : undefined,
  };
}

/**
 * Track L1 timelock execution using the operation ID from CallScheduled.
 *
 * Optimization: First checks isOperationDone to determine if log search is needed.
 * - If not done → skip expensive log search, return pending/ready state
 * - If done → search logs to get transaction details
 */
async function trackL1TimelockExecution(
  l1Provider: ethers.providers.Provider,
  l1TimelockAddress: string,
  operationId: string,
  fromBlock: number,
  currentBlock: number,
  chunkingConfig: ChunkingConfig
): Promise<ProposalStage> {
  // Fast path: Check operation state first to avoid expensive log search
  const timelockContract = createTimelockContract(
    l1TimelockAddress,
    l1Provider
  );
  const state = await checkTimelockOperationState(
    timelockContract,
    operationId
  );

  // If operation is not done, skip log search and return current state
  if (!state.isDone) {
    return {
      type: "L1_TIMELOCK_EXECUTED",
      status: state.status,
      transactions: [],
      data: {
        operationId,
        ...(state.message && { message: state.message }),
        ...(state.eta && { eta: state.eta }),
        ...(state.isReady && { isReady: true }),
      },
    };
  }

  // Operation is done - search for the execution transaction to get details
  const executedTopic = timelockInterface.getEventTopic("CallExecuted");

  // Search for CallExecuted events with the specific operation ID
  // The operation ID is indexed as topic[1]
  const logs = await searchLogsInChunks(
    l1Provider,
    { address: l1TimelockAddress, topics: [executedTopic, operationId] },
    fromBlock,
    currentBlock,
    chunkingConfig.l1ChunkSize,
    chunkingConfig.delayBetweenChunks,
    (chunkLogs) => (chunkLogs.length > 0 ? chunkLogs[0] : null)
  );

  if (logs.length > 0) {
    const log = logs[0];
    const block = await l1Provider.getBlock(log.blockNumber);
    return {
      type: "L1_TIMELOCK_EXECUTED",
      status: "COMPLETED",
      transactions: [
        {
          hash: log.transactionHash,
          blockNumber: log.blockNumber,
          timestamp: block.timestamp,
          chain: "L1",
        },
      ],
      data: { operationId },
    };
  }

  // Fallback: operation done but couldn't find log (shouldn't happen)
  return {
    type: "L1_TIMELOCK_EXECUTED",
    status: "COMPLETED",
    transactions: [],
    data: {
      operationId,
      note: "Execution confirmed but transaction not found",
    },
  };
}
