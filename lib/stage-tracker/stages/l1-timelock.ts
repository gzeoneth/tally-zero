import { CHALLENGE_PERIOD_L1_BLOCKS } from "@/config/arbitrum-governance";
import TimelockABI from "@/data/ArbitrumTimelock_ABI.json";
import type { ProposalStage } from "@/types/proposal-stage";
import { ChildTransactionReceipt, getArbitrumNetwork } from "@arbitrum/sdk";
import { BigNumber, ethers } from "ethers";
import { getL1BlockNumberFromReceipt, searchLogsInChunks } from "../log-search";
import type { TrackingContext } from "../types";

// ArbSys address on Arbitrum (same on all Arbitrum chains)
const ARB_SYS_ADDRESS = "0x0000000000000000000000000000000000000064";

// ArbSys L2ToL1Tx event ABI (Nitro version)
const ARB_SYS_ABI = [
  "event L2ToL1Tx(address indexed caller, address indexed destination, uint256 indexed hash, uint256 position, uint256 arbBlockNum, uint256 ethBlockNum, uint256 timestamp, uint256 callvalue, bytes data)",
];

// Outbox ABI - just the event we need
const OUTBOX_ABI = [
  "event OutBoxTransactionExecuted(address indexed to, address indexed l2Sender, uint256 indexed zero, uint256 transactionIndex)",
];

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
    ctx,
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
 * Get the message position from L2ToL1Tx event in the L2 receipt.
 *
 * The position uniquely identifies the L2→L1 message across all Arbitrum chains.
 */
function getMessagePositionFromReceipt(
  receipt: ethers.providers.TransactionReceipt
): BigNumber | null {
  const arbSysInterface = new ethers.utils.Interface(ARB_SYS_ABI);
  const l2ToL1TxTopic = arbSysInterface.getEventTopic("L2ToL1Tx");

  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() === ARB_SYS_ADDRESS.toLowerCase() &&
      log.topics[0] === l2ToL1TxTopic
    ) {
      try {
        const parsed = arbSysInterface.parseLog(log);
        return parsed.args.position;
      } catch {
        // Continue to next log if parsing fails
      }
    }
  }

  return null;
}

/**
 * Find the L1 transaction where the L2→L1 message was executed.
 *
 * This uses the message position to search for OutBoxTransactionExecuted events
 * on the Outbox contract, ensuring we find the exact transaction for our message.
 */
async function findL1ExecutionTransaction(
  ctx: TrackingContext,
  receipt: ethers.providers.TransactionReceipt,
  fromBlock: number,
  toBlock: number
): Promise<{ hash: string; blockNumber: number } | null> {
  // Get the message position from the L2ToL1Tx event in the receipt
  const messagePosition = getMessagePositionFromReceipt(receipt);
  if (!messagePosition) {
    console.debug("[findL1ExecutionTransaction] No L2ToL1Tx event found");
    return null;
  }

  // Get the Arbitrum network info to find the Outbox address
  const network = await getArbitrumNetwork(ctx.l2Provider);
  const outboxAddress = network.ethBridge.outbox;
  const outboxInterface = new ethers.utils.Interface(OUTBOX_ABI);

  // Search for OutBoxTransactionExecuted events where 'to' is the L1 Timelock
  // The 'to' field is indexed, so we can filter by it
  const executedTopic = outboxInterface.getEventTopic(
    "OutBoxTransactionExecuted"
  );
  const toTopic = ethers.utils.hexZeroPad(ctx.l1TimelockAddress, 32);

  const logs = await searchLogsInChunks(
    ctx.l1Provider,
    {
      address: outboxAddress,
      topics: [executedTopic, toTopic],
    },
    fromBlock,
    toBlock,
    ctx.chunkingConfig.l1ChunkSize,
    ctx.chunkingConfig.delayBetweenChunks,
    // Don't early exit - we need to check transactionIndex for each log
    undefined
  );

  // Filter logs by transactionIndex matching our message position
  for (const log of logs) {
    const parsed = outboxInterface.parseLog(log);
    const transactionIndex = parsed.args.transactionIndex;

    if (transactionIndex.eq(messagePosition)) {
      return {
        hash: log.transactionHash,
        blockNumber: log.blockNumber,
      };
    }
  }

  return null;
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
