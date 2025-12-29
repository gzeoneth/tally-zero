import type { ProposalStage } from "@/types/proposal-stage";
import { ethers } from "ethers";
import { searchLogsInChunks } from "../log-search";
import { checkTimelockAndBuildStage } from "../timelock-utils";
import type { TrackingContext } from "../types";

/**
 * Get proposal data from the ProposalCreated event
 */
export async function getProposalData(ctx: TrackingContext): Promise<{
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
      const args = parsed.args;
      // args.values conflicts with the built-in iterator method
      return {
        targets: (args.targets ?? args[2]) as string[],
        values: args[3] as ethers.BigNumber[],
        calldatas: (args.calldatas ?? args[5]) as string[],
        description: (args.description ?? args[8]) as string,
      };
    }
  }

  throw new Error(
    `ProposalCreated event not found for proposal ${ctx.proposalId}`
  );
}

/**
 * Track the L2 timelock execution stage
 */
export async function trackL2TimelockExecution(
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

  // Check timelock state using shared utility
  return await checkTimelockAndBuildStage(
    ctx.l2TimelockAddress,
    ctx.l2Provider,
    operationId,
    "L2_TIMELOCK_EXECUTED",
    "trackL2TimelockExecution"
  );
}
