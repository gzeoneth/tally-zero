import { PROPOSAL_STATE_NAMES } from "@/config/arbitrum-governance";
import GovernorABI from "@/data/L2ArbitrumGovernor_ABI.json";
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
