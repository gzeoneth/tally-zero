import { describe, expect, it } from "vitest";

import { initialState } from "./initial-state";

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
});
