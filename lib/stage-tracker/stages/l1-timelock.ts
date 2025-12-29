import { CHALLENGE_PERIOD_L1_BLOCKS } from "@/config/arbitrum-governance";
import TimelockABI from "@/data/ArbitrumTimelock_ABI.json";
import type { ProposalStage } from "@/types/proposal-stage";
import { ChildTransactionReceipt } from "@arbitrum/sdk";
import { ethers } from "ethers";
import { findL1ExecutionTransaction } from "../l1-message-utils";
import { getL1BlockNumberFromReceipt, searchLogsInChunks } from "../log-search";
import type { TrackingContext } from "../types";

/**
 * Track L1 timelock stages (queued and executed)
 *
 * Uses the Arbitrum SDK to track the L2→L1 message execution on L1.
 * The key insight is that we need to find the OutBoxTransactionExecuted event
 * that corresponds to our specific L2→L1 message (identified by position).
 * This ensures we track the correct L1 transaction, even when multiple
 * proposals are being processed around the same time.
 */
export async function trackL1Timelock(
  ctx: TrackingContext
): Promise<ProposalStage[]> {
  const stages: ProposalStage[] = [];
  const currentBlock = await ctx.l1Provider.getBlockNumber();

  const receipt = await ctx.l2Provider.getTransactionReceipt(
    ctx.l2TimelockTxHash!
  );
  if (!receipt) {
    return [
      {
        type: "L1_TIMELOCK_QUEUED",
        status: "FAILED",
        transactions: [],
        data: { error: "No L2 receipt" },
      },
    ];
  }

  const childReceipt = new ChildTransactionReceipt(receipt);
  const messages = await childReceipt.getChildToParentMessages(ctx.l1Provider);

  if (messages.length === 0) {
    return [
      {
        type: "L1_TIMELOCK_QUEUED",
        status: "FAILED",
        transactions: [],
        data: { error: "No L2→L1 messages" },
      },
    ];
  }

  // Get the first executable block for calculating search range
  const executableBlock = await messages[0].getFirstExecutableBlock(
    ctx.baseL2Provider
  );
  let fromBlock: number;
  if (executableBlock) {
    fromBlock = executableBlock.toNumber();
  } else {
    const l1BlockAtL2Tx = getL1BlockNumberFromReceipt(receipt);
    fromBlock = l1BlockAtL2Tx + CHALLENGE_PERIOD_L1_BLOCKS;
  }

  // Use the message position to find the exact L1 execution transaction
  // by searching for OutBoxTransactionExecuted events on the Outbox contract
  const l1ExecutionTx = await findL1ExecutionTransaction(
    {
      l2Provider: ctx.l2Provider,
      l1Provider: ctx.l1Provider,
      l1TimelockAddress: ctx.l1TimelockAddress,
      chunkingConfig: ctx.chunkingConfig,
    },
    receipt,
    fromBlock,
    currentBlock
  );

  if (!l1ExecutionTx) {
    // Message not yet executed on L1 - check if it's still pending
    return [
      {
        type: "L1_TIMELOCK_QUEUED",
        status: "NOT_STARTED",
        transactions: [],
        data: { message: "Waiting for L1 Timelock scheduling" },
      },
    ];
  }

  // Get the transaction receipt to find CallScheduled events
  const txReceipt = await ctx.l1Provider.getTransactionReceipt(
    l1ExecutionTx.hash
  );
  if (!txReceipt) {
    return [
      {
        type: "L1_TIMELOCK_QUEUED",
        status: "FAILED",
        transactions: [],
        data: { error: "Could not fetch L1 execution receipt" },
      },
    ];
  }

  // Find CallScheduled events in this specific transaction
  const scheduledTopic = ctx.timelockInterface.getEventTopic("CallScheduled");
  const scheduledLogs = txReceipt.logs.filter(
    (log) =>
      log.address.toLowerCase() === ctx.l1TimelockAddress.toLowerCase() &&
      log.topics[0] === scheduledTopic
  );

  if (scheduledLogs.length === 0) {
    return [
      {
        type: "L1_TIMELOCK_QUEUED",
        status: "FAILED",
        transactions: [],
        data: { error: "No CallScheduled events in L1 execution tx" },
      },
    ];
  }

  const log = scheduledLogs[scheduledLogs.length - 1];
  const parsed = ctx.timelockInterface.parseLog(log);
  const operationId = parsed.args.id;
  ctx.l1TimelockOperationId = operationId;

  const block = await ctx.l1Provider.getBlock(l1ExecutionTx.blockNumber);
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

  // Track execution
  const executedStage = await trackL1TimelockExecution(
    ctx,
    operationId,
    l1ExecutionTx.blockNumber
  );
  stages.push(executedStage);

  return stages;
}

/**
 * Track L1 timelock execution
 */
async function trackL1TimelockExecution(
  ctx: TrackingContext,
  operationId: string,
  fromBlock: number
): Promise<ProposalStage> {
  const currentBlock = await ctx.l1Provider.getBlockNumber();
  const executedTopic = ctx.timelockInterface.getEventTopic("CallExecuted");

  const logs = await searchLogsInChunks(
    ctx.l1Provider,
    { address: ctx.l1TimelockAddress, topics: [executedTopic, operationId] },
    fromBlock,
    currentBlock,
    ctx.chunkingConfig.l1ChunkSize,
    ctx.chunkingConfig.delayBetweenChunks,
    (chunkLogs) => (chunkLogs.length > 0 ? chunkLogs[0] : null)
  );

  if (logs.length > 0) {
    const log = logs[0];
    const block = await ctx.l1Provider.getBlock(log.blockNumber);
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

  // Check timelock state
  const timelock = new ethers.Contract(
    ctx.l1TimelockAddress,
    TimelockABI,
    ctx.l1Provider
  );
  try {
    const isReady = await timelock.isOperationReady(operationId);
    if (isReady) {
      return {
        type: "L1_TIMELOCK_EXECUTED",
        status: "PENDING",
        transactions: [],
        data: { operationId, message: "Operation ready for execution" },
      };
    }

    const isPending = await timelock.isOperationPending(operationId);
    if (isPending) {
      const timestamp = await timelock.getTimestamp(operationId);
      return {
        type: "L1_TIMELOCK_EXECUTED",
        status: "PENDING",
        transactions: [],
        data: { operationId, eta: timestamp.toString() },
      };
    }
  } catch (e) {
    console.debug(
      "[trackL1TimelockExecution] Failed to check timelock state:",
      e
    );
  }

  return {
    type: "L1_TIMELOCK_EXECUTED",
    status: "NOT_STARTED",
    transactions: [],
    data: { operationId },
  };
}
