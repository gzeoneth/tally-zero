import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ElectionStatus } from "@gzeoneth/gov-tracker";

// Mock gov-tracker before importing fetchers
vi.mock("@gzeoneth/gov-tracker", async () => {
  const actual = await vi.importActual<typeof import("@gzeoneth/gov-tracker")>(
    "@gzeoneth/gov-tracker"
  );
  return {
    ...actual,
    checkElectionStatus: vi.fn(),
    getElectionCount: vi.fn(),
  };
});

vi.mock("@/lib/debug", () => ({
  debug: { app: vi.fn(), cache: vi.fn() },
}));

import { checkElectionStatus, getElectionCount } from "@gzeoneth/gov-tracker";

import { fetchOverallStatus } from "./fetchers";

const mockCheckElectionStatus = vi.mocked(checkElectionStatus);
const mockGetElectionCount = vi.mocked(getElectionCount);

// Minimal provider mock
const mockProvider = {} as never;

// ---------------------------------------------------------------------------
// fetchOverallStatus
// ---------------------------------------------------------------------------

describe("fetchOverallStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ElectionStatus on success", async () => {
    const expected: ElectionStatus = {
      electionCount: 5,
      cohort: 1,
      nextElectionTimestamp: 1700000000,
      currentL1Timestamp: 1699999000,
      canCreateElection: false,
      secondsUntilElection: 1000,
      timeUntilElection: "16 minutes",
    };
    mockCheckElectionStatus.mockResolvedValue(expected);

    const result = await fetchOverallStatus(mockProvider, mockProvider);

    expect(result).toEqual(expected);
    expect(mockCheckElectionStatus).toHaveBeenCalledWith(
      mockProvider,
      mockProvider
    );
  });

  it("synthesizes partial status when checkElectionStatus fails", async () => {
    mockCheckElectionStatus.mockRejectedValue(new Error("L1 block lookup"));
    mockGetElectionCount.mockResolvedValue(3);

    const result = await fetchOverallStatus(mockProvider, mockProvider);

    expect(result).not.toBeNull();
    expect(result!.electionCount).toBe(3);
    expect(result!.cohort).toBe(1); // 3 % 2 = 1
    expect(result!.canCreateElection).toBe(false);
    expect(result!.timeUntilElection).toBe("Unknown");
  });

  it("returns null when both checkElectionStatus and getElectionCount fail", async () => {
    mockCheckElectionStatus.mockRejectedValue(new Error("L1 fail"));
    mockGetElectionCount.mockRejectedValue(new Error("RPC fail"));

    const result = await fetchOverallStatus(mockProvider, mockProvider);

    expect(result).toBeNull();
  });

  it("computes correct cohort for even election count", async () => {
    mockCheckElectionStatus.mockRejectedValue(new Error("fail"));
    mockGetElectionCount.mockResolvedValue(4);

    const result = await fetchOverallStatus(mockProvider, mockProvider);

    expect(result!.cohort).toBe(0); // 4 % 2 = 0
  });
});
