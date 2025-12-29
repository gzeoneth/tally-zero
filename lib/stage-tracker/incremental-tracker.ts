import {
  DEFAULT_CHUNKING_CONFIG,
  PROPOSAL_STATE_NAMES,
} from "@/config/arbitrum-governance";
import TimelockABI from "@/data/ArbitrumTimelock_ABI.json";
import GovernorABI from "@/data/L2ArbitrumGovernor_ABI.json";
import { queryWithRetry } from "@/lib/rpc-utils";
import type {
  ChunkingConfig,
  ProposalStage,
  ProposalTrackingResult,
} from "@/types/proposal-stage";
import { ethers } from "ethers";
import { getL1BlockNumberFromReceipt } from "./log-search";
import {
  getProposalData,
  trackL1Timelock,
  trackL2TimelockExecution,
  trackL2ToL1Message,
  trackProposalCreated,
  trackProposalQueued,
  trackRetryables,
  trackVotingStage,
} from "./stages";
import type { StageProgressCallback, TrackingContext } from "./types";

/**
 * Tracks the lifecycle stages of a governance proposal incrementally
 */
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
      console.debug(
        "[IncrementalStageTracker] Failed to get proposal state:",
        e
      );
    }

    // Stage 1: Proposal Created (index 0)
    if (startIndex <= 0) {
      const createdStage = await trackProposalCreated(ctx);
      addStage(createdStage);
    }

    // Stage 2: Voting (index 1)
    let votingStage: ProposalStage;
    if (startIndex <= 1) {
      votingStage = await trackVotingStage(ctx);
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
      queuedStage = await trackProposalQueued(ctx);
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
      ctx.proposalData = await getProposalData(ctx);
    }

    // Stage 4: L2 Timelock Executed (index 3)
    let l2TimelockStage: ProposalStage;
    if (startIndex <= 3) {
      l2TimelockStage = await trackL2TimelockExecution(
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
      const l2ToL1Result = await trackL2ToL1Message(ctx);
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
      const l1TimelockStages = await trackL1Timelock(ctx);
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
    const retryableStages = await trackRetryables(ctx);
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
}
