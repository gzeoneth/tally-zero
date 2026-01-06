import {
  PROPOSAL_STATE_NAMES,
  ProposalState,
  isFailedState,
  isPendingOrActiveState,
} from "@/config/arbitrum-governance";
import GovernorABI from "@/data/L2ArbitrumGovernor_ABI.json";
import { debug } from "@/lib/debug";
import type { ProposalStage } from "@/types/proposal-stage";
import { ethers } from "ethers";
import { searchLogsInChunks } from "../log-search";
import type { TrackingContext } from "../types";

/**
 * Track the proposal queued stage
 */
export async function trackProposalQueued(
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
    if (state === ProposalState.SUCCEEDED) {
      return {
        type: "PROPOSAL_QUEUED",
        status: "PENDING",
        transactions: [],
        data: { message: "Proposal succeeded, waiting to be queued" },
      };
    } else if (isPendingOrActiveState(state)) {
      return {
        type: "PROPOSAL_QUEUED",
        status: "NOT_STARTED",
        transactions: [],
      };
    } else if (isFailedState(state)) {
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
    debug.stageTracker("failed to check proposal state: %O", e);
  }

  return { type: "PROPOSAL_QUEUED", status: "NOT_STARTED", transactions: [] };
}
