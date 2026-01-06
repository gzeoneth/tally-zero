import type { ProposalStage, StageStatus } from "@/types/proposal-stage";
import {
  ChildToParentMessageStatus,
  ChildTransactionReceipt,
} from "@arbitrum/sdk";
import type { MultiStageResult, TrackingContext } from "../types";

/**
 * Track L2 to L1 message stages (message sent and confirmed)
 */
export async function trackL2ToL1Message(
  ctx: TrackingContext
): Promise<MultiStageResult> {
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
  const messages = await childReceipt.getChildToParentMessages(ctx.l1Provider);

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
      // CONFIRMED means challenge period is over - the "confirmed" stage is complete
      overallStatus = "COMPLETED";
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
