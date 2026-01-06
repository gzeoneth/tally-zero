import { describe, expect, it } from "vitest";
import {
  ProposalState,
  isFailedState,
  isPendingOrActiveState,
  isSuccessState,
} from "./arbitrum-governance";

describe("ProposalState", () => {
  it("has correct enum values", () => {
    expect(ProposalState.PENDING).toBe(0);
    expect(ProposalState.ACTIVE).toBe(1);
    expect(ProposalState.CANCELED).toBe(2);
    expect(ProposalState.DEFEATED).toBe(3);
    expect(ProposalState.SUCCEEDED).toBe(4);
    expect(ProposalState.QUEUED).toBe(5);
    expect(ProposalState.EXPIRED).toBe(6);
    expect(ProposalState.EXECUTED).toBe(7);
  });
});

describe("isPendingOrActiveState", () => {
  it("returns true for pending/active states", () => {
    expect(isPendingOrActiveState(ProposalState.PENDING)).toBe(true);
    expect(isPendingOrActiveState(ProposalState.ACTIVE)).toBe(true);
  });

  it("returns false for terminal states", () => {
    expect(isPendingOrActiveState(ProposalState.CANCELED)).toBe(false);
    expect(isPendingOrActiveState(ProposalState.DEFEATED)).toBe(false);
    expect(isPendingOrActiveState(ProposalState.SUCCEEDED)).toBe(false);
    expect(isPendingOrActiveState(ProposalState.QUEUED)).toBe(false);
    expect(isPendingOrActiveState(ProposalState.EXPIRED)).toBe(false);
    expect(isPendingOrActiveState(ProposalState.EXECUTED)).toBe(false);
  });
});

describe("isFailedState", () => {
  it("returns true for failed states", () => {
    expect(isFailedState(ProposalState.CANCELED)).toBe(true);
    expect(isFailedState(ProposalState.DEFEATED)).toBe(true);
    expect(isFailedState(ProposalState.EXPIRED)).toBe(true);
  });

  it("returns false for non-failed states", () => {
    expect(isFailedState(ProposalState.PENDING)).toBe(false);
    expect(isFailedState(ProposalState.ACTIVE)).toBe(false);
    expect(isFailedState(ProposalState.SUCCEEDED)).toBe(false);
    expect(isFailedState(ProposalState.QUEUED)).toBe(false);
    expect(isFailedState(ProposalState.EXECUTED)).toBe(false);
  });
});

describe("isSuccessState", () => {
  it("returns true for success states", () => {
    expect(isSuccessState(ProposalState.SUCCEEDED)).toBe(true);
    expect(isSuccessState(ProposalState.QUEUED)).toBe(true);
    expect(isSuccessState(ProposalState.EXECUTED)).toBe(true);
  });

  it("returns false for non-success states", () => {
    expect(isSuccessState(ProposalState.PENDING)).toBe(false);
    expect(isSuccessState(ProposalState.ACTIVE)).toBe(false);
    expect(isSuccessState(ProposalState.CANCELED)).toBe(false);
    expect(isSuccessState(ProposalState.DEFEATED)).toBe(false);
    expect(isSuccessState(ProposalState.EXPIRED)).toBe(false);
  });
});
