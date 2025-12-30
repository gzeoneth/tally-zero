/**
 * Tests for stage-tracker-core utilities
 */

import type {
  ProposalStage,
  StageStatus,
  StageType,
} from "@/types/proposal-stage";
import { describe, expect, it } from "vitest";

import { getCurrentStageIndex } from "./stage-tracker-core";

// Helper to create a stage with minimal required fields
function createStage(
  status: StageStatus,
  type: StageType = "PROPOSAL_CREATED"
): ProposalStage {
  return {
    type,
    status,
    transactions: [],
  };
}

describe("getCurrentStageIndex", () => {
  it("returns -1 for empty array", () => {
    expect(getCurrentStageIndex([])).toBe(-1);
  });

  it("returns -1 for undefined input", () => {
    expect(getCurrentStageIndex(undefined as unknown as ProposalStage[])).toBe(
      -1
    );
  });

  it("returns 0 for single stage with any status except NOT_STARTED", () => {
    expect(getCurrentStageIndex([createStage("PENDING")])).toBe(0);
    expect(getCurrentStageIndex([createStage("COMPLETED")])).toBe(0);
    expect(getCurrentStageIndex([createStage("FAILED")])).toBe(0);
  });

  it("returns 0 for all NOT_STARTED stages (edge case - first stage)", () => {
    const stages = [
      createStage("NOT_STARTED"),
      createStage("NOT_STARTED"),
      createStage("NOT_STARTED"),
    ];
    expect(getCurrentStageIndex(stages)).toBe(0);
  });

  it("returns index of last non-NOT_STARTED stage", () => {
    const stages = [
      createStage("COMPLETED"),
      createStage("COMPLETED"),
      createStage("PENDING"),
      createStage("NOT_STARTED"),
      createStage("NOT_STARTED"),
    ];
    expect(getCurrentStageIndex(stages)).toBe(2);
  });

  it("returns last index if all stages are completed", () => {
    const stages = [
      createStage("COMPLETED"),
      createStage("COMPLETED"),
      createStage("COMPLETED"),
    ];
    expect(getCurrentStageIndex(stages)).toBe(2);
  });

  it("handles FAILED stage status", () => {
    const stages = [
      createStage("COMPLETED"),
      createStage("FAILED"),
      createStage("NOT_STARTED"),
    ];
    expect(getCurrentStageIndex(stages)).toBe(1);
  });

  it("handles mixed PENDING and COMPLETED stages", () => {
    const stages = [
      createStage("COMPLETED"),
      createStage("COMPLETED"),
      createStage("PENDING"),
      createStage("NOT_STARTED"),
    ];
    expect(getCurrentStageIndex(stages)).toBe(2);
  });

  it("handles real-world proposal stage sequence", () => {
    const stages: ProposalStage[] = [
      createStage("COMPLETED", "PROPOSAL_CREATED"),
      createStage("COMPLETED", "VOTING_ACTIVE"),
      createStage("COMPLETED", "PROPOSAL_QUEUED"),
      createStage("PENDING", "L2_TIMELOCK_EXECUTED"),
      createStage("NOT_STARTED", "L2_TO_L1_MESSAGE_SENT"),
      createStage("NOT_STARTED", "L1_TIMELOCK_QUEUED"),
    ];
    expect(getCurrentStageIndex(stages)).toBe(3);
  });
});
