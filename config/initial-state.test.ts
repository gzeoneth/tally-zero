import { describe, expect, it } from "vitest";

import { initialState, ProposalState } from "./initial-state";

describe("initial-state config", () => {
  describe("initialState", () => {
    it("has empty governor state", () => {
      expect(initialState.governor.address).toBeUndefined();
      expect(initialState.governor.contract).toBeNull();
      expect(initialState.governor.name).toBeUndefined();
    });

    it("has empty token state", () => {
      expect(initialState.token.address).toBeUndefined();
      expect(initialState.token.contract).toBeNull();
    });

    it("has empty proposals array", () => {
      expect(initialState.proposals).toEqual([]);
      expect(Array.isArray(initialState.proposals)).toBe(true);
    });
  });

  describe("ProposalState enum", () => {
    it("has Pending as 0", () => {
      expect(ProposalState.Pending).toBe(0);
    });

    it("has Active as 1", () => {
      expect(ProposalState.Active).toBe(1);
    });

    it("has Canceled as 2", () => {
      expect(ProposalState.Canceled).toBe(2);
    });

    it("has Defeated as 3", () => {
      expect(ProposalState.Defeated).toBe(3);
    });

    it("has Succeeded as 4", () => {
      expect(ProposalState.Succeeded).toBe(4);
    });

    it("has Queued as 5", () => {
      expect(ProposalState.Queued).toBe(5);
    });

    it("has Expired as 6", () => {
      expect(ProposalState.Expired).toBe(6);
    });

    it("has Executed as 7", () => {
      expect(ProposalState.Executed).toBe(7);
    });

    it("can be used as array index", () => {
      const stateNames = [
        "Pending",
        "Active",
        "Canceled",
        "Defeated",
        "Succeeded",
        "Queued",
        "Expired",
        "Executed",
      ];
      expect(stateNames[ProposalState.Pending]).toBe("Pending");
      expect(stateNames[ProposalState.Executed]).toBe("Executed");
    });

    it("has 8 states total", () => {
      // Count numeric values (excluding reverse mappings)
      const numericKeys = Object.keys(ProposalState).filter(
        (key) => !isNaN(Number(key))
      );
      expect(numericKeys.length).toBe(8);
    });
  });
});
