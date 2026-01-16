import type { ParsedProposal } from "@/types/proposal";
import { describe, expect, it } from "vitest";
import {
  isProposalFinalized,
  mergeProposals,
  needsStateRefresh,
  sortProposals,
} from "./proposal-cache";

const createProposal = (
  overrides: Partial<ParsedProposal>
): ParsedProposal => ({
  id: "1",
  contractAddress: "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9",
  proposer: "0xb4c064f466931B8d0F637654c916E3F203c46f13",
  targets: ["0x0000000000000000000000000000000000000064"],
  values: ["0"],
  signatures: [""],
  calldatas: ["0x"],
  startBlock: "23943007",
  endBlock: "24043807",
  description: "Test proposal",
  networkId: "42161",
  state: "Executed",
  governorName: "Core Governor",
  ...overrides,
});

const activeProposal = createProposal({
  id: "1",
  state: "Active",
  startBlock: "23943007",
});

const executedProposal = createProposal({
  id: "2",
  state: "Executed",
  startBlock: "23593417",
});

const defeatedProposal = createProposal({
  id: "4",
  state: "Defeated",
  startBlock: "22000000",
});

describe("proposal-cache", () => {
  describe("isProposalFinalized", () => {
    it("returns true for executed", () => {
      expect(isProposalFinalized("executed")).toBe(true);
    });

    it("returns true for defeated", () => {
      expect(isProposalFinalized("defeated")).toBe(true);
    });

    it("returns true for canceled", () => {
      expect(isProposalFinalized("canceled")).toBe(true);
    });

    it("returns true for expired", () => {
      expect(isProposalFinalized("expired")).toBe(true);
    });

    it("returns true for succeeded", () => {
      expect(isProposalFinalized("succeeded")).toBe(true);
    });

    it("returns true for queued", () => {
      expect(isProposalFinalized("queued")).toBe(true);
    });

    it("returns false for pending", () => {
      expect(isProposalFinalized("pending")).toBe(false);
    });

    it("returns false for active", () => {
      expect(isProposalFinalized("active")).toBe(false);
    });

    it("handles case-insensitivity", () => {
      expect(isProposalFinalized("EXECUTED")).toBe(true);
      expect(isProposalFinalized("Executed")).toBe(true);
      expect(isProposalFinalized("PENDING")).toBe(false);
    });
  });

  describe("needsStateRefresh", () => {
    it("returns true for pending", () => {
      expect(needsStateRefresh("pending")).toBe(true);
    });

    it("returns true for active", () => {
      expect(needsStateRefresh("active")).toBe(true);
    });

    it("returns false for executed", () => {
      expect(needsStateRefresh("executed")).toBe(false);
    });

    it("returns false for defeated", () => {
      expect(needsStateRefresh("defeated")).toBe(false);
    });

    it("handles case-insensitivity", () => {
      expect(needsStateRefresh("PENDING")).toBe(true);
      expect(needsStateRefresh("Active")).toBe(true);
      expect(needsStateRefresh("EXECUTED")).toBe(false);
    });
  });

  describe("mergeProposals", () => {
    it("keeps finalized cached proposals unchanged", () => {
      const cached = [executedProposal];
      const fresh = [
        createProposal({
          ...executedProposal,
          description: "Updated description",
        }),
      ];

      const merged = mergeProposals(cached, fresh);
      expect(merged).toHaveLength(1);
      expect(merged[0].description).toBe(executedProposal.description);
    });

    it("updates non-finalized cached proposals with fresh data", () => {
      const cached = [activeProposal];
      const freshActive = createProposal({
        ...activeProposal,
        votes: {
          forVotes: "1000000",
          againstVotes: "500000",
          abstainVotes: "100000",
          quorum: "2000000",
        },
      });

      const merged = mergeProposals(cached, [freshActive]);
      expect(merged).toHaveLength(1);
      expect(merged[0].votes).toBeDefined();
      expect(merged[0].votes?.forVotes).toBe("1000000");
    });

    it("adds new proposals from fresh that are not in cache", () => {
      const cached = [executedProposal];
      const newProposal = createProposal({
        id: "new-proposal",
        state: "Active",
      });

      const merged = mergeProposals(cached, [newProposal]);
      expect(merged).toHaveLength(2);
      expect(merged.map((p) => p.id)).toContain("new-proposal");
    });

    it("handles empty arrays", () => {
      expect(mergeProposals([], [])).toEqual([]);
      expect(mergeProposals([executedProposal], [])).toEqual([
        executedProposal,
      ]);
      expect(mergeProposals([], [activeProposal])).toEqual([activeProposal]);
    });

    it("correctly merges complex scenario", () => {
      const cached = [executedProposal, activeProposal];

      const updatedActive = createProposal({
        ...activeProposal,
        state: "Succeeded",
      });
      const brandNewProposal = createProposal({
        id: "brand-new",
        state: "Pending",
      });

      const merged = mergeProposals(cached, [updatedActive, brandNewProposal]);

      expect(merged).toHaveLength(3);
      expect(merged.find((p) => p.id === executedProposal.id)?.state).toBe(
        "Executed"
      );
      expect(merged.find((p) => p.id === activeProposal.id)?.state).toBe(
        "Succeeded"
      );
      expect(merged.map((p) => p.id)).toContain("brand-new");
    });
  });

  describe("sortProposals", () => {
    it("puts active proposals first", () => {
      const proposals = [executedProposal, activeProposal, defeatedProposal];
      const sorted = sortProposals(proposals);

      expect(sorted[0].state).toBe("Active");
    });

    it("sorts by startBlock descending within same state", () => {
      const active1 = createProposal({
        id: "a1",
        state: "Active",
        startBlock: "1000",
      });
      const active2 = createProposal({
        id: "a2",
        state: "Active",
        startBlock: "2000",
      });
      const active3 = createProposal({
        id: "a3",
        state: "Active",
        startBlock: "1500",
      });

      const sorted = sortProposals([active1, active2, active3]);

      expect(sorted.map((p) => p.startBlock)).toEqual(["2000", "1500", "1000"]);
    });

    it("handles mixed states", () => {
      const proposals = [
        createProposal({ id: "1", state: "Executed", startBlock: "3000" }),
        createProposal({ id: "2", state: "Active", startBlock: "1000" }),
        createProposal({ id: "3", state: "Pending", startBlock: "4000" }),
        createProposal({ id: "4", state: "Active", startBlock: "2000" }),
      ];

      const sorted = sortProposals(proposals);

      expect(sorted[0].state).toBe("Active");
      expect(sorted[1].state).toBe("Active");
      expect(sorted[0].startBlock).toBe("2000");
      expect(sorted[1].startBlock).toBe("1000");
    });

    it("does not mutate original array", () => {
      const proposals = [executedProposal, activeProposal];
      const originalOrder = [...proposals];

      sortProposals(proposals);

      expect(proposals).toEqual(originalOrder);
    });
  });
});
