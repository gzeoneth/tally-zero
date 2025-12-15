import {
  ARBITRUM_NOVA_RPC_URL,
  ARBITRUM_RPC_URL,
  CHALLENGE_PERIOD_L1_BLOCKS,
  CORE_GOVERNOR,
  DEFAULT_CHUNKING_CONFIG,
  DELAYED_INBOX,
  ETHEREUM_RPC_URL,
  L1_TIMELOCK,
  L2_CORE_TIMELOCK,
  L2_TREASURY_TIMELOCK,
  PROPOSAL_STATE_NAMES,
  TREASURY_GOVERNOR,
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
  StageType,
} from "@/types/proposal-stage";
import {
  ArbitrumProvider,
  ChildToParentMessageStatus,
  ChildTransactionReceipt,
  ParentToChildMessageStatus,
  ParentTransactionReceipt,
} from "@arbitrum/sdk";
import { ethers } from "ethers";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type StageProgressCallback = (
  stage: ProposalStage,
  stageIndex: number,
  isComplete: boolean
) => void;

export interface StageMetadata {
  type: StageType;
  title: string;
  description: string;
  chain: "L1" | "L2" | "Cross-chain";
  estimatedDuration?: string;
}

export const STAGE_METADATA: StageMetadata[] = [
  {
    type: "PROPOSAL_CREATED",
    title: "Proposal Created",
    description: "Proposal submitted to the Governor contract",
    chain: "L2",
  },
  {
    type: "VOTING_ACTIVE",
    title: "Voting",
    description: "Token holders vote on the proposal",
    chain: "L2",
    estimatedDuration: "14-16 days",
  },
  {
    type: "PROPOSAL_QUEUED",
    title: "Queued in L2 Timelock",
    description: "Proposal queued in the L2 Timelock",
    chain: "L2",
  },
  {
    type: "L2_TIMELOCK_EXECUTED",
    title: "L2 Timelock Executed",
    description: "Timelock delay passed, execution triggers L2→L1 message",
    chain: "L2",
    estimatedDuration: "3 days",
  },
  {
    type: "L2_TO_L1_MESSAGE_SENT",
    title: "L2→L1 Message Sent",
    description: "Cross-chain message initiated from Arbitrum to Ethereum",
    chain: "Cross-chain",
  },
  {
    type: "L2_TO_L1_MESSAGE_CONFIRMED",
    title: "L2→L1 Message Confirmed",
    description: "Challenge period completed, message ready for L1 execution",
    chain: "Cross-chain",
    estimatedDuration: "~7 days",
  },
  {
    type: "L1_TIMELOCK_QUEUED",
    title: "Queued in L1 Timelock",
    description: "Scheduled on Ethereum L1 Timelock",
    chain: "L1",
  },
  {
    type: "L1_TIMELOCK_EXECUTED",
    title: "L1 Timelock Executed",
    description: "Executed on Ethereum mainnet",
    chain: "L1",
    estimatedDuration: "3 days",
  },
  {
    type: "RETRYABLE_CREATED",
    title: "Retryable Ticket Created",
    description: "L1→L2 retryable ticket created (if proposal targets L2)",
    chain: "Cross-chain",
  },
  {
    type: "RETRYABLE_REDEEMED",
    title: "Retryable Redeemed",
    description: "Final execution on L2 complete",
    chain: "L2",
  },
];

export function getStageMetadata(type: StageType): StageMetadata | undefined {
  return STAGE_METADATA.find((s) => s.type === type);
}

async function searchLogsInChunks(
  provider: ethers.providers.Provider,
  filter: ethers.providers.Filter,
  fromBlock: number,
  toBlock: number,
  chunkSize: number,
  delayBetweenChunks: number,
  earlyExitCheck?: (logs: ethers.providers.Log[]) => ethers.providers.Log | null
): Promise<ethers.providers.Log[]> {
  const allLogs: ethers.providers.Log[] = [];

  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, toBlock);

    const logs = await queryWithRetry(() =>
      provider.getLogs({
        ...filter,
        fromBlock: start,
        toBlock: end,
      })
    );

    allLogs.push(...logs);

    if (earlyExitCheck && logs.length > 0) {
      const match = earlyExitCheck(logs);
      if (match) {
        return allLogs;
      }
    }

    if (end < toBlock && delayBetweenChunks > 0) {
      await wait(delayBetweenChunks);
    }
  }

  return allLogs;
}

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

interface TrackingContext {
  l2Provider: ethers.providers.Provider;
  l1Provider: ethers.providers.Provider;
  baseL2Provider: ethers.providers.Provider;
  governorAddress: string;
  l2TimelockAddress: string;
  l1TimelockAddress: string;
  chunkingConfig: ChunkingConfig;
  governorInterface: ethers.utils.Interface;
  timelockInterface: ethers.utils.Interface;
  proposalId: string;
  creationTxHash: string;
  creationReceipt?: ethers.providers.TransactionReceipt;
  creationL1BlockNumber?: number;
  proposalData?: {
    targets: string[];
    values: ethers.BigNumber[];
    calldatas: string[];
    description: string;
  };
  l2TimelockTxHash?: string;
  l1TimelockOperationId?: string;
  l1ExecutionTxHash?: string;
}

export class IncrementalStageTracker {
  private readonly governorInterface: ethers.utils.Interface;
  private readonly timelockInterface: ethers.utils.Interface;
  private readonly baseL2Provider: ethers.providers.Provider;

  constructor(
    private readonly l2Provider: ethers.providers.Provider,
    private readonly l1Provider: ethers.providers.Provider,
    private readonly governorAddress: string,
    private readonly l2TimelockAddress: string,
    private readonly l1TimelockAddress: string,
    private readonly chunkingConfig: ChunkingConfig = DEFAULT_CHUNKING_CONFIG,
    baseL2Provider?: ethers.providers.Provider
  ) {
    this.governorInterface = new ethers.utils.Interface(GovernorABI);
    this.timelockInterface = new ethers.utils.Interface(TimelockABI);
    this.baseL2Provider = baseL2Provider || l2Provider;
  }

  async trackProposal(
    proposalId: string,
    creationTxHash: string,
    onProgress?: StageProgressCallback,
    existingStages?: ProposalStage[],
    startFromStageIndex?: number
  ): Promise<ProposalTrackingResult> {
    const stages: ProposalStage[] = [];
    const startIndex = startFromStageIndex ?? 0;

    const ctx: TrackingContext = {
      l2Provider: this.l2Provider,
      l1Provider: this.l1Provider,
      baseL2Provider: this.baseL2Provider,
      governorAddress: this.governorAddress,
      l2TimelockAddress: this.l2TimelockAddress,
      l1TimelockAddress: this.l1TimelockAddress,
      chunkingConfig: this.chunkingConfig,
      governorInterface: this.governorInterface,
      timelockInterface: this.timelockInterface,
      proposalId,
      creationTxHash,
    };

    // Helper to add stage and notify
    const addStage = (stage: ProposalStage, isLast: boolean = false) => {
      stages.push(stage);
      if (onProgress) {
        onProgress(stage, stages.length - 1, isLast);
      }
    };

    // Restore context from existing stages if resuming
    if (existingStages && startIndex > 0) {
      for (let i = 0; i < startIndex && i < existingStages.length; i++) {
        const existing = existingStages[i];
        addStage(existing);
        this.restoreContextFromStage(ctx, existing);
      }
    }

    // Get creation receipt (always needed)
    ctx.creationReceipt = await queryWithRetry(() =>
      this.l2Provider.getTransactionReceipt(creationTxHash)
    );
    if (!ctx.creationReceipt) {
      throw new Error(`Transaction not found: ${creationTxHash}`);
    }
    ctx.creationL1BlockNumber = getL1BlockNumberFromReceipt(
      ctx.creationReceipt
    );

    // Get current state
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
    } catch (e) {
      // Intentionally ignored - operation is optional/best-effort
      console.debug(
        "[IncrementalStageTracker] Failed to get current proposal state:",
        e
      );
    }

    // Stage 1: Proposal Created (index 0)
    if (startIndex <= 0) {
      const createdStage = await this.trackProposalCreated(ctx);
      addStage(createdStage);
    }

    // Stage 2: Voting (index 1)
    let votingStage: ProposalStage;
    if (startIndex <= 1) {
      votingStage = await this.trackVotingStage(ctx);
      addStage(votingStage);
    } else {
      votingStage = stages.find((s) => s.type === "VOTING_ACTIVE")!;
    }

    if (votingStage && votingStage.status === "PENDING") {
      return {
        proposalId,
        creationTxHash,
        governorAddress: this.governorAddress,
        stages,
        currentState,
      };
    }

    if (votingStage && votingStage.status === "FAILED") {
      return {
        proposalId,
        creationTxHash,
        governorAddress: this.governorAddress,
        stages,
        currentState,
      };
    }

    // Stage 3: Proposal Queued (index 2)
    let queuedStage: ProposalStage;
    if (startIndex <= 2) {
      queuedStage = await this.trackProposalQueued(ctx);
      addStage(queuedStage);
    } else {
      queuedStage = stages.find((s) => s.type === "PROPOSAL_QUEUED")!;
    }

    if (!queuedStage || queuedStage.status !== "COMPLETED") {
      return {
        proposalId,
        creationTxHash,
        governorAddress: this.governorAddress,
        stages,
        currentState,
      };
    }

    // Get proposal data for operation ID (needed for later stages)
    if (!ctx.proposalData) {
      ctx.proposalData = await this.getProposalData(ctx);
    }

    // Stage 4: L2 Timelock Executed (index 3)
    let l2TimelockStage: ProposalStage;
    if (startIndex <= 3) {
      l2TimelockStage = await this.trackL2TimelockExecution(
        ctx,
        queuedStage.transactions[0]?.blockNumber ||
          ctx.creationReceipt.blockNumber
      );
      addStage(l2TimelockStage);
    } else {
      l2TimelockStage = stages.find((s) => s.type === "L2_TIMELOCK_EXECUTED")!;
    }

    if (!l2TimelockStage || l2TimelockStage.status !== "COMPLETED") {
      return {
        proposalId,
        creationTxHash,
        governorAddress: this.governorAddress,
        stages,
        currentState,
      };
    }

    ctx.l2TimelockTxHash = l2TimelockStage.transactions[0]?.hash;

    // Stages 5-6: L2 to L1 Message (indices 4-5)
    let l2ToL1ConfirmedStage: ProposalStage | undefined;
    if (startIndex <= 5) {
      const l2ToL1Result = await this.trackL2ToL1Message(ctx);
      for (const stage of l2ToL1Result.stages) {
        if (startIndex <= stages.length) {
          addStage(stage);
        }
      }
      l2ToL1ConfirmedStage = l2ToL1Result.stages.find(
        (s) => s.type === "L2_TO_L1_MESSAGE_CONFIRMED"
      );
    } else {
      l2ToL1ConfirmedStage = stages.find(
        (s) => s.type === "L2_TO_L1_MESSAGE_CONFIRMED"
      );
    }

    if (!l2ToL1ConfirmedStage || l2ToL1ConfirmedStage.status !== "COMPLETED") {
      return {
        proposalId,
        creationTxHash,
        governorAddress: this.governorAddress,
        stages,
        currentState,
      };
    }

    // Stages 7-8: L1 Timelock (indices 6-7)
    let l1ExecutedStage: ProposalStage | undefined;
    if (startIndex <= 7) {
      const l1TimelockStages = await this.trackL1Timelock(ctx);
      for (const stage of l1TimelockStages) {
        if (startIndex <= stages.length) {
          addStage(stage);
        }
      }
      l1ExecutedStage = l1TimelockStages.find(
        (s) => s.type === "L1_TIMELOCK_EXECUTED"
      );
    } else {
      l1ExecutedStage = stages.find((s) => s.type === "L1_TIMELOCK_EXECUTED");
    }

    if (!l1ExecutedStage || l1ExecutedStage.status !== "COMPLETED") {
      return {
        proposalId,
        creationTxHash,
        governorAddress: this.governorAddress,
        stages,
        currentState,
      };
    }

    ctx.l1ExecutionTxHash = l1ExecutedStage.transactions[0]?.hash;

    // Stages 9-10: Retryables (indices 8-9)
    const retryableStages = await this.trackRetryables(ctx);
    for (let i = 0; i < retryableStages.length; i++) {
      addStage(retryableStages[i], i === retryableStages.length - 1);
    }

    return {
      proposalId,
      creationTxHash,
      governorAddress: this.governorAddress,
      stages,
      currentState,
    };
  }

  private restoreContextFromStage(
    ctx: TrackingContext,
    stage: ProposalStage
  ): void {
    switch (stage.type) {
      case "L2_TIMELOCK_EXECUTED":
        if (stage.transactions[0]?.hash) {
          ctx.l2TimelockTxHash = stage.transactions[0].hash;
        }
        break;
      case "L1_TIMELOCK_EXECUTED":
        if (stage.transactions[0]?.hash) {
          ctx.l1ExecutionTxHash = stage.transactions[0].hash;
        }
        break;
    }
  }

  private async trackProposalCreated(
    ctx: TrackingContext
  ): Promise<ProposalStage> {
    const proposalCreatedTopic =
      ctx.governorInterface.getEventTopic("ProposalCreated");
    const createdLog = ctx.creationReceipt!.logs.find(
      (log) =>
        log.topics[0] === proposalCreatedTopic &&
        log.address.toLowerCase() === ctx.governorAddress.toLowerCase()
    );

    if (!createdLog) {
      return {
        type: "PROPOSAL_CREATED",
        status: "FAILED",
        transactions: [],
        data: { error: "ProposalCreated event not found" },
      };
    }

    const parsed = ctx.governorInterface.parseLog(createdLog);
    const createdProposalId = parsed.args.proposalId.toHexString();
    const normalizedInputId = ethers.BigNumber.from(
      ctx.proposalId
    ).toHexString();

    if (createdProposalId !== normalizedInputId) {
      return {
        type: "PROPOSAL_CREATED",
        status: "FAILED",
        transactions: [],
        data: { error: "Proposal ID mismatch" },
      };
    }

    const block = await ctx.l2Provider.getBlock(
      ctx.creationReceipt!.blockNumber
    );

    return {
      type: "PROPOSAL_CREATED",
      status: "COMPLETED",
      transactions: [
        {
          hash: ctx.creationReceipt!.transactionHash,
          blockNumber: ctx.creationReceipt!.blockNumber,
          timestamp: block.timestamp,
          chain: "L2",
        },
      ],
      data: {
        proposer: parsed.args.proposer,
        targets: parsed.args.targets,
        description: parsed.args.description?.substring(0, 200) + "...",
        startBlock: parsed.args.startBlock.toString(),
        endBlock: parsed.args.endBlock.toString(),
      },
    };
  }

  private async trackVotingStage(ctx: TrackingContext): Promise<ProposalStage> {
    const governor = new ethers.Contract(
      ctx.governorAddress,
      GovernorABI,
      ctx.l2Provider
    );

    try {
      const state = await governor.state(ctx.proposalId);
      const [againstVotes, forVotes, abstainVotes] =
        await governor.proposalVotes(ctx.proposalId);

      let status: StageStatus;
      if (state === 0) status = "NOT_STARTED";
      else if (state === 1) status = "PENDING";
      else if (state === 2 || state === 3 || state === 6) status = "FAILED";
      else status = "COMPLETED";

      let extensionPossible = true;
      let wasExtended = false;
      let extendedDeadline: string | undefined;

      const proposalExtendedTopic =
        ctx.governorInterface.getEventTopic("ProposalExtended");
      const proposalIdBN = ethers.BigNumber.from(ctx.proposalId);
      const currentBlock = await ctx.l2Provider.getBlockNumber();

      try {
        const extendedLogs = await searchLogsInChunks(
          ctx.l2Provider,
          {
            address: ctx.governorAddress,
            topics: [
              proposalExtendedTopic,
              ethers.utils.hexZeroPad(proposalIdBN.toHexString(), 32),
            ],
          },
          ctx.creationReceipt!.blockNumber,
          currentBlock,
          ctx.chunkingConfig.l2ChunkSize,
          ctx.chunkingConfig.delayBetweenChunks,
          (chunkLogs) => (chunkLogs.length > 0 ? chunkLogs[0] : null)
        );

        if (extendedLogs.length > 0) {
          wasExtended = true;
          extensionPossible = false;
          const parsed = ctx.governorInterface.parseLog(extendedLogs[0]);
          extendedDeadline = parsed.args.extendedDeadline?.toString();
        }
      } catch {
        // Ignore - continue without extension info
      }

      let quorumReached = false;
      if (!wasExtended) {
        try {
          const snapshotBlock = await governor.proposalSnapshot(ctx.proposalId);
          const quorumAmount = await governor.quorum(snapshotBlock);
          const totalVotesForQuorum = forVotes.add(abstainVotes);

          quorumReached = totalVotesForQuorum.gte(quorumAmount);
          if (quorumReached) {
            extensionPossible = false;
          }
        } catch {
          // Ignore - continue without quorum info
        }
      }

      return {
        type: "VOTING_ACTIVE",
        status,
        transactions: [
          {
            hash: ctx.creationTxHash,
            blockNumber: ctx.creationReceipt!.blockNumber,
            chain: "L2",
          },
        ],
        data: {
          state:
            PROPOSAL_STATE_NAMES[state as keyof typeof PROPOSAL_STATE_NAMES],
          forVotes: ethers.utils.formatEther(forVotes),
          againstVotes: ethers.utils.formatEther(againstVotes),
          abstainVotes: ethers.utils.formatEther(abstainVotes),
          extensionPossible,
          wasExtended,
          extendedDeadline,
          quorumReached,
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

  private async trackProposalQueued(
    ctx: TrackingContext
  ): Promise<ProposalStage> {
    const currentBlock = await ctx.l2Provider.getBlockNumber();
    const queuedTopic = ctx.governorInterface.getEventTopic("ProposalQueued");
    const proposalIdBN = ethers.BigNumber.from(ctx.proposalId);

    const logs = await searchLogsInChunks(
      ctx.l2Provider,
      { address: ctx.governorAddress, topics: [queuedTopic] },
      ctx.creationReceipt!.blockNumber,
      currentBlock,
      ctx.chunkingConfig.l2ChunkSize,
      ctx.chunkingConfig.delayBetweenChunks,
      (chunkLogs) => {
        for (const log of chunkLogs) {
          const parsed = ctx.governorInterface.parseLog(log);
          if (parsed.args.proposalId.eq(proposalIdBN)) return log;
        }
        return null;
      }
    );

    for (const log of logs) {
      const parsed = ctx.governorInterface.parseLog(log);
      if (parsed.args.proposalId.eq(proposalIdBN)) {
        const block = await ctx.l2Provider.getBlock(log.blockNumber);
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
          data: { eta: parsed.args.eta?.toString() },
        };
      }
    }

    // Check proposal state
    const governor = new ethers.Contract(
      ctx.governorAddress,
      GovernorABI,
      ctx.l2Provider
    );
    try {
      const state = await governor.state(ctx.proposalId);
      if (state === 4) {
        return {
          type: "PROPOSAL_QUEUED",
          status: "PENDING",
          transactions: [],
          data: { message: "Proposal succeeded, waiting to be queued" },
        };
      } else if (state === 0 || state === 1) {
        return {
          type: "PROPOSAL_QUEUED",
          status: "NOT_STARTED",
          transactions: [],
        };
      } else if (state === 2 || state === 3 || state === 6) {
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
    } catch (e) {
      // Intentionally ignored - operation is optional/best-effort
      console.debug(
        "[IncrementalStageTracker] Failed to check proposal state for queued stage:",
        e
      );
    }

    return { type: "PROPOSAL_QUEUED", status: "NOT_STARTED", transactions: [] };
  }

  private async getProposalData(ctx: TrackingContext): Promise<{
    targets: string[];
    values: ethers.BigNumber[];
    calldatas: string[];
    description: string;
  }> {
    const currentBlock = await ctx.l2Provider.getBlockNumber();
    const createdTopic = ctx.governorInterface.getEventTopic("ProposalCreated");
    const proposalIdBN = ethers.BigNumber.from(ctx.proposalId);

    const logs = await searchLogsInChunks(
      ctx.l2Provider,
      { address: ctx.governorAddress, topics: [createdTopic] },
      ctx.creationReceipt!.blockNumber,
      currentBlock,
      ctx.chunkingConfig.l2ChunkSize,
      ctx.chunkingConfig.delayBetweenChunks,
      (chunkLogs) => {
        for (const log of chunkLogs) {
          const parsed = ctx.governorInterface.parseLog(log);
          if (parsed.args.proposalId.eq(proposalIdBN)) return log;
        }
        return null;
      }
    );

    for (const log of logs) {
      const parsed = ctx.governorInterface.parseLog(log);
      if (parsed.args.proposalId.eq(proposalIdBN)) {
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
      `ProposalCreated event not found for proposal ${ctx.proposalId}`
    );
  }

  private async trackL2TimelockExecution(
    ctx: TrackingContext,
    fromBlock: number
  ): Promise<ProposalStage> {
    const operationId = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32"],
        [
          ctx.proposalData!.targets,
          ctx.proposalData!.values,
          ctx.proposalData!.calldatas,
          ethers.constants.HashZero,
          ethers.utils.id(ctx.proposalData!.description),
        ]
      )
    );

    const currentBlock = await ctx.l2Provider.getBlockNumber();
    const executedTopic = ctx.timelockInterface.getEventTopic("CallExecuted");

    const logs = await searchLogsInChunks(
      ctx.l2Provider,
      { address: ctx.l2TimelockAddress, topics: [executedTopic, operationId] },
      fromBlock,
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
        data: { operationId },
      };
    }

    // Check timelock state
    const timelock = new ethers.Contract(
      ctx.l2TimelockAddress,
      TimelockABI,
      ctx.l2Provider
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
          data: { operationId, eta: timestamp.toString() },
        };
      }
    } catch (e) {
      // Intentionally ignored - operation is optional/best-effort
      console.debug(
        "[IncrementalStageTracker] Failed to check L2 timelock state:",
        e
      );
    }

    return {
      type: "L2_TIMELOCK_EXECUTED",
      status: "NOT_STARTED",
      transactions: [],
      data: { operationId },
    };
  }

  private async trackL2ToL1Message(
    ctx: TrackingContext
  ): Promise<{ stages: ProposalStage[] }> {
    const stages: ProposalStage[] = [];

    const receipt = await ctx.l2Provider.getTransactionReceipt(
      ctx.l2TimelockTxHash!
    );
    if (!receipt) {
      return {
        stages: [
          {
            type: "L2_TO_L1_MESSAGE_SENT",
            status: "NOT_STARTED",
            transactions: [],
          },
        ],
      };
    }

    const childReceipt = new ChildTransactionReceipt(receipt);
    const messages = await childReceipt.getChildToParentMessages(
      ctx.l1Provider
    );

    if (messages.length === 0) {
      return {
        stages: [
          {
            type: "L2_TO_L1_MESSAGE_SENT",
            status: "NOT_STARTED",
            transactions: [],
            data: { message: "No L2→L1 messages found" },
          },
        ],
      };
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

    return { stages };
  }

  private async trackL1Timelock(
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
    const messages = await childReceipt.getChildToParentMessages(
      ctx.l1Provider
    );

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

    const scheduledTopic = ctx.timelockInterface.getEventTopic("CallScheduled");
    const scheduledLogs = await searchLogsInChunks(
      ctx.l1Provider,
      { address: ctx.l1TimelockAddress, topics: [scheduledTopic] },
      fromBlock,
      currentBlock,
      ctx.chunkingConfig.l1ChunkSize,
      ctx.chunkingConfig.delayBetweenChunks,
      (chunkLogs) => (chunkLogs.length > 0 ? chunkLogs[0] : null)
    );

    if (scheduledLogs.length === 0) {
      return [
        {
          type: "L1_TIMELOCK_QUEUED",
          status: "NOT_STARTED",
          transactions: [],
          data: { message: "Waiting for L1 Timelock scheduling" },
        },
      ];
    }

    const log = scheduledLogs[scheduledLogs.length - 1];
    const parsed = ctx.timelockInterface.parseLog(log);
    const operationId = parsed.args.id;
    ctx.l1TimelockOperationId = operationId;

    const block = await ctx.l1Provider.getBlock(log.blockNumber);
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
      data: { operationId },
    });

    // Track execution
    const executedStage = await this.trackL1TimelockExecution(
      ctx,
      operationId,
      log.blockNumber
    );
    stages.push(executedStage);

    return stages;
  }

  private async trackL1TimelockExecution(
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
      // Intentionally ignored - operation is optional/best-effort
      console.debug(
        "[IncrementalStageTracker] Failed to check L1 timelock state:",
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

  private async trackRetryables(
    ctx: TrackingContext
  ): Promise<ProposalStage[]> {
    const stages: ProposalStage[] = [];

    const receipt = await ctx.l1Provider.getTransactionReceipt(
      ctx.l1ExecutionTxHash!
    );
    if (!receipt) {
      return [];
    }

    // Detect target chains by checking which inboxes were interacted with
    const hasArb1Inbox = receipt.logs.some(
      (log) => log.address.toLowerCase() === DELAYED_INBOX.ARB1.toLowerCase()
    );
    const hasNovaInbox = receipt.logs.some(
      (log) => log.address.toLowerCase() === DELAYED_INBOX.NOVA.toLowerCase()
    );

    type ChainInfo = {
      name: "Arb1" | "Nova";
      provider: ethers.providers.Provider;
      chainId: number;
    };

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

    // If no specific inbox detected, default to Arb1
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
    const creationDetails: Array<{
      index: number;
      targetChain: "Arb1" | "Nova";
      l2TxHash: string | null;
      l2Block: number | null;
    }> = [];
    const redemptionTxs: StageTransaction[] = [];
    const redemptionDetails: Array<{
      index: number;
      targetChain: "Arb1" | "Nova";
      status: string;
      l2TxHash: string | null;
    }> = [];

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
            });
            creationDetails.push({
              index: globalIndex,
              targetChain: chain.name,
              l2TxHash: creationReceipt.transactionHash,
              l2Block: creationReceipt.blockNumber,
            });
          } else {
            creationDetails.push({
              index: globalIndex,
              targetChain: chain.name,
              l2TxHash: null,
              l2Block: null,
            });
          }
        } catch (e) {
          // Intentionally ignored - operation is optional/best-effort
          console.debug(
            "[IncrementalStageTracker] Failed to get retryable creation receipt:",
            e
          );
          creationDetails.push({
            index: globalIndex,
            targetChain: chain.name,
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
              });
              redemptionDetails.push({
                index: globalIndex,
                targetChain: chain.name,
                status: statusName,
                l2TxHash: txReceipt.transactionHash,
              });
            } else {
              redemptionDetails.push({
                index: globalIndex,
                targetChain: chain.name,
                status: statusName,
                l2TxHash: null,
              });
            }
          } else {
            allRedeemed = false;
            redemptionDetails.push({
              index: globalIndex,
              targetChain: chain.name,
              status: statusName,
              l2TxHash: null,
            });
          }
        } catch (e) {
          // Intentionally ignored - operation is optional/best-effort
          console.debug(
            "[IncrementalStageTracker] Failed to get retryable redemption status:",
            e
          );
          allRedeemed = false;
          redemptionDetails.push({
            index: globalIndex,
            targetChain: chain.name,
            status: "ERROR",
            l2TxHash: null,
          });
        }
      }

      totalMessages += messages.length;
    }

    if (totalMessages === 0) {
      return [];
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
}

export function createCoreGovernorTracker(
  l2RpcUrl: string = ARBITRUM_RPC_URL,
  l1RpcUrl: string = ETHEREUM_RPC_URL,
  chunkingConfig?: Partial<ChunkingConfig>
): IncrementalStageTracker {
  const baseL2Provider = new ethers.providers.JsonRpcProvider(l2RpcUrl);
  const l2Provider = new ArbitrumProvider(baseL2Provider, 42161);
  const l1Provider = new ethers.providers.JsonRpcProvider(l1RpcUrl);

  return new IncrementalStageTracker(
    l2Provider,
    l1Provider,
    CORE_GOVERNOR.address,
    L2_CORE_TIMELOCK.address,
    L1_TIMELOCK.address,
    { ...DEFAULT_CHUNKING_CONFIG, ...chunkingConfig },
    baseL2Provider
  );
}

export function createTreasuryGovernorTracker(
  l2RpcUrl: string = ARBITRUM_RPC_URL,
  l1RpcUrl: string = ETHEREUM_RPC_URL,
  chunkingConfig?: Partial<ChunkingConfig>
): IncrementalStageTracker {
  const baseL2Provider = new ethers.providers.JsonRpcProvider(l2RpcUrl);
  const l2Provider = new ArbitrumProvider(baseL2Provider, 42161);
  const l1Provider = new ethers.providers.JsonRpcProvider(l1RpcUrl);

  return new IncrementalStageTracker(
    l2Provider,
    l1Provider,
    TREASURY_GOVERNOR.address,
    L2_TREASURY_TIMELOCK.address,
    L1_TIMELOCK.address,
    { ...DEFAULT_CHUNKING_CONFIG, ...chunkingConfig },
    baseL2Provider
  );
}
