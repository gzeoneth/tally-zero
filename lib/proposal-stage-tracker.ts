/**
 * Arbitrum Governance Proposal Stage Tracker
 *
 * This module tracks the various stages of an Arbitrum governance proposal
 * through its full lifecycle from creation to final execution.
 *
 * Core Governor Proposal Stages:
 * 1. ProposalCreated - Proposal submitted on L2 Governor
 * 2. Voting - Active voting period (14-16 days)
 * 3. ProposalQueued - Queued in L2 Timelock
 * 4. L2TimelockExecuted - L2 Timelock executed (sends L2->L1 message)
 * 5. L2ToL1MessageSent - Cross-chain message initiated
 * 6. L2ToL1MessageConfirmed - L2->L1 message confirmed on L1 (~7 days)
 * 7. L1TimelockQueued - Queued in L1 Timelock
 * 8. L1TimelockExecuted - L1 Timelock executed
 * 9. RetryableCreated - Retryable ticket created (if targeting L2)
 * 10. RetryableRedeemed - Retryable ticket redeemed
 */

import {
  ARBITRUM_RPC_URL,
  CORE_GOVERNOR,
  DEFAULT_CHUNKING_CONFIG,
  ETHEREUM_RPC_URL,
  L1_TIMELOCK,
  L2_CORE_TIMELOCK,
  PROPOSAL_STATE_NAMES,
} from "@/config/arbitrum-governance";
import TimelockABI from "@/data/ArbitrumTimelock_ABI.json";
import GovernorABI from "@/data/L2ArbitrumGovernor_ABI.json";
import { queryWithRetry } from "@/lib/rpc-utils";
import type {
  ChunkingConfig,
  ProposalStage,
  ProposalTrackingResult,
  StageStatus,
  StageTransaction,
} from "@/types/proposal-stage";
import {
  ArbitrumProvider,
  ChildToParentMessageStatus,
  ChildTransactionReceipt,
  ParentToChildMessageStatus,
  ParentTransactionReceipt,
} from "@arbitrum/sdk";
import { ethers } from "ethers";

/**
 * Helper to wait for a given number of milliseconds
 */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Debug logging function type
 */
type DebugLogger = (...args: unknown[]) => void;

/**
 * No-op debug logger (default when verbose is disabled)
 */
const noopLogger: DebugLogger = () => {};

/**
 * Search for logs in chunks to handle RPC block range limits
 * @param earlyExitCheck - Optional callback to check if we should stop searching (for finding specific matches)
 */
async function searchLogsInChunks(
  provider: ethers.providers.Provider,
  filter: ethers.providers.Filter,
  fromBlock: number,
  toBlock: number,
  chunkSize: number,
  delayBetweenChunks: number,
  debug: DebugLogger = noopLogger,
  label: string = "logs",
  earlyExitCheck?: (logs: ethers.providers.Log[]) => ethers.providers.Log | null
): Promise<ethers.providers.Log[]> {
  const allLogs: ethers.providers.Log[] = [];
  const totalChunks = Math.ceil((toBlock - fromBlock + 1) / chunkSize);
  let chunkIndex = 0;

  debug(
    `Searching ${label} from block ${fromBlock} to ${toBlock} (${totalChunks} chunks)`
  );

  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, toBlock);
    chunkIndex++;

    debug(`  Chunk ${chunkIndex}/${totalChunks}: blocks ${start}-${end}`);

    const logs = await queryWithRetry(() =>
      provider.getLogs({
        ...filter,
        fromBlock: start,
        toBlock: end,
      })
    );

    if (logs.length > 0) {
      debug(`    Found ${logs.length} logs in this chunk`);
    }

    allLogs.push(...logs);

    // Check for early exit if callback provided
    if (earlyExitCheck && logs.length > 0) {
      const match = earlyExitCheck(logs);
      if (match) {
        debug(`    Early exit: found matching log`);
        return allLogs;
      }
    }

    if (end < toBlock && delayBetweenChunks > 0) {
      await wait(delayBetweenChunks);
    }
  }

  debug(`  Total ${label} found: ${allLogs.length}`);
  return allLogs;
}

/**
 * Get L1 block number from an L2 transaction receipt (requires ArbitrumProvider)
 */
function getL1BlockNumberFromReceipt(
  receipt: ethers.providers.TransactionReceipt
): number {
  const l1BlockNumber = (receipt as { l1BlockNumber?: unknown }).l1BlockNumber;

  if (typeof l1BlockNumber === "number") {
    return l1BlockNumber;
  }
  if (typeof l1BlockNumber === "string") {
    return parseInt(l1BlockNumber, l1BlockNumber.startsWith("0x") ? 16 : 10);
  }
  if (
    l1BlockNumber &&
    typeof (l1BlockNumber as ethers.BigNumber).toNumber === "function"
  ) {
    return (l1BlockNumber as ethers.BigNumber).toNumber();
  }

  throw new Error("Receipt missing l1BlockNumber - must use ArbitrumProvider");
}

/**
 * Main class for tracking Arbitrum governance proposal stages
 */
export class ProposalStageTracker {
  private readonly governorInterface: ethers.utils.Interface;
  private readonly timelockInterface: ethers.utils.Interface;
  private readonly baseL2Provider: ethers.providers.Provider;
  private readonly debug: DebugLogger;

  constructor(
    private readonly l2Provider: ethers.providers.Provider,
    private readonly l1Provider: ethers.providers.Provider,
    private readonly governorAddress: string,
    private readonly l2TimelockAddress: string,
    private readonly l1TimelockAddress: string,
    private readonly chunkingConfig: ChunkingConfig = DEFAULT_CHUNKING_CONFIG,
    baseL2Provider?: ethers.providers.Provider,
    debugLogger?: DebugLogger
  ) {
    this.governorInterface = new ethers.utils.Interface(GovernorABI);
    this.timelockInterface = new ethers.utils.Interface(TimelockABI);
    this.baseL2Provider = baseL2Provider || l2Provider;
    this.debug = debugLogger || noopLogger;
  }

  /**
   * Track all stages of a proposal given its ID and creation transaction hash
   */
  async trackProposal(
    proposalId: string,
    creationTxHash: string
  ): Promise<ProposalTrackingResult> {
    const stages: ProposalStage[] = [];

    this.debug("Getting creation transaction receipt...");
    // Get the creation transaction receipt
    const creationReceipt = await queryWithRetry(() =>
      this.l2Provider.getTransactionReceipt(creationTxHash)
    );
    if (!creationReceipt) {
      throw new Error(`Transaction not found: ${creationTxHash}`);
    }
    this.debug(`  Receipt found at L2 block ${creationReceipt.blockNumber}`);

    const creationL1BlockNumber = getL1BlockNumberFromReceipt(creationReceipt);
    this.debug(`  L1 block number at creation: ${creationL1BlockNumber}`);

    // Stage 1: Proposal Created
    this.debug("\n[Stage 1] Tracking PROPOSAL_CREATED...");
    const createdStage = await this.trackProposalCreated(
      proposalId,
      creationReceipt
    );
    stages.push(createdStage);
    this.debug(`  Result: ${createdStage.status}`);

    // Get current proposal state from governor
    const governor = new ethers.Contract(
      this.governorAddress,
      GovernorABI,
      this.l2Provider
    );
    let currentState: string | undefined;
    try {
      const stateNum = await governor.state(proposalId);
      currentState =
        PROPOSAL_STATE_NAMES[stateNum as keyof typeof PROPOSAL_STATE_NAMES];
    } catch (error) {
      console.warn("Failed to get proposal state:", error);
    }

    // Stage 2: Voting Active (derived from proposal state)
    this.debug("\n[Stage 2] Tracking VOTING_ACTIVE...");
    const votingStage = await this.trackVotingStage(
      proposalId,
      creationReceipt
    );
    stages.push(votingStage);
    this.debug(`  Result: ${votingStage.status}`);

    // Stage 3: Proposal Queued
    this.debug("\n[Stage 3] Tracking PROPOSAL_QUEUED...");
    const queuedStage = await this.trackProposalQueued(
      proposalId,
      creationReceipt.blockNumber
    );
    stages.push(queuedStage);
    this.debug(`  Result: ${queuedStage.status}`);

    // If not queued yet, return early
    if (queuedStage.status !== "COMPLETED") {
      this.debug("  Stopping early - proposal not yet queued");
      return {
        proposalId,
        creationTxHash,
        governorAddress: this.governorAddress,
        stages,
        currentState,
      };
    }

    // Get proposal data for computing operation IDs
    this.debug("\n  Getting proposal data for operation ID computation...");
    const proposalData = await this.getProposalData(
      proposalId,
      creationReceipt.blockNumber
    );

    // Stage 4: L2 Timelock Executed
    this.debug("\n[Stage 4] Tracking L2_TIMELOCK_EXECUTED...");
    const l2TimelockStage = await this.trackL2TimelockExecution(
      proposalData,
      queuedStage.transactions[0]?.blockNumber || creationReceipt.blockNumber
    );
    stages.push(l2TimelockStage);
    this.debug(`  Result: ${l2TimelockStage.status}`);

    // If L2 timelock not executed, return early
    if (l2TimelockStage.status !== "COMPLETED") {
      this.debug("  Stopping early - L2 timelock not yet executed");
      return {
        proposalId,
        creationTxHash,
        governorAddress: this.governorAddress,
        stages,
        currentState,
      };
    }

    // Stage 5 & 6: L2 to L1 Message
    this.debug("\n[Stage 5-6] Tracking L2_TO_L1_MESSAGE...");
    const l2ToL1Result = await this.trackL2ToL1Message(
      l2TimelockStage.transactions[0].hash,
      creationL1BlockNumber
    );
    stages.push(...l2ToL1Result.stages);
    for (const stage of l2ToL1Result.stages) {
      this.debug(`  ${stage.type}: ${stage.status}`);
    }

    // Find the L2->L1 message confirmed stage
    const l2ToL1ConfirmedStage = l2ToL1Result.stages.find(
      (s) => s.type === "L2_TO_L1_MESSAGE_CONFIRMED"
    );

    // If L2->L1 message not executed, return early
    if (!l2ToL1ConfirmedStage || l2ToL1ConfirmedStage.status !== "COMPLETED") {
      this.debug(
        "  Stopping early - L2->L1 message not yet confirmed/executed"
      );
      return {
        proposalId,
        creationTxHash,
        governorAddress: this.governorAddress,
        stages,
        currentState,
      };
    }

    // Stage 7 & 8: L1 Timelock
    // SDK tells us the message was executed, now search for L1 Timelock events
    this.debug("\n[Stage 7-8] Tracking L1_TIMELOCK...");
    const l1TimelockStages = await this.trackL1TimelockFromCreation(
      l2TimelockStage.transactions[0].hash
    );
    stages.push(...l1TimelockStages);
    for (const stage of l1TimelockStages) {
      this.debug(`  ${stage.type}: ${stage.status}`);
    }

    // Find the L1 timelock execution stage
    const l1ExecutedStage = l1TimelockStages.find(
      (s) => s.type === "L1_TIMELOCK_EXECUTED"
    );

    // If L1 timelock not executed, return early
    if (!l1ExecutedStage || l1ExecutedStage.status !== "COMPLETED") {
      this.debug("  Stopping early - L1 timelock not yet executed");
      return {
        proposalId,
        creationTxHash,
        governorAddress: this.governorAddress,
        stages,
        currentState,
      };
    }

    // Stage 9 & 10: Retryable tickets (if any)
    this.debug("\n[Stage 9-10] Tracking RETRYABLES...");
    const retryableStages = await this.trackRetryables(
      l1ExecutedStage.transactions[0].hash
    );
    stages.push(...retryableStages);
    for (const stage of retryableStages) {
      this.debug(`  ${stage.type}: ${stage.status}`);
    }

    return {
      proposalId,
      creationTxHash,
      governorAddress: this.governorAddress,
      stages,
      currentState,
    };
  }

  /**
   * Track the ProposalCreated stage
   */
  private async trackProposalCreated(
    proposalId: string,
    creationReceipt: ethers.providers.TransactionReceipt
  ): Promise<ProposalStage> {
    // Verify the proposal was created in this transaction
    const proposalCreatedTopic =
      this.governorInterface.getEventTopic("ProposalCreated");
    const createdLog = creationReceipt.logs.find(
      (log) =>
        log.topics[0] === proposalCreatedTopic &&
        log.address.toLowerCase() === this.governorAddress.toLowerCase()
    );

    if (!createdLog) {
      return {
        type: "PROPOSAL_CREATED",
        status: "FAILED",
        transactions: [],
        data: { error: "ProposalCreated event not found in transaction" },
      };
    }

    const parsed = this.governorInterface.parseLog(createdLog);
    const createdProposalId = parsed.args.proposalId.toHexString();

    // Verify the proposal ID matches
    const normalizedInputId = ethers.BigNumber.from(proposalId).toHexString();
    if (createdProposalId !== normalizedInputId) {
      return {
        type: "PROPOSAL_CREATED",
        status: "FAILED",
        transactions: [],
        data: {
          error: "Proposal ID mismatch",
          expected: normalizedInputId,
          found: createdProposalId,
        },
      };
    }

    const block = await this.l2Provider.getBlock(creationReceipt.blockNumber);

    return {
      type: "PROPOSAL_CREATED",
      status: "COMPLETED",
      transactions: [
        {
          hash: creationReceipt.transactionHash,
          blockNumber: creationReceipt.blockNumber,
          timestamp: block.timestamp,
          chain: "L2",
        },
      ],
      data: {
        proposer: parsed.args.proposer,
        targets: parsed.args.targets,
        description: parsed.args.description,
        startBlock: parsed.args.startBlock.toString(),
        endBlock: parsed.args.endBlock.toString(),
      },
    };
  }

  /**
   * Track the voting stage
   */
  private async trackVotingStage(
    proposalId: string,
    creationReceipt: ethers.providers.TransactionReceipt
  ): Promise<ProposalStage> {
    const governor = new ethers.Contract(
      this.governorAddress,
      GovernorABI,
      this.l2Provider
    );

    try {
      const state = await governor.state(proposalId);

      // Get vote counts
      const [againstVotes, forVotes, abstainVotes] =
        await governor.proposalVotes(proposalId);

      let status: StageStatus;
      if (state === 0) {
        // Pending
        status = "NOT_STARTED";
      } else if (state === 1) {
        // Active
        status = "PENDING";
      } else if (state === 2 || state === 3 || state === 6) {
        // Canceled, Defeated, Expired
        status = "FAILED";
      } else {
        // Succeeded, Queued, or Executed - voting is complete
        status = "COMPLETED";
      }

      return {
        type: "VOTING_ACTIVE",
        status,
        transactions: [
          {
            hash: creationReceipt.transactionHash,
            blockNumber: creationReceipt.blockNumber,
            chain: "L2",
          },
        ],
        data: {
          state:
            PROPOSAL_STATE_NAMES[state as keyof typeof PROPOSAL_STATE_NAMES],
          forVotes: ethers.utils.formatEther(forVotes),
          againstVotes: ethers.utils.formatEther(againstVotes),
          abstainVotes: ethers.utils.formatEther(abstainVotes),
        },
      };
    } catch (error) {
      return {
        type: "VOTING_ACTIVE",
        status: "FAILED",
        transactions: [],
        data: { error: String(error) },
      };
    }
  }

  /**
   * Track the ProposalQueued stage
   */
  private async trackProposalQueued(
    proposalId: string,
    fromBlock: number
  ): Promise<ProposalStage> {
    const currentBlock = await this.l2Provider.getBlockNumber();

    // Search for ProposalQueued event
    const queuedTopic = this.governorInterface.getEventTopic("ProposalQueued");
    const proposalIdBN = ethers.BigNumber.from(proposalId);

    const logs = await searchLogsInChunks(
      this.l2Provider,
      {
        address: this.governorAddress,
        topics: [queuedTopic],
      },
      fromBlock,
      currentBlock,
      this.chunkingConfig.l2ChunkSize,
      this.chunkingConfig.delayBetweenChunks,
      this.debug,
      "ProposalQueued events",
      (chunkLogs) => {
        for (const log of chunkLogs) {
          const parsed = this.governorInterface.parseLog(log);
          if (parsed.args.proposalId.eq(proposalIdBN)) return log;
        }
        return null;
      }
    );

    // Find the log for our proposal
    for (const log of logs) {
      const parsed = this.governorInterface.parseLog(log);
      if (parsed.args.proposalId.eq(proposalIdBN)) {
        const block = await this.l2Provider.getBlock(log.blockNumber);
        return {
          type: "PROPOSAL_QUEUED",
          status: "COMPLETED",
          transactions: [
            {
              hash: log.transactionHash,
              blockNumber: log.blockNumber,
              timestamp: block.timestamp,
              chain: "L2",
            },
          ],
          data: {
            eta: parsed.args.eta?.toString(),
          },
        };
      }
    }

    // Check if proposal is in a state where queuing is expected
    const governor = new ethers.Contract(
      this.governorAddress,
      GovernorABI,
      this.l2Provider
    );
    try {
      const state = await governor.state(proposalId);
      if (state === 4) {
        // Succeeded
        return {
          type: "PROPOSAL_QUEUED",
          status: "PENDING",
          transactions: [],
          data: { message: "Proposal succeeded, waiting to be queued" },
        };
      } else if (state === 0 || state === 1) {
        // Pending or Active
        return {
          type: "PROPOSAL_QUEUED",
          status: "NOT_STARTED",
          transactions: [],
        };
      } else if (state === 2 || state === 3 || state === 6) {
        // Canceled, Defeated, Expired
        return {
          type: "PROPOSAL_QUEUED",
          status: "FAILED",
          transactions: [],
          data: {
            state:
              PROPOSAL_STATE_NAMES[state as keyof typeof PROPOSAL_STATE_NAMES],
          },
        };
      }
    } catch (error) {
      // Ignore state check errors
    }

    return {
      type: "PROPOSAL_QUEUED",
      status: "NOT_STARTED",
      transactions: [],
    };
  }

  /**
   * Get proposal data from the ProposalCreated event
   */
  private async getProposalData(
    proposalId: string,
    fromBlock: number
  ): Promise<{
    targets: string[];
    values: ethers.BigNumber[];
    calldatas: string[];
    description: string;
  }> {
    const currentBlock = await this.l2Provider.getBlockNumber();
    const createdTopic =
      this.governorInterface.getEventTopic("ProposalCreated");
    const proposalIdBN = ethers.BigNumber.from(proposalId);

    const logs = await searchLogsInChunks(
      this.l2Provider,
      {
        address: this.governorAddress,
        topics: [createdTopic],
      },
      fromBlock,
      currentBlock,
      this.chunkingConfig.l2ChunkSize,
      this.chunkingConfig.delayBetweenChunks,
      this.debug,
      "ProposalCreated events (for data)",
      (chunkLogs) => {
        for (const log of chunkLogs) {
          const parsed = this.governorInterface.parseLog(log);
          if (parsed.args.proposalId.eq(proposalIdBN)) return log;
        }
        return null;
      }
    );

    for (const log of logs) {
      const parsed = this.governorInterface.parseLog(log);
      if (parsed.args.proposalId.eq(proposalIdBN)) {
        // ProposalCreated args: [proposalId, proposer, targets, values, signatures, calldatas, ...]
        const args = parsed.args as unknown as [
          ethers.BigNumber,
          string,
          string[],
          ethers.BigNumber[],
          string[],
          string[],
          ...unknown[],
        ];
        return {
          targets: args[2],
          values: args[3],
          calldatas: args[5],
          description: parsed.args.description,
        };
      }
    }

    throw new Error(
      `ProposalCreated event not found for proposal ${proposalId}`
    );
  }

  /**
   * Track L2 Timelock execution
   */
  private async trackL2TimelockExecution(
    proposalData: {
      targets: string[];
      values: ethers.BigNumber[];
      calldatas: string[];
      description: string;
    },
    fromBlock: number
  ): Promise<ProposalStage> {
    // Compute the operation ID for the timelock
    const operationId = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32"],
        [
          proposalData.targets,
          proposalData.values,
          proposalData.calldatas,
          ethers.constants.HashZero,
          ethers.utils.id(proposalData.description),
        ]
      )
    );

    const currentBlock = await this.l2Provider.getBlockNumber();

    const executedTopic = this.timelockInterface.getEventTopic("CallExecuted");

    const logs = await searchLogsInChunks(
      this.l2Provider,
      {
        address: this.l2TimelockAddress,
        topics: [executedTopic, operationId],
      },
      fromBlock,
      currentBlock,
      this.chunkingConfig.l2ChunkSize,
      this.chunkingConfig.delayBetweenChunks,
      this.debug,
      "L2 Timelock CallExecuted events",
      (chunkLogs) => (chunkLogs.length > 0 ? chunkLogs[0] : null)
    );

    if (logs.length > 0) {
      const log = logs[0];
      const block = await this.l2Provider.getBlock(log.blockNumber);
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
        data: { operationId },
      };
    }

    // Check if operation is pending or ready
    const timelock = new ethers.Contract(
      this.l2TimelockAddress,
      TimelockABI,
      this.l2Provider
    );

    try {
      const isOperation = await timelock.isOperation(operationId);
      if (!isOperation) {
        return {
          type: "L2_TIMELOCK_EXECUTED",
          status: "NOT_STARTED",
          transactions: [],
          data: { operationId },
        };
      }

      const isReady = await timelock.isOperationReady(operationId);
      if (isReady) {
        return {
          type: "L2_TIMELOCK_EXECUTED",
          status: "PENDING",
          transactions: [],
          data: { operationId, message: "Operation ready for execution" },
        };
      }

      const isPending = await timelock.isOperationPending(operationId);
      if (isPending) {
        const timestamp = await timelock.getTimestamp(operationId);
        return {
          type: "L2_TIMELOCK_EXECUTED",
          status: "PENDING",
          transactions: [],
          data: {
            operationId,
            eta: timestamp.toString(),
            message: "Operation pending in timelock",
          },
        };
      }
    } catch (error) {
      // Ignore timelock check errors
    }

    return {
      type: "L2_TIMELOCK_EXECUTED",
      status: "NOT_STARTED",
      transactions: [],
      data: { operationId },
    };
  }

  /**
   * Track L2 to L1 message using Arbitrum SDK
   */
  private async trackL2ToL1Message(
    l2TxHash: string,
    _l1StartBlock: number
  ): Promise<{ stages: ProposalStage[]; firstExecutableBlock: number | null }> {
    const stages: ProposalStage[] = [];
    let firstExecutableBlock: number | null = null;

    // Get receipt from ArbitrumProvider - required for SDK to have l1BlockNumber
    const receipt = await this.l2Provider.getTransactionReceipt(l2TxHash);
    if (!receipt) {
      return {
        stages: [
          {
            type: "L2_TO_L1_MESSAGE_SENT",
            status: "NOT_STARTED",
            transactions: [],
          },
        ],
        firstExecutableBlock: null,
      };
    }

    // Use Arbitrum SDK to get L2->L1 messages from the transaction
    const childReceipt = new ChildTransactionReceipt(receipt);
    const messages = await childReceipt.getChildToParentMessages(
      this.l1Provider
    );

    if (messages.length === 0) {
      return {
        stages: [
          {
            type: "L2_TO_L1_MESSAGE_SENT",
            status: "NOT_STARTED",
            transactions: [],
            data: { message: "No L2 to L1 messages found in transaction" },
          },
        ],
        firstExecutableBlock: null,
      };
    }

    // Message sent stage - messages exist in the transaction
    const block = await this.l2Provider.getBlock(receipt.blockNumber);
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
      data: {
        messageCount: messages.length,
      },
    });

    const messageStatuses: Array<{ status: string }> = [];
    let overallStatus: StageStatus = "PENDING";
    let statusNote = "Waiting for challenge period (~7 days)";

    for (const message of messages) {
      const status = await message.status(this.baseL2Provider);
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
      } else if (status === ChildToParentMessageStatus.UNCONFIRMED) {
        statusNote = "Waiting for challenge period (~7 days)";
      }

      if (firstExecutableBlock === null) {
        const executableBlock = await message.getFirstExecutableBlock(
          this.baseL2Provider
        );
        if (executableBlock) {
          firstExecutableBlock = executableBlock.toNumber();
          this.debug(`  First executable L1 block: ${firstExecutableBlock}`);
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

    return { stages, firstExecutableBlock };
  }

  /**
   * Track L1 Timelock stages
   */
  private async trackL1TimelockFromCreation(
    l2TxHash: string
  ): Promise<ProposalStage[]> {
    const stages: ProposalStage[] = [];
    const currentBlock = await this.l1Provider.getBlockNumber();

    const receipt = await this.l2Provider.getTransactionReceipt(l2TxHash);
    if (!receipt) {
      return [
        {
          type: "L1_TIMELOCK_QUEUED",
          status: "FAILED",
          transactions: [],
          data: { error: "Could not get L2 transaction receipt" },
        },
      ];
    }

    const childReceipt = new ChildTransactionReceipt(receipt);
    const messages = await childReceipt.getChildToParentMessages(
      this.l1Provider
    );

    if (messages.length === 0) {
      return [
        {
          type: "L1_TIMELOCK_QUEUED",
          status: "FAILED",
          transactions: [],
          data: { error: "No L2->L1 messages found" },
        },
      ];
    }

    // Get first executable block from SDK (returns null for already-executed messages)
    const executableBlock = await messages[0].getFirstExecutableBlock(
      this.baseL2Provider
    );
    let fromBlock: number;
    if (executableBlock) {
      fromBlock = executableBlock.toNumber();
      this.debug(`  First executable L1 block from SDK: ${fromBlock}`);
    } else {
      // For executed messages, calculate from L1 block at L2 tx time + challenge period
      const CHALLENGE_PERIOD_L1_BLOCKS = 46080;
      const l1BlockAtL2Tx = getL1BlockNumberFromReceipt(receipt);
      fromBlock = l1BlockAtL2Tx + CHALLENGE_PERIOD_L1_BLOCKS;
      this.debug(`  Calculated first executable L1 block: ${fromBlock}`);
    }

    this.debug(`  Searching L1 from block ${fromBlock}`);

    const scheduledTopic =
      this.timelockInterface.getEventTopic("CallScheduled");

    const scheduledLogs = await searchLogsInChunks(
      this.l1Provider,
      {
        address: this.l1TimelockAddress,
        topics: [scheduledTopic],
      },
      fromBlock,
      currentBlock,
      this.chunkingConfig.l1ChunkSize,
      this.chunkingConfig.delayBetweenChunks,
      this.debug,
      "L1 Timelock CallScheduled events",
      (chunkLogs) => (chunkLogs.length > 0 ? chunkLogs[0] : null)
    );

    if (scheduledLogs.length === 0) {
      return [
        {
          type: "L1_TIMELOCK_QUEUED",
          status: "NOT_STARTED",
          transactions: [],
          data: {
            message: "No CallScheduled events found on L1 Timelock",
          },
        },
      ];
    }

    // For now, take the most recent CallScheduled event
    // TODO: Better matching based on proposal data
    const log = scheduledLogs[scheduledLogs.length - 1];
    const parsed = this.timelockInterface.parseLog(log);
    const operationId = parsed.args.id;

    const block = await this.l1Provider.getBlock(log.blockNumber);
    stages.push({
      type: "L1_TIMELOCK_QUEUED",
      status: "COMPLETED",
      transactions: [
        {
          hash: log.transactionHash,
          blockNumber: log.blockNumber,
          timestamp: block.timestamp,
          chain: "L1",
        },
      ],
      data: {
        operationId,
      },
    });

    // Track L1 Timelock execution
    const executedStage = await this.trackL1TimelockExecution(
      operationId,
      log.blockNumber
    );
    stages.push(executedStage);

    return stages;
  }

  /**
   * Track L1 Timelock stages from a known outbox transaction
   */
  private async trackL1Timelock(
    l1OutboxTxHash: string,
    fromBlock: number
  ): Promise<ProposalStage[]> {
    const stages: ProposalStage[] = [];

    const receipt = await this.l1Provider.getTransactionReceipt(l1OutboxTxHash);
    if (!receipt) {
      return [
        {
          type: "L1_TIMELOCK_QUEUED",
          status: "NOT_STARTED",
          transactions: [],
        },
      ];
    }

    // Look for CallScheduled events
    const scheduledTopic =
      this.timelockInterface.getEventTopic("CallScheduled");
    const scheduledLogs = receipt.logs.filter(
      (log) =>
        log.topics[0] === scheduledTopic &&
        log.address.toLowerCase() === this.l1TimelockAddress.toLowerCase()
    );

    if (scheduledLogs.length === 0) {
      return [
        {
          type: "L1_TIMELOCK_QUEUED",
          status: "NOT_STARTED",
          transactions: [],
          data: {
            message: "No CallScheduled events found in outbox transaction",
          },
        },
      ];
    }

    // Get the operation ID from the first CallScheduled event
    const parsed = this.timelockInterface.parseLog(scheduledLogs[0]);
    const operationId = parsed.args.id;

    const block = await this.l1Provider.getBlock(receipt.blockNumber);
    stages.push({
      type: "L1_TIMELOCK_QUEUED",
      status: "COMPLETED",
      transactions: [
        {
          hash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          timestamp: block.timestamp,
          chain: "L1",
        },
      ],
      data: {
        operationId,
        scheduledCalls: scheduledLogs.length,
      },
    });

    // Track L1 Timelock execution
    const executedStage = await this.trackL1TimelockExecution(
      operationId,
      receipt.blockNumber
    );
    stages.push(executedStage);

    return stages;
  }

  /**
   * Track L1 Timelock execution
   */
  private async trackL1TimelockExecution(
    operationId: string,
    fromBlock: number
  ): Promise<ProposalStage> {
    const currentBlock = await this.l1Provider.getBlockNumber();

    // Search for CallExecuted event
    const executedTopic = this.timelockInterface.getEventTopic("CallExecuted");

    const logs = await searchLogsInChunks(
      this.l1Provider,
      {
        address: this.l1TimelockAddress,
        topics: [executedTopic, operationId],
      },
      fromBlock,
      currentBlock,
      this.chunkingConfig.l1ChunkSize,
      this.chunkingConfig.delayBetweenChunks,
      this.debug,
      "L1 Timelock CallExecuted events",
      (chunkLogs) => (chunkLogs.length > 0 ? chunkLogs[0] : null)
    );

    if (logs.length > 0) {
      const log = logs[0];
      const block = await this.l1Provider.getBlock(log.blockNumber);
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
      this.l1TimelockAddress,
      TimelockABI,
      this.l1Provider
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
          data: {
            operationId,
            eta: timestamp.toString(),
            message: "Operation pending in L1 timelock",
          },
        };
      }
    } catch (error) {
      // Ignore timelock check errors
    }

    return {
      type: "L1_TIMELOCK_EXECUTED",
      status: "NOT_STARTED",
      transactions: [],
      data: { operationId },
    };
  }

  /**
   * Track retryable tickets using Arbitrum SDK
   * Uses ParentTransactionReceipt to get L1→L2 messages and track their creation/redemption
   */
  private async trackRetryables(l1TxHash: string): Promise<ProposalStage[]> {
    const stages: ProposalStage[] = [];

    this.debug("Getting L1 transaction receipt for retryables...");
    const receipt = await this.l1Provider.getTransactionReceipt(l1TxHash);
    if (!receipt) {
      this.debug("  Receipt not found");
      return [];
    }

    // Wrap in ParentTransactionReceipt to use SDK methods
    const parentReceipt = new ParentTransactionReceipt(receipt);

    // Get L1→L2 messages (retryable tickets)
    this.debug("Getting L1→L2 messages from receipt...");
    const messages = await parentReceipt.getParentToChildMessages(
      this.baseL2Provider
    );

    if (messages.length === 0) {
      this.debug("  No L1→L2 messages found (proposal may not target L2)");
      return [];
    }

    this.debug(`  Found ${messages.length} retryable ticket(s)`);

    // Track retryable creation stage
    const l1Block = await this.l1Provider.getBlock(receipt.blockNumber);

    // Collect creation receipts
    const creationTxs: StageTransaction[] = [];
    const creationDetails: Array<{
      index: number;
      l2TxHash: string | null;
      l2Block: number | null;
    }> = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      this.debug(
        `  Getting retryable ${i + 1}/${messages.length} creation receipt...`
      );

      try {
        const creationReceipt = await msg.getRetryableCreationReceipt();
        if (creationReceipt) {
          const l2Block = await this.baseL2Provider.getBlock(
            creationReceipt.blockNumber
          );
          creationTxs.push({
            hash: creationReceipt.transactionHash,
            blockNumber: creationReceipt.blockNumber,
            timestamp: l2Block.timestamp,
            chain: "L2",
          });
          creationDetails.push({
            index: i,
            l2TxHash: creationReceipt.transactionHash,
            l2Block: creationReceipt.blockNumber,
          });
          this.debug(`    Created on L2: ${creationReceipt.transactionHash}`);
        } else {
          creationDetails.push({ index: i, l2TxHash: null, l2Block: null });
          this.debug(`    Creation receipt not found yet`);
        }
      } catch (error) {
        this.debug(`    Error getting creation receipt: ${error}`);
        creationDetails.push({ index: i, l2TxHash: null, l2Block: null });
      }
    }

    // Include L1 tx as first transaction (where retryables originated)
    const allCreationTxs: StageTransaction[] = [
      {
        hash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        timestamp: l1Block.timestamp,
        chain: "L1",
      },
      ...creationTxs,
    ];

    stages.push({
      type: "RETRYABLE_CREATED",
      status: creationTxs.length > 0 ? "COMPLETED" : "PENDING",
      transactions: allCreationTxs,
      data: {
        retryableCount: messages.length,
        creationDetails,
      },
    });

    // Track retryable redemption stage
    const redemptionTxs: StageTransaction[] = [];
    const redemptionDetails: Array<{
      index: number;
      status: string;
      l2TxHash: string | null;
    }> = [];
    let allRedeemed = true;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      this.debug(
        `  Checking retryable ${i + 1}/${messages.length} redemption status...`
      );

      try {
        const redeemResult = await msg.getSuccessfulRedeem();
        const statusName = ParentToChildMessageStatus[redeemResult.status];
        this.debug(`    Status: ${statusName}`);

        if (redeemResult.status === ParentToChildMessageStatus.REDEEMED) {
          // Successfully redeemed
          const txReceipt = redeemResult.childTxReceipt;
          if (txReceipt) {
            const l2Block = await this.baseL2Provider.getBlock(
              txReceipt.blockNumber
            );
            redemptionTxs.push({
              hash: txReceipt.transactionHash,
              blockNumber: txReceipt.blockNumber,
              timestamp: l2Block.timestamp,
              chain: "L2",
            });
            redemptionDetails.push({
              index: i,
              status: statusName,
              l2TxHash: txReceipt.transactionHash,
            });
            this.debug(`    Redeemed at: ${txReceipt.transactionHash}`);
          } else {
            redemptionDetails.push({
              index: i,
              status: statusName,
              l2TxHash: null,
            });
          }
        } else {
          allRedeemed = false;
          redemptionDetails.push({
            index: i,
            status: statusName,
            l2TxHash: null,
          });
          this.debug(`    Not yet redeemed`);
        }
      } catch (error) {
        this.debug(`    Error checking redemption: ${error}`);
        allRedeemed = false;
        redemptionDetails.push({ index: i, status: "ERROR", l2TxHash: null });
      }
    }

    stages.push({
      type: "RETRYABLE_REDEEMED",
      status:
        allRedeemed && redemptionTxs.length === messages.length
          ? "COMPLETED"
          : redemptionTxs.length > 0
            ? "PENDING"
            : "NOT_STARTED",
      transactions: redemptionTxs,
      data: {
        totalRetryables: messages.length,
        redeemedCount: redemptionTxs.length,
        redemptionDetails,
      },
    });

    return stages;
  }
}

/**
 * Create a ProposalStageTracker with mainnet contract addresses
 * Uses ArbitrumProvider for L2 to get l1BlockNumber in tx receipts
 */
export function createMainnetTracker(
  l2RpcUrl: string = ARBITRUM_RPC_URL,
  l1RpcUrl: string = ETHEREUM_RPC_URL,
  chunkingConfig?: Partial<ChunkingConfig>
): ProposalStageTracker {
  const baseL2Provider = new ethers.providers.JsonRpcProvider(l2RpcUrl);
  // ArbitrumProvider wraps the base provider and adds l1BlockNumber to receipts
  const l2Provider = new ArbitrumProvider(baseL2Provider, 42161);
  const l1Provider = new ethers.providers.JsonRpcProvider(l1RpcUrl);

  return new ProposalStageTracker(
    l2Provider,
    l1Provider,
    CORE_GOVERNOR.address,
    L2_CORE_TIMELOCK.address,
    L1_TIMELOCK.address,
    { ...DEFAULT_CHUNKING_CONFIG, ...chunkingConfig },
    baseL2Provider // Pass base provider for SDK status checks
  );
}

/**
 * Format a tracking result for console output
 */
export function formatTrackingResult(result: ProposalTrackingResult): string {
  const lines: string[] = [];

  lines.push("=".repeat(60));
  lines.push("Arbitrum Governance Proposal Stage Tracker");
  lines.push("=".repeat(60));
  lines.push("");
  lines.push(`Proposal ID: ${result.proposalId}`);
  lines.push(`Creation TX: ${result.creationTxHash}`);
  lines.push(`Governor: ${result.governorAddress}`);
  if (result.currentState) {
    lines.push(`Current State: ${result.currentState}`);
  }
  lines.push("");
  lines.push("-".repeat(60));
  lines.push("Stages:");
  lines.push("-".repeat(60));

  for (const stage of result.stages) {
    const statusIcon =
      stage.status === "COMPLETED"
        ? "[OK]"
        : stage.status === "PENDING"
          ? "[..]"
          : stage.status === "FAILED"
            ? "[X]"
            : "[ ]";

    lines.push("");
    lines.push(`${statusIcon} ${stage.type}`);
    lines.push(`    Status: ${stage.status}`);

    if (stage.transactions.length > 0) {
      lines.push(`    Transactions:`);
      for (const tx of stage.transactions) {
        const explorer =
          tx.chain === "L1"
            ? `https://etherscan.io/tx/${tx.hash}`
            : `https://arbiscan.io/tx/${tx.hash}`;
        lines.push(`      - ${tx.hash}`);
        lines.push(`        Block: ${tx.blockNumber} (${tx.chain})`);
        if (tx.timestamp) {
          lines.push(
            `        Time: ${new Date(tx.timestamp * 1000).toISOString()}`
          );
        }
        lines.push(`        Explorer: ${explorer}`);
      }
    }

    if (stage.data && Object.keys(stage.data).length > 0) {
      lines.push(`    Data:`);
      for (const [key, value] of Object.entries(stage.data)) {
        if (typeof value === "string" && value.length > 80) {
          lines.push(`      ${key}: ${value.substring(0, 80)}...`);
        } else {
          lines.push(`      ${key}: ${JSON.stringify(value)}`);
        }
      }
    }
  }

  lines.push("");
  lines.push("=".repeat(60));

  return lines.join("\n");
}
