/**
 * Shared tracking for post-L2-timelock stages (stages 4-10)
 *
 * This module provides the single source of truth for tracking all stages
 * after a proposal/operation is queued in the L2 timelock:
 * - L2_TIMELOCK_EXECUTED (stage 4)
 * - L2_TO_L1_MESSAGE_SENT (stage 5)
 * - L2_TO_L1_MESSAGE_CONFIRMED (stage 6)
 * - L1_TIMELOCK_QUEUED (stage 7)
 * - L1_TIMELOCK_EXECUTED (stage 8)
 * - RETRYABLE_CREATED (stage 9)
 * - RETRYABLE_REDEEMED (stage 10)
 *
 * Used by both:
 * - Proposal tracker (after PROPOSAL_QUEUED completes)
 * - Timelock operation tracker (starting from CallScheduled tx)
 */

import {
  ARBITRUM_NOVA_RPC_URL,
  DELAYED_INBOX,
} from "@/config/arbitrum-governance";
import TimelockABI from "@/data/ArbitrumTimelock_ABI.json";
import { addressesEqual } from "@/lib/address-utils";
import type {
  ChunkingConfig,
  ProposalStage,
  StageStatus,
} from "@/types/proposal-stage";
import {
  ChildToParentMessageStatus,
  ChildTransactionReceipt,
  ParentToChildMessageStatus,
  ParentTransactionReceipt,
} from "@arbitrum/sdk";
import { ethers } from "ethers";
import { findL1ExecutionTransaction } from "./l1-message-utils";
import { getL1BlockNumberFromReceipt, searchLogsInChunks } from "./log-search";
import {
  checkTimelockOperationState,
  createTimelockContract,
} from "./timelock-utils";
import type {
  ChainInfo,
  RetryableCreationDetail,
  RetryableRedemptionDetail,
  StageProgressCallback,
  StageTransaction,
} from "./types";

/**
 * Context required for tracking post-L2-timelock stages
 */
export interface PostL2TimelockContext {
  l2Provider: ethers.providers.Provider;
  l1Provider: ethers.providers.Provider;
  baseL2Provider: ethers.providers.Provider;
  chunkingConfig: ChunkingConfig;

  /** The L2 timelock address (Core or Treasury) */
  l2TimelockAddress: string;
  /** The L1 timelock address */
  l1TimelockAddress: string;

  /** The operation ID (keccak256 of proposal parameters) */
  operationId: string;
  /** Block number where CallScheduled/ProposalQueued occurred */
  queueBlockNumber: number;

  /** Populated during tracking: L2 timelock execution tx hash */
  l2TimelockTxHash?: string;
  /** Populated during tracking: L1 timelock execution tx hash */
  l1ExecutionTxHash?: string;
}

/**
 * Result of tracking post-L2-timelock stages
 */
export interface PostL2TimelockResult {
  stages: ProposalStage[];
  /** L2 timelock execution transaction hash (if found) */
  l2TimelockTxHash?: string;
  /** L1 timelock execution transaction hash (if found) */
  l1ExecutionTxHash?: string;
  /** The L1 operation ID (may differ from L2 operation ID) */
  l1OperationId?: string;
}

const timelockInterface = new ethers.utils.Interface(TimelockABI);

// Challenge period in L1 blocks (~7 days at 12s/block)
const CHALLENGE_PERIOD_L1_BLOCKS = 46080;

/**
 * Track all post-L2-timelock stages (stages 4-10)
 *
 * This is the shared core tracking function used by both the proposal
 * tracker and the timelock operation tracker to ensure consistent results.
 *
 * @param ctx - Tracking context with providers and operation info
 * @param onProgress - Optional callback for incremental progress updates
 * @param isCoreGovernor - Whether this is a Core Governor proposal (requires L1 round-trip)
 */
export async function trackPostL2TimelockStages(
  ctx: PostL2TimelockContext,
  onProgress?: StageProgressCallback,
  isCoreGovernor: boolean = true
): Promise<PostL2TimelockResult> {
  const stages: ProposalStage[] = [];
  let stageIndex = 0;
  let l2TimelockTxHash: string | undefined = ctx.l2TimelockTxHash;
  let l1ExecutionTxHash: string | undefined = ctx.l1ExecutionTxHash;
  let l1OperationId: string | undefined;

  const addStage = (stage: ProposalStage, isLast: boolean = false) => {
    stages.push(stage);
    if (onProgress) {
      onProgress(stage, stageIndex, isLast);
    }
    stageIndex++;
  };

  // Stage 4: L2 Timelock Execution
  const l2ExecutionStage = await trackL2TimelockExecution(ctx);
  addStage(
    l2ExecutionStage,
    !isCoreGovernor && l2ExecutionStage.status === "COMPLETED"
  );

  // Extract L2 timelock tx hash for subsequent stages
  if (
    l2ExecutionStage.status === "COMPLETED" &&
    l2ExecutionStage.transactions.length > 0
  ) {
    l2TimelockTxHash = l2ExecutionStage.transactions[0].hash;
  }

  // For Treasury Governor, L2 execution is the final stage
  if (!isCoreGovernor) {
    return { stages, l2TimelockTxHash };
  }

  // Core Governor: Continue with L1 round-trip stages
  if (l2ExecutionStage.status !== "COMPLETED" || !l2TimelockTxHash) {
    // L2 not executed yet, add placeholder stages
    addStage({
      type: "L2_TO_L1_MESSAGE_SENT",
      status: "NOT_STARTED",
      transactions: [],
    });
    addStage({
      type: "L2_TO_L1_MESSAGE_CONFIRMED",
      status: "NOT_STARTED",
      transactions: [],
    });
    addStage({
      type: "L1_TIMELOCK_QUEUED",
      status: "NOT_STARTED",
      transactions: [],
    });
    addStage({
      type: "L1_TIMELOCK_EXECUTED",
      status: "NOT_STARTED",
      transactions: [],
    });
    addStage({
      type: "RETRYABLE_CREATED",
      status: "NOT_STARTED",
      transactions: [],
    });
    addStage(
      {
        type: "RETRYABLE_REDEEMED",
        status: "NOT_STARTED",
        transactions: [],
        data: undefined,
      },
      true
    );

    return { stages, l2TimelockTxHash };
  }

  // Stage 5-6: L2→L1 Message tracking
  const l2ToL1Stages = await trackL2ToL1Message(ctx, l2TimelockTxHash);
  for (const stage of l2ToL1Stages) {
    addStage(stage);
  }

  // Check if L2→L1 message is confirmed (ready for L1 execution)
  const confirmStage = l2ToL1Stages.find(
    (s) => s.type === "L2_TO_L1_MESSAGE_CONFIRMED"
  );
  if (!confirmStage || confirmStage.status !== "COMPLETED") {
    // L2→L1 message not confirmed yet, add placeholder stages
    addStage({
      type: "L1_TIMELOCK_QUEUED",
      status: "NOT_STARTED",
      transactions: [],
    });
    addStage({
      type: "L1_TIMELOCK_EXECUTED",
      status: "NOT_STARTED",
      transactions: [],
    });
    addStage({
      type: "RETRYABLE_CREATED",
      status: "NOT_STARTED",
      transactions: [],
    });
    addStage(
      {
        type: "RETRYABLE_REDEEMED",
        status: "NOT_STARTED",
        transactions: [],
        data: undefined,
      },
      true
    );

    return { stages, l2TimelockTxHash };
  }

  // Stage 7-8: L1 Timelock tracking
  const l1TimelockResult = await trackL1TimelockStages(ctx, l2TimelockTxHash);
  for (const stage of l1TimelockResult.stages) {
    addStage(stage);
  }
  l1OperationId = l1TimelockResult.operationId;

  // Check if L1 timelock is executed
  const l1ExecutedStage = l1TimelockResult.stages.find(
    (s) => s.type === "L1_TIMELOCK_EXECUTED"
  );
  if (!l1ExecutedStage || l1ExecutedStage.status !== "COMPLETED") {
    // L1 timelock not executed yet, add placeholder stages
    addStage({
      type: "RETRYABLE_CREATED",
      status: "NOT_STARTED",
      transactions: [],
    });
    addStage(
      {
        type: "RETRYABLE_REDEEMED",
        status: "NOT_STARTED",
        transactions: [],
        data: undefined,
      },
      true
    );

    return { stages, l2TimelockTxHash, l1OperationId };
  }

  l1ExecutionTxHash = l1TimelockResult.l1ExecutionTxHash;

  // Stage 9-10: Retryable tracking
  if (l1ExecutionTxHash) {
    const retryableStages = await trackRetryables(ctx, l1ExecutionTxHash);
    const lastIndex = retryableStages.length - 1;
    retryableStages.forEach((stage, i) => {
      addStage(stage, i === lastIndex);
    });
  } else {
    addStage({
      type: "RETRYABLE_CREATED",
      status: "NOT_STARTED",
      transactions: [],
    });
    addStage(
      {
        type: "RETRYABLE_REDEEMED",
        status: "NOT_STARTED",
        transactions: [],
        data: undefined,
      },
      true
    );
  }

  return { stages, l2TimelockTxHash, l1ExecutionTxHash, l1OperationId };
}

/**
 * Track L2 timelock execution stage
 */
async function trackL2TimelockExecution(
  ctx: PostL2TimelockContext
): Promise<ProposalStage> {
  // Fast path: Check operation state first to avoid expensive log search
  const timelockContract = createTimelockContract(
    ctx.l2TimelockAddress,
    ctx.l2Provider
  );
  const state = await checkTimelockOperationState(
    timelockContract,
    ctx.operationId
  );

  // If operation is not done, skip log search and return current state
  if (!state.isDone) {
    return {
      type: "L2_TIMELOCK_EXECUTED",
      status: state.status,
      transactions: [],
      data: {
        operationId: ctx.operationId,
        ...(state.message && { message: state.message }),
        ...(state.eta && { eta: state.eta }),
        ...(state.isReady && { isReady: true }),
      },
    };
  }

  // Operation is done - search for the execution transaction to get details
  const currentBlock = await ctx.l2Provider.getBlockNumber();
  const executedTopic = timelockInterface.getEventTopic("CallExecuted");

  const logs = await searchLogsInChunks(
    ctx.l2Provider,
    {
      address: ctx.l2TimelockAddress,
      topics: [executedTopic, ctx.operationId],
    },
    ctx.queueBlockNumber,
    currentBlock,
    ctx.chunkingConfig.l2ChunkSize,
    ctx.chunkingConfig.delayBetweenChunks,
    (chunkLogs) => (chunkLogs.length > 0 ? chunkLogs[0] : null)
  );

  if (logs.length > 0) {
    const log = logs[0];
    const block = await ctx.l2Provider.getBlock(log.blockNumber);
    return {
      type: "L2_TIMELOCK_EXECUTED",
      status: "COMPLETED",
      transactions: [
        {
          hash: log.transactionHash,
          blockNumber: log.blockNumber,
          timestamp: block.timestamp,
          chain: "L2",
        },
      ],
      data: { operationId: ctx.operationId },
    };
  }

  // Fallback: operation done but couldn't find log
  return {
    type: "L2_TIMELOCK_EXECUTED",
    status: "COMPLETED",
    transactions: [],
    data: {
      operationId: ctx.operationId,
      note: "Execution confirmed but transaction not found",
    },
  };
}

/**
 * Track L2→L1 message stages
 */
async function trackL2ToL1Message(
  ctx: PostL2TimelockContext,
  l2TimelockTxHash: string
): Promise<ProposalStage[]> {
  const stages: ProposalStage[] = [];

  const receipt = await ctx.l2Provider.getTransactionReceipt(l2TimelockTxHash);
  if (!receipt) {
    return [
      {
        type: "L2_TO_L1_MESSAGE_SENT",
        status: "NOT_STARTED",
        transactions: [],
      },
      {
        type: "L2_TO_L1_MESSAGE_CONFIRMED",
        status: "NOT_STARTED",
        transactions: [],
      },
    ];
  }

  const childReceipt = new ChildTransactionReceipt(receipt);
  const messages = await childReceipt.getChildToParentMessages(ctx.l1Provider);

  if (messages.length === 0) {
    return [
      {
        type: "L2_TO_L1_MESSAGE_SENT",
        status: "NOT_STARTED",
        transactions: [],
        data: { message: "No L2→L1 messages found" },
      },
      {
        type: "L2_TO_L1_MESSAGE_CONFIRMED",
        status: "NOT_STARTED",
        transactions: [],
      },
    ];
  }

  const block = await ctx.l2Provider.getBlock(receipt.blockNumber);
  stages.push({
    type: "L2_TO_L1_MESSAGE_SENT",
    status: "COMPLETED",
    transactions: [
      {
        hash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        timestamp: block.timestamp,
        chain: "L2",
      },
    ],
    data: { messageCount: messages.length },
  });

  const messageStatuses: Array<{ status: string }> = [];
  let overallStatus: StageStatus = "PENDING";
  let statusNote = "Waiting for challenge period (~7 days)";
  let firstExecutableBlock: number | null = null;

  for (const message of messages) {
    const status = await message.status(ctx.baseL2Provider);
    const statusName = ChildToParentMessageStatus[status];
    messageStatuses.push({ status: statusName });

    if (status === ChildToParentMessageStatus.EXECUTED) {
      overallStatus = "COMPLETED";
      statusNote = "Message executed on L1";
    } else if (
      status === ChildToParentMessageStatus.CONFIRMED &&
      overallStatus !== "COMPLETED"
    ) {
      statusNote = "Message confirmed, ready for L1 execution";
    }

    if (firstExecutableBlock === null) {
      const executableBlock = await message.getFirstExecutableBlock(
        ctx.baseL2Provider
      );
      if (executableBlock) {
        firstExecutableBlock = executableBlock.toNumber();
      }
    }
  }

  stages.push({
    type: "L2_TO_L1_MESSAGE_CONFIRMED",
    status: overallStatus,
    transactions: [],
    data: {
      totalMessages: messages.length,
      messageStatuses,
      note: statusNote,
      firstExecutableBlock,
    },
  });

  return stages;
}

/**
 * Track L1 timelock stages (queued and executed)
 */
async function trackL1TimelockStages(
  ctx: PostL2TimelockContext,
  l2TimelockTxHash: string
): Promise<{
  stages: ProposalStage[];
  operationId?: string;
  l1ExecutionTxHash?: string;
}> {
  const stages: ProposalStage[] = [];
  const currentBlock = await ctx.l1Provider.getBlockNumber();

  // Get L2 receipt
  const receipt = await ctx.l2Provider.getTransactionReceipt(l2TimelockTxHash);
  if (!receipt) {
    return {
      stages: [
        {
          type: "L1_TIMELOCK_QUEUED",
          status: "FAILED",
          transactions: [],
          data: { error: "No L2 receipt" },
        },
        {
          type: "L1_TIMELOCK_EXECUTED",
          status: "NOT_STARTED",
          transactions: [],
        },
      ],
    };
  }

  // Get L2→L1 messages
  const childReceipt = new ChildTransactionReceipt(receipt);
  const messages = await childReceipt.getChildToParentMessages(ctx.l1Provider);

  if (messages.length === 0) {
    return {
      stages: [
        {
          type: "L1_TIMELOCK_QUEUED",
          status: "FAILED",
          transactions: [],
          data: { error: "No L2→L1 messages" },
        },
        {
          type: "L1_TIMELOCK_EXECUTED",
          status: "NOT_STARTED",
          transactions: [],
        },
      ],
    };
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

  // Find the L1 execution transaction via Outbox
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
    return {
      stages: [
        {
          type: "L1_TIMELOCK_QUEUED",
          status: "NOT_STARTED",
          transactions: [],
          data: { message: "Waiting for L1 Timelock scheduling" },
        },
        {
          type: "L1_TIMELOCK_EXECUTED",
          status: "NOT_STARTED",
          transactions: [],
        },
      ],
    };
  }

  // Get the transaction receipt to find CallScheduled events
  const txReceipt = await ctx.l1Provider.getTransactionReceipt(
    l1ExecutionTx.hash
  );
  if (!txReceipt) {
    return {
      stages: [
        {
          type: "L1_TIMELOCK_QUEUED",
          status: "FAILED",
          transactions: [],
          data: { error: "Could not fetch L1 execution receipt" },
        },
        {
          type: "L1_TIMELOCK_EXECUTED",
          status: "NOT_STARTED",
          transactions: [],
        },
      ],
    };
  }

  // Find CallScheduled events in this transaction
  const scheduledTopic = timelockInterface.getEventTopic("CallScheduled");
  const scheduledLogs = txReceipt.logs.filter(
    (log) =>
      addressesEqual(log.address, ctx.l1TimelockAddress) &&
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
        {
          type: "L1_TIMELOCK_EXECUTED",
          status: "NOT_STARTED",
          transactions: [],
        },
      ],
    };
  }

  // Extract operation ID from the CallScheduled event
  const log = scheduledLogs[scheduledLogs.length - 1];
  const parsed = timelockInterface.parseLog(log);
  const operationId = parsed.args.id as string;

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

  // Track L1 timelock execution using the operation ID
  const executedStage = await trackL1TimelockExecution(
    ctx,
    operationId,
    l1ExecutionTx.blockNumber,
    currentBlock
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
 * Track L1 timelock execution
 */
async function trackL1TimelockExecution(
  ctx: PostL2TimelockContext,
  operationId: string,
  fromBlock: number,
  currentBlock: number
): Promise<ProposalStage> {
  // Fast path: Check operation state first
  const timelockContract = createTimelockContract(
    ctx.l1TimelockAddress,
    ctx.l1Provider
  );
  const state = await checkTimelockOperationState(
    timelockContract,
    operationId
  );

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

  // Search for CallExecuted event
  const executedTopic = timelockInterface.getEventTopic("CallExecuted");
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

/**
 * Track retryable ticket stages
 */
async function trackRetryables(
  ctx: PostL2TimelockContext,
  l1ExecutionTxHash: string
): Promise<ProposalStage[]> {
  const stages: ProposalStage[] = [];

  const receipt = await ctx.l1Provider.getTransactionReceipt(l1ExecutionTxHash);
  if (!receipt) {
    return [
      {
        type: "RETRYABLE_CREATED",
        status: "NOT_STARTED",
        transactions: [],
      },
      {
        type: "RETRYABLE_REDEEMED",
        status: "NOT_STARTED",
        transactions: [],
      },
    ];
  }

  // Detect target chains by checking which inboxes were interacted with
  const hasArb1Inbox = receipt.logs.some((log) =>
    addressesEqual(log.address, DELAYED_INBOX.ARB1)
  );
  const hasNovaInbox = receipt.logs.some((log) =>
    addressesEqual(log.address, DELAYED_INBOX.NOVA)
  );

  const chains: ChainInfo[] = [];
  if (hasArb1Inbox) {
    chains.push({
      name: "Arb1",
      provider: ctx.baseL2Provider,
      chainId: 42161,
    });
  }
  if (hasNovaInbox) {
    const novaProvider = new ethers.providers.JsonRpcProvider(
      ARBITRUM_NOVA_RPC_URL
    );
    chains.push({
      name: "Nova",
      provider: novaProvider,
      chainId: 42170,
    });
  }

  // Default to Arb1 if no specific inbox detected
  if (chains.length === 0) {
    chains.push({
      name: "Arb1",
      provider: ctx.baseL2Provider,
      chainId: 42161,
    });
  }

  const parentReceipt = new ParentTransactionReceipt(receipt);
  const l1Block = await ctx.l1Provider.getBlock(receipt.blockNumber);

  const allCreationTxs: StageTransaction[] = [
    {
      hash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      timestamp: l1Block.timestamp,
      chain: "L1",
    },
  ];
  const creationDetails: RetryableCreationDetail[] = [];
  const redemptionTxs: StageTransaction[] = [];
  const redemptionDetails: RetryableRedemptionDetail[] = [];

  let totalMessages = 0;
  let allRedeemed = true;

  for (const chain of chains) {
    const messages = await parentReceipt.getParentToChildMessages(
      chain.provider
    );

    for (let i = 0; i < messages.length; i++) {
      const globalIndex = totalMessages + i;
      const msg = messages[i];

      // Track creation
      try {
        const creationReceipt = await msg.getRetryableCreationReceipt();
        if (creationReceipt) {
          const l2Block = await chain.provider.getBlock(
            creationReceipt.blockNumber
          );
          allCreationTxs.push({
            hash: creationReceipt.transactionHash,
            blockNumber: creationReceipt.blockNumber,
            timestamp: l2Block.timestamp,
            chain: "L2",
            targetChain: chain.name as "Arb1" | "Nova",
          });
          creationDetails.push({
            index: globalIndex,
            targetChain: chain.name as "Arb1" | "Nova",
            l2TxHash: creationReceipt.transactionHash,
            l2Block: creationReceipt.blockNumber,
          });
        } else {
          creationDetails.push({
            index: globalIndex,
            targetChain: chain.name as "Arb1" | "Nova",
            l2TxHash: null,
            l2Block: null,
          });
        }
      } catch {
        creationDetails.push({
          index: globalIndex,
          targetChain: chain.name as "Arb1" | "Nova",
          l2TxHash: null,
          l2Block: null,
        });
      }

      // Track redemption
      try {
        const redeemResult = await msg.getSuccessfulRedeem();
        const statusName = ParentToChildMessageStatus[redeemResult.status];

        if (redeemResult.status === ParentToChildMessageStatus.REDEEMED) {
          const txReceipt = redeemResult.childTxReceipt;
          if (txReceipt) {
            const l2Block = await chain.provider.getBlock(
              txReceipt.blockNumber
            );
            redemptionTxs.push({
              hash: txReceipt.transactionHash,
              blockNumber: txReceipt.blockNumber,
              timestamp: l2Block.timestamp,
              chain: "L2",
              targetChain: chain.name as "Arb1" | "Nova",
            });
            redemptionDetails.push({
              index: globalIndex,
              targetChain: chain.name as "Arb1" | "Nova",
              status: statusName,
              l2TxHash: txReceipt.transactionHash,
            });
          } else {
            redemptionDetails.push({
              index: globalIndex,
              targetChain: chain.name as "Arb1" | "Nova",
              status: statusName,
              l2TxHash: null,
            });
          }
        } else {
          allRedeemed = false;
          redemptionDetails.push({
            index: globalIndex,
            targetChain: chain.name as "Arb1" | "Nova",
            status: statusName,
            l2TxHash: null,
          });
        }
      } catch {
        allRedeemed = false;
        redemptionDetails.push({
          index: globalIndex,
          targetChain: chain.name as "Arb1" | "Nova",
          status: "ERROR",
          l2TxHash: null,
        });
      }
    }

    totalMessages += messages.length;
  }

  if (totalMessages === 0) {
    return [
      {
        type: "RETRYABLE_CREATED",
        status: "NOT_STARTED",
        transactions: [],
        data: { message: "No retryable tickets found" },
      },
      {
        type: "RETRYABLE_REDEEMED",
        status: "NOT_STARTED",
        transactions: [],
      },
    ];
  }

  const targetChains = Array.from(
    new Set(creationDetails.map((d) => d.targetChain))
  );
  const createdCount = creationDetails.filter((d) => d.l2TxHash).length;

  stages.push({
    type: "RETRYABLE_CREATED",
    status: createdCount > 0 ? "COMPLETED" : "PENDING",
    transactions: allCreationTxs,
    data: {
      retryableCount: totalMessages,
      targetChains,
      creationDetails,
    },
  });

  stages.push({
    type: "RETRYABLE_REDEEMED",
    status:
      allRedeemed && redemptionTxs.length === totalMessages
        ? "COMPLETED"
        : redemptionTxs.length > 0
          ? "PENDING"
          : "NOT_STARTED",
    transactions: redemptionTxs,
    data: {
      totalRetryables: totalMessages,
      targetChains,
      redeemedCount: redemptionTxs.length,
      redemptionDetails,
    },
  });

  return stages;
}
