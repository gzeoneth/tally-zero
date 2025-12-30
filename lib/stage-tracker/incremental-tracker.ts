import {
  DEFAULT_CHUNKING_CONFIG,
  PROPOSAL_STATE_NAMES,
} from "@/config/arbitrum-governance";
import { isCoreGovernor } from "@/config/governors";
import TimelockABI from "@/data/ArbitrumTimelock_ABI.json";
import GovernorABI from "@/data/L2ArbitrumGovernor_ABI.json";
import { queryWithRetry } from "@/lib/rpc-utils";
import { saveCachedTimelockResult } from "@/lib/unified-cache";
import type {
  ChunkingConfig,
  ProposalStage,
  ProposalTrackingResult,
  TimelockLink,
} from "@/types/proposal-stage";
import { ethers } from "ethers";
import { getL1BlockNumberFromReceipt } from "./log-search";
import {
  trackPostL2TimelockStages,
  type PostL2TimelockContext,
} from "./post-l2-timelock-tracker";
import {
  getProposalData,
  trackProposalCreated,
  trackProposalQueued,
  trackVotingStage,
} from "./stages";
import type { StageProgressCallback, TrackingContext } from "./types";

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

    const addStage = (stage: ProposalStage, isLast: boolean = false) => {
      stages.push(stage);
      if (onProgress) {
        onProgress(stage, stages.length - 1, isLast);
      }
    };

    if (existingStages && startIndex > 0) {
      for (let i = 0; i < startIndex && i < existingStages.length; i++) {
        const existing = existingStages[i];
        addStage(existing);
        this.restoreContextFromStage(ctx, existing);
      }
    }

    ctx.creationReceipt = await queryWithRetry(() =>
      this.l2Provider.getTransactionReceipt(creationTxHash)
    );
    if (!ctx.creationReceipt) {
      throw new Error(`Transaction not found: ${creationTxHash}`);
    }
    ctx.creationL1BlockNumber = getL1BlockNumberFromReceipt(
      ctx.creationReceipt
    );

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

    if (startIndex <= 0) {
      const createdStage = await trackProposalCreated(ctx);
      addStage(createdStage);
    }

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

    // Ensure we have proposal data for operationId computation
    if (!ctx.proposalData) {
      ctx.proposalData = await getProposalData(ctx);
    }

    // Compute operationId for the timelock operation
    const operationId = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32"],
        [
          ctx.proposalData.targets,
          ctx.proposalData.values,
          ctx.proposalData.calldatas,
          ethers.constants.HashZero,
          ethers.utils.id(ctx.proposalData.description),
        ]
      )
    );

    // Create timelockLink for cache referencing
    const queueTxHash = queuedStage.transactions[0]?.hash;
    const queueBlockNumber =
      queuedStage.transactions[0]?.blockNumber ||
      ctx.creationReceipt!.blockNumber;

    const timelockLink: TimelockLink = {
      txHash: queueTxHash || creationTxHash,
      operationId,
      timelockAddress: this.l2TimelockAddress,
      queueBlockNumber,
    };

    // Track stages 4-10 using the shared tracker
    const isCore = isCoreGovernor(this.governorAddress);

    // Restore context from existing stages if resuming
    let existingL2TxHash: string | undefined;
    let existingL1TxHash: string | undefined;

    if (existingStages && startIndex > 3) {
      const l2TimelockStage = existingStages.find(
        (s) => s.type === "L2_TIMELOCK_EXECUTED"
      );
      if (l2TimelockStage?.transactions[0]?.hash) {
        existingL2TxHash = l2TimelockStage.transactions[0].hash;
      }

      const l1ExecutedStage = existingStages.find(
        (s) => s.type === "L1_TIMELOCK_EXECUTED"
      );
      if (l1ExecutedStage?.transactions[0]?.hash) {
        existingL1TxHash = l1ExecutedStage.transactions[0].hash;
      }
    }

    const postL2Context: PostL2TimelockContext = {
      l2Provider: this.l2Provider,
      l1Provider: this.l1Provider,
      baseL2Provider: this.baseL2Provider,
      chunkingConfig: this.chunkingConfig,
      l2TimelockAddress: this.l2TimelockAddress,
      l1TimelockAddress: this.l1TimelockAddress,
      operationId,
      queueBlockNumber,
      l2TimelockTxHash: existingL2TxHash,
      l1ExecutionTxHash: existingL1TxHash,
    };

    // Use shared tracker for stages 4-10
    const postL2Result = await trackPostL2TimelockStages(
      postL2Context,
      (stage, index, isLast) => {
        // Only add stages that haven't been added yet
        if (startIndex <= 3 + index) {
          addStage(stage, isLast);
        }
      },
      isCore
    );

    // If resuming from later stages, add existing stages first
    if (existingStages && startIndex > 3) {
      for (let i = 3; i < startIndex && i < existingStages.length; i++) {
        const existing = existingStages[i];
        if (!stages.find((s) => s.type === existing.type)) {
          stages.push(existing);
        }
      }
    }

    // Save timelock stages to timelock cache for cross-referencing
    if (postL2Result.stages.length > 0) {
      saveCachedTimelockResult(timelockLink.txHash, operationId, {
        operationInfo: {
          operationId,
          target: ctx.proposalData.targets[0] || "",
          value: ctx.proposalData.values[0]?.toString() || "0",
          data: ctx.proposalData.calldatas[0] || "0x",
          predecessor: ethers.constants.HashZero,
          delay: "0",
          txHash: timelockLink.txHash,
          blockNumber: queueBlockNumber,
          timestamp: queuedStage.transactions[0]?.timestamp || 0,
          timelockAddress: this.l2TimelockAddress,
        },
        stages: postL2Result.stages,
      });
    }

    return {
      proposalId,
      creationTxHash,
      governorAddress: this.governorAddress,
      stages,
      currentState,
      timelockLink,
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
