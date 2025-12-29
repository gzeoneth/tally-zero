import { addressesEqual } from "@/lib/address-utils";
import type { ProposalStage } from "@/types/proposal-stage";
import { ethers } from "ethers";
import type { TrackingContext } from "../types";

/**
 * Track the proposal creation stage
 */
export async function trackProposalCreated(
  ctx: TrackingContext
): Promise<ProposalStage> {
  const proposalCreatedTopic =
    ctx.governorInterface.getEventTopic("ProposalCreated");
  const createdLog = ctx.creationReceipt!.logs.find(
    (log) =>
      log.topics[0] === proposalCreatedTopic &&
      addressesEqual(log.address, ctx.governorAddress)
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
  const normalizedInputId = ethers.BigNumber.from(ctx.proposalId).toHexString();

  if (createdProposalId !== normalizedInputId) {
    return {
      type: "PROPOSAL_CREATED",
      status: "FAILED",
      transactions: [],
      data: { error: "Proposal ID mismatch" },
    };
  }

  const block = await ctx.l2Provider.getBlock(ctx.creationReceipt!.blockNumber);

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
      description: parsed.args.description
        ? parsed.args.description.substring(0, 200) + "..."
        : "",
      startBlock: parsed.args.startBlock.toString(),
      endBlock: parsed.args.endBlock.toString(),
    },
  };
}
