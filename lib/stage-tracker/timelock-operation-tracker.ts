/**
 * Tracker for arbitrary timelock operations (not just proposals)
 *
 * This tracker can start from any transaction that contains a CallScheduled
 * event and track the remaining lifecycle stages.
 */

import {
  ARBITRUM_RPC_URL,
  DEFAULT_CHUNKING_CONFIG,
  ETHEREUM_RPC_URL,
  L1_TIMELOCK,
  L2_CORE_TIMELOCK,
} from "@/config/arbitrum-governance";
import TimelockABI from "@/data/ArbitrumTimelock_ABI.json";
import { queryWithRetry } from "@/lib/rpc-utils";
import type { ChunkingConfig, ProposalStage } from "@/types/proposal-stage";
import {
  ArbitrumProvider,
  ChildToParentMessageStatus,
  ChildTransactionReceipt,
} from "@arbitrum/sdk";
import { ethers } from "ethers";
import { trackL1TimelockStages } from "./l1-timelock-shared";
import { searchLogsInChunks } from "./log-search";
import {
  checkTimelockOperationState,
  createTimelockContract,
} from "./timelock-utils";
import type { StageProgressCallback } from "./types";

export interface TimelockOperationInfo {
  operationId: string;
  target: string;
  value: string;
  data: string;
  predecessor: string;
  delay: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  timelockAddress: string;
}

export interface TimelockTrackingResult {
  operationInfo: TimelockOperationInfo;
  stages: ProposalStage[];
  error?: string;
}

interface TimelockTrackingContext {
  l2Provider: ethers.providers.Provider;
  l1Provider: ethers.providers.Provider;
  baseL2Provider: ethers.providers.Provider;
  timelockInterface: ethers.utils.Interface;
  chunkingConfig: ChunkingConfig;
  operationInfo: TimelockOperationInfo;
  l2TimelockTxHash?: string;
}

/**
 * Parse a transaction to extract CallScheduled events from L2 timelock
 */
export async function parseTimelockTransaction(
  txHash: string,
  l2Provider: ethers.providers.Provider
): Promise<TimelockOperationInfo[]> {
  const timelockInterface = new ethers.utils.Interface(TimelockABI);

  const receipt = await queryWithRetry(() =>
    l2Provider.getTransactionReceipt(txHash)
  );

  if (!receipt) {
    throw new Error(`Transaction not found: ${txHash}`);
  }

  const scheduledTopic = timelockInterface.getEventTopic("CallScheduled");
  const operations: TimelockOperationInfo[] = [];
  const block = await l2Provider.getBlock(receipt.blockNumber);

  for (const log of receipt.logs) {
    // Check if this is a CallScheduled event from a known timelock
    const isKnownTimelock =
      log.address.toLowerCase() === L2_CORE_TIMELOCK.address.toLowerCase();

    if (!isKnownTimelock || log.topics[0] !== scheduledTopic) {
      continue;
    }

    try {
      const parsed = timelockInterface.parseLog(log);
      operations.push({
        operationId: parsed.args.id,
        target: parsed.args.target,
        value: parsed.args.value.toString(),
        data: parsed.args.data,
        predecessor: parsed.args.predecessor,
        delay: parsed.args.delay.toString(),
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        timestamp: block.timestamp,
        timelockAddress: log.address,
      });
    } catch (e) {
      console.debug("[parseTimelockTransaction] Failed to parse log:", e);
    }
  }

  return operations;
}

export class TimelockOperationTracker {
  private readonly timelockInterface: ethers.utils.Interface;
  private readonly baseL2Provider: ethers.providers.Provider;

  constructor(
    private readonly l2Provider: ethers.providers.Provider,
    private readonly l1Provider: ethers.providers.Provider,
    private readonly chunkingConfig: ChunkingConfig = DEFAULT_CHUNKING_CONFIG,
    baseL2Provider?: ethers.providers.Provider
  ) {
    this.timelockInterface = new ethers.utils.Interface(TimelockABI);
    this.baseL2Provider = baseL2Provider || l2Provider;
  }

  async trackOperation(
    operationInfo: TimelockOperationInfo,
    onProgress?: StageProgressCallback
  ): Promise<TimelockTrackingResult> {
    const stages: ProposalStage[] = [];

    const ctx: TimelockTrackingContext = {
      l2Provider: this.l2Provider,
      l1Provider: this.l1Provider,
      baseL2Provider: this.baseL2Provider,
      timelockInterface: this.timelockInterface,
      chunkingConfig: this.chunkingConfig,
      operationInfo,
    };

    const addStage = (stage: ProposalStage, isLast: boolean = false) => {
      stages.push(stage);
      if (onProgress) {
        onProgress(stage, stages.length - 1, isLast);
      }
    };

    // Stage 1: CallScheduled (already happened - this is our starting point)
    const scheduledStage = await this.trackCallScheduled(ctx);
    addStage(scheduledStage);

    // Stage 2: L2 Timelock Executed
    const l2ExecutedStage = await this.trackL2Execution(ctx);
    addStage(l2ExecutedStage);

    if (l2ExecutedStage.status !== "COMPLETED") {
      return { operationInfo, stages };
    }

    ctx.l2TimelockTxHash = l2ExecutedStage.transactions[0]?.hash;

    // Stage 3: L2→L1 Message Sent
    const l2ToL1Stages = await this.trackL2ToL1Message(ctx);
    for (const stage of l2ToL1Stages) {
      addStage(stage);
    }

    const confirmedStage = l2ToL1Stages.find(
      (s) => s.type === "L2_TO_L1_MESSAGE_CONFIRMED"
    );
    if (!confirmedStage || confirmedStage.status !== "COMPLETED") {
      return { operationInfo, stages };
    }

    // Stage 4: L1 Timelock stages
    const l1Stages = await this.trackL1Timelock(ctx);
    for (const stage of l1Stages) {
      addStage(stage);
    }

    const l1ExecutedStage = l1Stages.find(
      (s) => s.type === "L1_TIMELOCK_EXECUTED"
    );
    if (!l1ExecutedStage || l1ExecutedStage.status !== "COMPLETED") {
      return { operationInfo, stages };
    }

    // Stage 5: Retryables
    const retryableStages = await this.trackRetryables(
      ctx,
      l1ExecutedStage.transactions[0]?.hash
    );
    for (let i = 0; i < retryableStages.length; i++) {
      addStage(retryableStages[i], i === retryableStages.length - 1);
    }

    return { operationInfo, stages };
  }

  private async trackCallScheduled(
    ctx: TimelockTrackingContext
  ): Promise<ProposalStage> {
    return {
      type: "PROPOSAL_QUEUED", // Reuse existing stage type for UI compatibility
      status: "COMPLETED",
      transactions: [
        {
          hash: ctx.operationInfo.txHash,
          blockNumber: ctx.operationInfo.blockNumber,
          timestamp: ctx.operationInfo.timestamp,
          chain: "L2",
        },
      ],
      data: {
        operationId: ctx.operationInfo.operationId,
        delay: ctx.operationInfo.delay,
        target: ctx.operationInfo.target,
        isTimelockOperation: true, // Flag to indicate this is a raw timelock op
      },
    };
  }

  /**
   * Track L2 timelock execution with optimization.
   *
   * First checks isOperationDone to determine if log search is needed:
   * - If not done → skip expensive log search, return pending/ready state
   * - If done → search logs to get transaction details
   */
  private async trackL2Execution(
    ctx: TimelockTrackingContext
  ): Promise<ProposalStage> {
    // Fast path: Check operation state first to avoid expensive log search
    const timelockContract = createTimelockContract(
      ctx.operationInfo.timelockAddress,
      ctx.l2Provider
    );
    const state = await checkTimelockOperationState(
      timelockContract,
      ctx.operationInfo.operationId
    );

    // If operation is not done, skip log search and return current state
    if (!state.isDone) {
      return {
        type: "L2_TIMELOCK_EXECUTED",
        status: state.status,
        transactions: [],
        data: {
          operationId: ctx.operationInfo.operationId,
          ...(state.message && { message: state.message }),
          ...(state.eta && { eta: state.eta }),
          ...(state.isReady && { isReady: true }),
        },
      };
    }

    // Operation is done - search for the execution transaction to get details
    const currentBlock = await ctx.l2Provider.getBlockNumber();
    const executedTopic = ctx.timelockInterface.getEventTopic("CallExecuted");

    const logs = await searchLogsInChunks(
      ctx.l2Provider,
      {
        address: ctx.operationInfo.timelockAddress,
        topics: [executedTopic, ctx.operationInfo.operationId],
      },
      ctx.operationInfo.blockNumber,
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
        data: { operationId: ctx.operationInfo.operationId },
      };
    }

    // Fallback: operation done but couldn't find log (shouldn't happen)
    return {
      type: "L2_TIMELOCK_EXECUTED",
      status: "COMPLETED",
      transactions: [],
      data: {
        operationId: ctx.operationInfo.operationId,
        note: "Execution confirmed but transaction not found",
      },
    };
  }

  private async trackL2ToL1Message(
    ctx: TimelockTrackingContext
  ): Promise<ProposalStage[]> {
    const stages: ProposalStage[] = [];

    if (!ctx.l2TimelockTxHash) {
      return [
        {
          type: "L2_TO_L1_MESSAGE_SENT",
          status: "NOT_STARTED",
          transactions: [],
        },
      ];
    }

    const receipt = await ctx.l2Provider.getTransactionReceipt(
      ctx.l2TimelockTxHash
    );
    if (!receipt) {
      return [
        {
          type: "L2_TO_L1_MESSAGE_SENT",
          status: "NOT_STARTED",
          transactions: [],
        },
      ];
    }

    const childReceipt = new ChildTransactionReceipt(receipt);
    const messages = await childReceipt.getChildToParentMessages(
      ctx.l1Provider
    );

    if (messages.length === 0) {
      // No L2→L1 messages means this operation doesn't cross to L1
      // This is the end of the lifecycle for treasury-style operations
      return [];
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

    // Check message status
    const messageStatuses: Array<{ status: string }> = [];
    let overallStatus: "PENDING" | "COMPLETED" = "PENDING";
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
   * Track L1 timelock stages using the shared utility.
   *
   * Uses trackL1TimelockStages which:
   * 1. Finds the OutBoxTransactionExecuted event to get the L1 transaction
   * 2. Parses CallScheduled from that transaction to get the operation ID
   * 3. Uses the operation ID to find the corresponding CallExecuted event
   *
   * This ensures we track the correct L1 transaction even when multiple
   * proposals are being processed around the same time.
   */
  private async trackL1Timelock(
    ctx: TimelockTrackingContext
  ): Promise<ProposalStage[]> {
    if (!ctx.l2TimelockTxHash) {
      return [
        {
          type: "L1_TIMELOCK_QUEUED",
          status: "NOT_STARTED",
          transactions: [],
        },
      ];
    }

    // Check if there are L2→L1 messages first (treasury operations don't have them)
    const receipt = await ctx.l2Provider.getTransactionReceipt(
      ctx.l2TimelockTxHash
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
    const messages = await childReceipt.getChildToParentMessages(
      ctx.l1Provider
    );

    if (messages.length === 0) {
      // No L2→L1 messages means this operation doesn't cross to L1
      return [];
    }

    // Use the shared utility for L1 timelock tracking
    const result = await trackL1TimelockStages({
      l2Provider: ctx.l2Provider,
      l1Provider: ctx.l1Provider,
      baseL2Provider: ctx.baseL2Provider,
      l2TimelockTxHash: ctx.l2TimelockTxHash,
      l1TimelockAddress: L1_TIMELOCK.address,
      chunkingConfig: ctx.chunkingConfig,
    });

    return result.stages;
  }

  private async trackRetryables(
    ctx: TimelockTrackingContext,
    l1TxHash?: string
  ): Promise<ProposalStage[]> {
    if (!l1TxHash) {
      return [];
    }

    // Import retryable tracking logic from existing module
    const { trackRetryables: trackRetryablesFromL1 } = await import(
      "./stages/retryables"
    );

    // Build a minimal context for retryable tracking
    const retryableCtx = {
      l2Provider: ctx.l2Provider,
      l1Provider: ctx.l1Provider,
      baseL2Provider: ctx.baseL2Provider,
      l1ExecutionTxHash: l1TxHash,
      chunkingConfig: ctx.chunkingConfig,
      governorAddress: "",
      l2TimelockAddress: ctx.operationInfo.timelockAddress,
      l1TimelockAddress: L1_TIMELOCK.address,
      governorInterface: ctx.timelockInterface,
      timelockInterface: ctx.timelockInterface,
      proposalId: ctx.operationInfo.operationId,
      creationTxHash: ctx.operationInfo.txHash,
    };

    try {
      return await trackRetryablesFromL1(retryableCtx);
    } catch (e) {
      console.debug("[trackRetryables] Failed to track retryables:", e);
      return [];
    }
  }
}

/**
 * Create a timelock operation tracker with optional RPC providers and chunking config
 */
export function createTimelockOperationTracker(
  l2RpcUrl?: string,
  l1RpcUrl?: string,
  chunkingConfig?: Partial<ChunkingConfig>
): TimelockOperationTracker {
  const baseL2Provider = new ethers.providers.JsonRpcProvider(
    l2RpcUrl || ARBITRUM_RPC_URL
  );
  // Wrap with ArbitrumProvider to get l1BlockNumber in receipts
  const l2Provider = new ArbitrumProvider(baseL2Provider, 42161);
  const l1Provider = new ethers.providers.JsonRpcProvider(
    l1RpcUrl || ETHEREUM_RPC_URL
  );

  const config = { ...DEFAULT_CHUNKING_CONFIG, ...chunkingConfig };

  return new TimelockOperationTracker(
    l2Provider,
    l1Provider,
    config,
    baseL2Provider
  );
}
