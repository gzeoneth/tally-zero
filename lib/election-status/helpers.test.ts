import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ElectionProposalStatus } from "@gzeoneth/gov-tracker";

import {
  correctVettingPeriod,
  isCorsOrNetworkError,
  mergeResults,
  preventPhaseRegression,
} from "./helpers";
import type { CachedElectionData, LiveElectionResult } from "./types";

// Mock localStorage for preventPhaseRegression
let mockStorage: Map<string, string>;
const originalLocalStorage =
  typeof global.localStorage !== "undefined" ? global.localStorage : undefined;

beforeEach(() => {
  mockStorage = new Map();
  Object.defineProperty(global, "localStorage", {
    value: {
      getItem: vi.fn((key: string) => mockStorage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) =>
        mockStorage.set(key, value)
      ),
      removeItem: vi.fn((key: string) => mockStorage.delete(key)),
      clear: vi.fn(() => mockStorage.clear()),
      length: 0,
      key: vi.fn(() => null),
    },
    writable: true,
  });
});

afterEach(() => {
  if (originalLocalStorage !== undefined) {
    Object.defineProperty(global, "localStorage", {
      value: originalLocalStorage,
      writable: true,
    });
  }
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function createElection(
  overrides: Partial<ElectionProposalStatus> & { electionIndex: number }
): ElectionProposalStatus {
  return {
    phase: "CONTENDER_SUBMISSION",
    cohort: 0,
    nomineeProposalId: "0x1",
    nomineeProposalState: null,
    memberProposalId: null,
    memberProposalState: null,
    isInVettingPeriod: false,
    vettingDeadline: null,
    canProceedToMemberPhase: false,
    canExecuteMember: false,
    targetNomineeCount: 6,
    stages: [],
    ...overrides,
  } as ElectionProposalStatus;
}

// ---------------------------------------------------------------------------
// correctVettingPeriod
// ---------------------------------------------------------------------------

describe("correctVettingPeriod", () => {
  it("corrects to VETTING_PERIOD when nominee Succeeded and member Pending", () => {
    const election = createElection({
      electionIndex: 0,
      nomineeProposalState: "Succeeded",
      memberProposalState: "Pending",
      isInVettingPeriod: false,
    });
    const corrected = correctVettingPeriod(election);
    expect(corrected).toBe(true);
    expect(election.phase).toBe("VETTING_PERIOD");
    expect(election.isInVettingPeriod).toBe(true);
  });

  it("corrects when member state is null", () => {
    const election = createElection({
      electionIndex: 0,
      nomineeProposalState: "Succeeded",
      memberProposalState: null,
      isInVettingPeriod: false,
    });
    expect(correctVettingPeriod(election)).toBe(true);
    expect(election.phase).toBe("VETTING_PERIOD");
  });

  it("does not correct when already in vetting period", () => {
    const election = createElection({
      electionIndex: 0,
      nomineeProposalState: "Succeeded",
      isInVettingPeriod: true,
    });
    expect(correctVettingPeriod(election)).toBe(false);
  });

  it("does not correct when nominee state is Active", () => {
    const election = createElection({
      electionIndex: 0,
      nomineeProposalState: "Active",
      memberProposalState: null,
      isInVettingPeriod: false,
    });
    expect(correctVettingPeriod(election)).toBe(false);
  });

  it("does not correct when member state is Active", () => {
    const election = createElection({
      electionIndex: 0,
      nomineeProposalState: "Succeeded",
      memberProposalState: "Active",
      isInVettingPeriod: false,
    });
    expect(correctVettingPeriod(election)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// preventPhaseRegression
// ---------------------------------------------------------------------------

describe("preventPhaseRegression", () => {
  it("allows forward phase progression", () => {
    const elections = [
      createElection({
        electionIndex: 0,
        phase: "NOMINEE_SELECTION",
      }),
    ];
    const result = preventPhaseRegression(elections);
    expect(result[0].phase).toBe("NOMINEE_SELECTION");
  });

  it("clamps backward regression to last known phase", () => {
    // First call: observe MEMBER_ELECTION
    preventPhaseRegression([
      createElection({ electionIndex: 0, phase: "MEMBER_ELECTION" }),
    ]);

    // Second call: try to regress to CONTENDER_SUBMISSION
    const elections = [
      createElection({ electionIndex: 0, phase: "CONTENDER_SUBMISSION" }),
    ];
    const result = preventPhaseRegression(elections);
    expect(result[0].phase).toBe("MEMBER_ELECTION");
  });

  it("handles multiple elections independently", () => {
    preventPhaseRegression([
      createElection({ electionIndex: 0, phase: "COMPLETED" }),
      createElection({ electionIndex: 1, phase: "NOMINEE_SELECTION" }),
    ]);

    const elections = [
      createElection({ electionIndex: 0, phase: "MEMBER_ELECTION" }),
      createElection({ electionIndex: 1, phase: "CONTENDER_SUBMISSION" }),
    ];
    const result = preventPhaseRegression(elections);
    expect(result[0].phase).toBe("COMPLETED");
    expect(result[1].phase).toBe("NOMINEE_SELECTION");
  });

  it("sets isInVettingPeriod when clamping to VETTING_PERIOD", () => {
    preventPhaseRegression([
      createElection({
        electionIndex: 0,
        phase: "VETTING_PERIOD",
        isInVettingPeriod: true,
      }),
    ]);

    const elections = [
      createElection({
        electionIndex: 0,
        phase: "NOMINEE_SELECTION",
        isInVettingPeriod: false,
      }),
    ];
    const result = preventPhaseRegression(elections);
    expect(result[0].phase).toBe("VETTING_PERIOD");
    expect(result[0].isInVettingPeriod).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mergeResults
// ---------------------------------------------------------------------------

describe("mergeResults", () => {
  it("merges live results into cached data", () => {
    const cached: CachedElectionData = {
      elections: [createElection({ electionIndex: 0, phase: "COMPLETED" })],
      nomineeDetails: {},
      memberDetails: {},
    };
    const liveResults: LiveElectionResult[] = [
      {
        index: 1,
        status: createElection({
          electionIndex: 1,
          phase: "CONTENDER_SUBMISSION",
        }),
        nominee: null,
        member: null,
      },
    ];
    const merged = mergeResults(cached, liveResults);
    expect(merged.elections).toHaveLength(2);
    expect(merged.elections[0].electionIndex).toBe(0);
    expect(merged.elections[1].electionIndex).toBe(1);
  });

  it("replaces cached election with live data for same index", () => {
    const cached: CachedElectionData = {
      elections: [
        createElection({
          electionIndex: 0,
          phase: "CONTENDER_SUBMISSION",
        }),
      ],
      nomineeDetails: {},
      memberDetails: {},
    };
    const liveResults: LiveElectionResult[] = [
      {
        index: 0,
        status: createElection({
          electionIndex: 0,
          phase: "NOMINEE_SELECTION",
        }),
        nominee: null,
        member: null,
      },
    ];
    const merged = mergeResults(cached, liveResults);
    expect(merged.elections).toHaveLength(1);
    expect(merged.elections[0].phase).toBe("NOMINEE_SELECTION");
  });

  it("merges nominee and member details", () => {
    const cached: CachedElectionData = {
      elections: [],
      nomineeDetails: { 0: { proposalId: "cached" } as never },
      memberDetails: {},
    };
    const liveResults: LiveElectionResult[] = [
      {
        index: 1,
        status: createElection({ electionIndex: 1 }),
        nominee: { proposalId: "live-nominee" } as never,
        member: { proposalId: "live-member" } as never,
      },
    ];
    const merged = mergeResults(cached, liveResults);
    expect(merged.nomineeDetails[0]).toBeDefined();
    expect(merged.nomineeDetails[1]).toBeDefined();
    expect(merged.memberDetails[1]).toBeDefined();
  });

  it("skips null live results", () => {
    const cached: CachedElectionData = {
      elections: [createElection({ electionIndex: 0 })],
      nomineeDetails: {},
      memberDetails: {},
    };
    const merged = mergeResults(cached, [null]);
    expect(merged.elections).toHaveLength(1);
  });

  it("sorts elections by index", () => {
    const cached: CachedElectionData = {
      elections: [createElection({ electionIndex: 2 })],
      nomineeDetails: {},
      memberDetails: {},
    };
    const liveResults: LiveElectionResult[] = [
      {
        index: 0,
        status: createElection({ electionIndex: 0 }),
        nominee: null,
        member: null,
      },
    ];
    const merged = mergeResults(cached, liveResults);
    expect(merged.elections[0].electionIndex).toBe(0);
    expect(merged.elections[1].electionIndex).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// isCorsOrNetworkError
// ---------------------------------------------------------------------------

describe("isCorsOrNetworkError", () => {
  it("detects failed to fetch", () => {
    expect(isCorsOrNetworkError(new Error("Failed to fetch"))).toBe(true);
  });

  it("detects CORS errors", () => {
    expect(
      isCorsOrNetworkError(
        new Error("blocked by CORS policy: access-control-allow-origin")
      )
    ).toBe(true);
  });

  it("detects network errors", () => {
    expect(isCorsOrNetworkError(new Error("Network error occurred"))).toBe(
      true
    );
  });

  it("returns false for non-network errors", () => {
    expect(isCorsOrNetworkError(new Error("Execution reverted"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isCorsOrNetworkError("string error")).toBe(false);
    expect(isCorsOrNetworkError(null)).toBe(false);
    expect(isCorsOrNetworkError(undefined)).toBe(false);
  });
});
