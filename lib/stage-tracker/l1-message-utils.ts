/**
 * Shared utilities for tracking L2→L1 messages and finding L1 execution transactions.
 *
 * This module provides the core logic for matching L2→L1 messages to their
 * corresponding L1 execution transactions using message position matching.
 */

import type { ChunkingConfig } from "@/types/proposal-stage";
import { getArbitrumNetwork } from "@arbitrum/sdk";
import { BigNumber, ethers } from "ethers";
import { searchLogsInChunks } from "./log-search";

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
 * Get the message position from L2ToL1Tx event in the L2 receipt.
 *
 * The position uniquely identifies the L2→L1 message across all Arbitrum chains.
 * This is used to match the L2 message with the corresponding L1 Outbox execution.
 */
export function getMessagePositionFromReceipt(
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
 * Context needed for finding L1 execution transactions.
 */
export interface L1ExecutionSearchContext {
  l2Provider: ethers.providers.Provider;
  l1Provider: ethers.providers.Provider;
  l1TimelockAddress: string;
  chunkingConfig: ChunkingConfig;
}

/**
 * Find the L1 transaction where the L2→L1 message was executed.
 *
 * This uses the message position from the L2 receipt to search for
 * OutBoxTransactionExecuted events on the Outbox contract, ensuring
 * we find the exact L1 transaction for our specific message.
 *
 * This is critical for correctness when multiple proposals are being
 * processed around the same time - without position matching, we could
 * incorrectly track a different proposal's L1 transaction.
 */
export async function findL1ExecutionTransaction(
  ctx: L1ExecutionSearchContext,
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
