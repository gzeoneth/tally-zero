import {
  ARBITRUM_NOVA_RPC_URL,
  DELAYED_INBOX,
} from "@/config/arbitrum-governance";
import { addressesEqual } from "@/lib/address-utils";
import type { ProposalStage } from "@/types/proposal-stage";
import {
  ParentToChildMessageStatus,
  ParentTransactionReceipt,
} from "@arbitrum/sdk";
import { ethers } from "ethers";
import type {
  ChainInfo,
  RetryableCreationDetail,
  RetryableRedemptionDetail,
  StageTransaction,
  TrackingContext,
} from "../types";

/**
 * Track retryable ticket stages (created and redeemed)
 */
export async function trackRetryables(
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
  const hasArb1Inbox = receipt.logs.some((log) =>
    addressesEqual(log.address, DELAYED_INBOX.ARB1)
  );
  const hasNovaInbox = receipt.logs.some((log) =>
    addressesEqual(log.address, DELAYED_INBOX.NOVA)
  );

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
  const creationDetails: RetryableCreationDetail[] = [];
  const redemptionTxs: StageTransaction[] = [];
  const redemptionDetails: RetryableRedemptionDetail[] = [];

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
        console.debug("[trackRetryables] Failed to get creation receipt:", e);
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
        console.debug("[trackRetryables] Failed to get redemption status:", e);
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
