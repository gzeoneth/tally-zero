import {
  PROPOSAL_STATE_NAMES,
  ProposalState,
  isFailedState,
} from "@/config/arbitrum-governance";
import GovernorABI from "@/data/L2ArbitrumGovernor_ABI.json";
import { debugLog } from "@/lib/delay-utils";
import type { ProposalStage, StageStatus } from "@/types/proposal-stage";
import { ethers } from "ethers";
import { searchLogsInChunks } from "../log-search";
import type { TrackingContext } from "../types";

/**
 * Track the voting stage for a proposal
 */
export async function trackVotingStage(
  ctx: TrackingContext
): Promise<ProposalStage> {
  const governor = new ethers.Contract(
    ctx.governorAddress,
    GovernorABI,
    ctx.l2Provider
  );

  try {
    const state = await governor.state(ctx.proposalId);
    const [againstVotes, forVotes, abstainVotes] = await governor.proposalVotes(
      ctx.proposalId
    );

    let status: StageStatus;
    if (state === ProposalState.PENDING) status = "NOT_STARTED";
    else if (state === ProposalState.ACTIVE) status = "PENDING";
    else if (isFailedState(state)) status = "FAILED";
    else status = "COMPLETED";

    let extensionPossible = true;
    let wasExtended = false;
    let extendedDeadline: string | undefined;

    const proposalExtendedTopic =
      ctx.governorInterface.getEventTopic("ProposalExtended");
    const proposalIdBN = ethers.BigNumber.from(ctx.proposalId);
    const currentBlock = await ctx.l2Provider.getBlockNumber();

    // Optimization: For proposals that have finished voting, narrow the search range
    // VotingExtended events only happen during voting, so we can limit search to
    // the proposal's voting period plus a small buffer for extension
    let searchEndBlock = currentBlock;
    const votingFinished =
      state !== ProposalState.PENDING && state !== ProposalState.ACTIVE;

    if (votingFinished) {
      // Voting on Arbitrum lasts ~14-16 days, which is ~5-6M L2 blocks at 250ms/block
      // Add a generous buffer for vote extensions (which can add up to 2 days)
      // Maximum voting period including extensions: ~18 days = ~6.2M L2 blocks
      const maxVotingPeriodBlocks = 6_500_000;
      const creationBlock = ctx.creationReceipt!.blockNumber;
      searchEndBlock = Math.min(
        creationBlock + maxVotingPeriodBlocks,
        currentBlock
      );
      debugLog(
        `[trackVotingStage] Optimized search range: voting finished, searching from ${creationBlock} to ${searchEndBlock} (creation + max voting period)`
      );
    }

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
        searchEndBlock,
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
    let quorumRequired: string | undefined;
    let votesTowardsQuorum: string | undefined;

    try {
      const snapshotBlock = await governor.proposalSnapshot(ctx.proposalId);
      const quorumAmount = await governor.quorum(snapshotBlock);
      const totalVotesForQuorum = forVotes.add(abstainVotes);

      quorumRequired = ethers.utils.formatEther(quorumAmount);
      votesTowardsQuorum = ethers.utils.formatEther(totalVotesForQuorum);

      if (!wasExtended) {
        quorumReached = totalVotesForQuorum.gte(quorumAmount);
        if (quorumReached) {
          extensionPossible = false;
        }
      }
    } catch {
      // Ignore - continue without quorum info
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
        state: PROPOSAL_STATE_NAMES[state as keyof typeof PROPOSAL_STATE_NAMES],
        forVotes: ethers.utils.formatEther(forVotes),
        againstVotes: ethers.utils.formatEther(againstVotes),
        abstainVotes: ethers.utils.formatEther(abstainVotes),
        extensionPossible,
        wasExtended,
        extendedDeadline,
        quorumReached,
        quorumRequired,
        votesTowardsQuorum,
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
