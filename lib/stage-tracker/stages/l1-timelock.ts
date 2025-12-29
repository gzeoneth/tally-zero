/**
 * Track L1 timelock stages (queued and executed)
 *
 * Uses the shared trackL1TimelockStages utility which:
 * 1. Finds the OutBoxTransactionExecuted event to get the L1 transaction
 * 2. Parses CallScheduled from that transaction to get the operation ID
 * 3. Uses the operation ID to find the corresponding CallExecuted event
 *
 * This ensures we track the correct L1 transaction even when multiple
 * proposals are being processed around the same time.
 */

import type { ProposalStage } from "@/types/proposal-stage";
import { trackL1TimelockStages } from "../l1-timelock-shared";
import type { TrackingContext } from "../types";

export async function trackL1Timelock(
  ctx: TrackingContext
): Promise<ProposalStage[]> {
  if (!ctx.l2TimelockTxHash) {
    return [
      {
        type: "L1_TIMELOCK_QUEUED",
        status: "NOT_STARTED",
        transactions: [],
        data: { message: "L2 timelock execution required first" },
      },
    ];
  }

  const result = await trackL1TimelockStages({
    l2Provider: ctx.l2Provider,
    l1Provider: ctx.l1Provider,
    baseL2Provider: ctx.baseL2Provider,
    l2TimelockTxHash: ctx.l2TimelockTxHash,
    l1TimelockAddress: ctx.l1TimelockAddress,
    chunkingConfig: ctx.chunkingConfig,
  });

  // Store the operation ID in context for downstream use
  if (result.operationId) {
    ctx.l1TimelockOperationId = result.operationId;
  }

  // Store the L1 execution tx hash for retryable tracking
  if (result.l1ExecutionTxHash) {
    ctx.l1ExecutionTxHash = result.l1ExecutionTxHash;
  }

  return result.stages;
}
