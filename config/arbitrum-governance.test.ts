import { describe, expect, it } from "vitest";
import {
  ProposalState,
  isFailedState,
  isPendingOrActiveState,
  isSuccessState,
} from "./arbitrum-governance";

describe("ProposalState constants", () => {
  it("should have correct values for each state", () => {
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
  it("should return true for PENDING state", () => {
    expect(isPendingOrActiveState(ProposalState.PENDING)).toBe(true);
  });

  it("should return true for ACTIVE state", () => {
    expect(isPendingOrActiveState(ProposalState.ACTIVE)).toBe(true);
  });

  it("should return false for other states", () => {
    expect(isPendingOrActiveState(ProposalState.CANCELED)).toBe(false);
    expect(isPendingOrActiveState(ProposalState.DEFEATED)).toBe(false);
    expect(isPendingOrActiveState(ProposalState.SUCCEEDED)).toBe(false);
    expect(isPendingOrActiveState(ProposalState.QUEUED)).toBe(false);
    expect(isPendingOrActiveState(ProposalState.EXPIRED)).toBe(false);
    expect(isPendingOrActiveState(ProposalState.EXECUTED)).toBe(false);
  });
});

describe("isFailedState", () => {
  it("should return true for CANCELED state", () => {
    expect(isFailedState(ProposalState.CANCELED)).toBe(true);
  });

  it("should return true for DEFEATED state", () => {
    expect(isFailedState(ProposalState.DEFEATED)).toBe(true);
  });

  it("should return true for EXPIRED state", () => {
    expect(isFailedState(ProposalState.EXPIRED)).toBe(true);
  });

  it("should return false for other states", () => {
    expect(isFailedState(ProposalState.PENDING)).toBe(false);
    expect(isFailedState(ProposalState.ACTIVE)).toBe(false);
    expect(isFailedState(ProposalState.SUCCEEDED)).toBe(false);
    expect(isFailedState(ProposalState.QUEUED)).toBe(false);
    expect(isFailedState(ProposalState.EXECUTED)).toBe(false);
  });
});

describe("isSuccessState", () => {
  it("should return true for SUCCEEDED state", () => {
    expect(isSuccessState(ProposalState.SUCCEEDED)).toBe(true);
  });

  it("should return true for QUEUED state", () => {
    expect(isSuccessState(ProposalState.QUEUED)).toBe(true);
  });

  it("should return true for EXECUTED state", () => {
    expect(isSuccessState(ProposalState.EXECUTED)).toBe(true);
  });

  it("should return false for pre-success states", () => {
    expect(isSuccessState(ProposalState.PENDING)).toBe(false);
    expect(isSuccessState(ProposalState.ACTIVE)).toBe(false);
  });

  it("should return false for failed states", () => {
    expect(isSuccessState(ProposalState.CANCELED)).toBe(false);
    expect(isSuccessState(ProposalState.DEFEATED)).toBe(false);
    expect(isSuccessState(ProposalState.EXPIRED)).toBe(false);
  });
});
