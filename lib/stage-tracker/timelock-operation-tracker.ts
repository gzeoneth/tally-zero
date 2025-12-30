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
import { addressesEqual } from "@/lib/address-utils";
import { debug } from "@/lib/debug";
import { queryWithRetry } from "@/lib/rpc-utils";
import type { ChunkingConfig, ProposalStage } from "@/types/proposal-stage";
import { ArbitrumProvider } from "@arbitrum/sdk";
import { ethers } from "ethers";
import {
  trackPostL2TimelockStages,
  type PostL2TimelockContext,
} from "./post-l2-timelock-tracker";
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
    const isKnownTimelock = addressesEqual(
      log.address,
      L2_CORE_TIMELOCK.address
    );

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
      debug.stageTracker("failed to parse timelock log: %O", e);
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

    const addStage = (stage: ProposalStage, isLast: boolean = false) => {
      stages.push(stage);
      if (onProgress) {
        onProgress(stage, stages.length - 1, isLast);
      }
    };

    // Stage 1: CallScheduled (already happened - this is our starting point)
    const scheduledStage: ProposalStage = {
      type: "PROPOSAL_QUEUED", // Reuse existing stage type for UI compatibility
      status: "COMPLETED",
      transactions: [
        {
          hash: operationInfo.txHash,
          blockNumber: operationInfo.blockNumber,
          timestamp: operationInfo.timestamp,
          chain: "L2",
        },
      ],
      data: {
        operationId: operationInfo.operationId,
        delay: operationInfo.delay,
        target: operationInfo.target,
        isTimelockOperation: true, // Flag to indicate this is a raw timelock op
      },
    };
    addStage(scheduledStage);

    // Stages 4-10: Use shared tracker
    const postL2Context: PostL2TimelockContext = {
      l2Provider: this.l2Provider,
      l1Provider: this.l1Provider,
      baseL2Provider: this.baseL2Provider,
      chunkingConfig: this.chunkingConfig,
      l2TimelockAddress: operationInfo.timelockAddress,
      l1TimelockAddress: L1_TIMELOCK.address,
      operationId: operationInfo.operationId,
      queueBlockNumber: operationInfo.blockNumber,
    };

    // Use shared tracker for stages 4-10 (always assume Core Governor path for direct timelock ops)
    const postL2Result = await trackPostL2TimelockStages(
      postL2Context,
      (stage, index, isLast) => {
        addStage(stage, isLast);
      },
      true // Core Governor (full L1 roundtrip path)
    );

    // If no additional stages were added by the shared tracker but we have
    // a completed scheduled stage, that's the result
    if (postL2Result.stages.length === 0 && stages.length === 1) {
      return { operationInfo, stages };
    }

    return { operationInfo, stages };
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
