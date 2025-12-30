/**
 * Tests for stage metadata utilities
 */

import { describe, expect, it } from "vitest";

import {
  getAllStageMetadata,
  getStageMetadata,
  STAGE_METADATA,
} from "./stage-metadata";

describe("getStageMetadata", () => {
  it("returns metadata for PROPOSAL_CREATED", () => {
    const metadata = getStageMetadata("PROPOSAL_CREATED");
    expect(metadata).toEqual({
      type: "PROPOSAL_CREATED",
      title: "Proposal Created",
      description: "Proposal submitted to the Governor contract",
      chain: "L2",
    });
  });

  it("returns metadata for VOTING_ACTIVE with duration", () => {
    const metadata = getStageMetadata("VOTING_ACTIVE");
    expect(metadata?.type).toBe("VOTING_ACTIVE");
    expect(metadata?.title).toBe("Voting");
    expect(metadata?.estimatedDuration).toBe("14-16 days");
  });

  it("returns L2 timelock duration for core governor", () => {
    const metadata = getStageMetadata("L2_TIMELOCK_EXECUTED", "core");
    expect(metadata?.estimatedDuration).toBe("8 days");
  });

  it("returns L2 timelock duration for treasury governor", () => {
    const metadata = getStageMetadata("L2_TIMELOCK_EXECUTED", "treasury");
    expect(metadata?.estimatedDuration).toBe("3 days");
  });

  it("returns challenge period duration", () => {
    const metadata = getStageMetadata("L2_TO_L1_MESSAGE_CONFIRMED");
    expect(metadata?.estimatedDuration).toBe("~7 days");
  });

  it("returns L1 timelock duration", () => {
    const metadata = getStageMetadata("L1_TIMELOCK_EXECUTED");
    expect(metadata?.estimatedDuration).toBe("3 days");
  });

  it("returns undefined for unknown stage type", () => {
    const metadata = getStageMetadata("UNKNOWN" as never);
    expect(metadata).toBeUndefined();
  });

  it("returns correct chain for each stage", () => {
    expect(getStageMetadata("PROPOSAL_CREATED")?.chain).toBe("L2");
    expect(getStageMetadata("VOTING_ACTIVE")?.chain).toBe("L2");
    expect(getStageMetadata("L1_TIMELOCK_QUEUED")?.chain).toBe("L1");
    expect(getStageMetadata("L2_TO_L1_MESSAGE_SENT")?.chain).toBe(
      "Cross-chain"
    );
  });
});

describe("getAllStageMetadata", () => {
  it("returns all 10 stages for core governor", () => {
    const stages = getAllStageMetadata("core");
    expect(stages).toHaveLength(10);
  });

  it("returns all 10 stages for treasury governor", () => {
    const stages = getAllStageMetadata("treasury");
    expect(stages).toHaveLength(10);
  });

  it("defaults to core governor", () => {
    const stages = getAllStageMetadata();
    const coreStages = getAllStageMetadata("core");
    expect(stages).toEqual(coreStages);
  });

  it("has different L2 timelock duration for core vs treasury", () => {
    const coreStages = getAllStageMetadata("core");
    const treasuryStages = getAllStageMetadata("treasury");

    const coreL2Timelock = coreStages.find(
      (s) => s.type === "L2_TIMELOCK_EXECUTED"
    );
    const treasuryL2Timelock = treasuryStages.find(
      (s) => s.type === "L2_TIMELOCK_EXECUTED"
    );

    expect(coreL2Timelock?.estimatedDuration).toBe("8 days");
    expect(treasuryL2Timelock?.estimatedDuration).toBe("3 days");
  });

  it("stages are in correct order", () => {
    const stages = getAllStageMetadata();
    const types = stages.map((s) => s.type);
    expect(types).toEqual([
      "PROPOSAL_CREATED",
      "VOTING_ACTIVE",
      "PROPOSAL_QUEUED",
      "L2_TIMELOCK_EXECUTED",
      "L2_TO_L1_MESSAGE_SENT",
      "L2_TO_L1_MESSAGE_CONFIRMED",
      "L1_TIMELOCK_QUEUED",
      "L1_TIMELOCK_EXECUTED",
      "RETRYABLE_CREATED",
      "RETRYABLE_REDEEMED",
    ]);
  });
});

describe("STAGE_METADATA (deprecated)", () => {
  it("is equivalent to getAllStageMetadata('core')", () => {
    expect(STAGE_METADATA).toEqual(getAllStageMetadata("core"));
  });
});
