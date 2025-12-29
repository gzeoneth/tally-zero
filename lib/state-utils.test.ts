import { describe, expect, it } from "vitest";

import { findStateByValue } from "./state-utils";

describe("state-utils", () => {
  describe("findStateByValue", () => {
    it("returns state for exact case match", () => {
      const result = findStateByValue("Active");
      expect(result).toBeDefined();
      expect(result?.value).toBe("Active");
      expect(result?.label).toBe("Active");
    });

    it("returns state for lowercase match", () => {
      const result = findStateByValue("active");
      expect(result).toBeDefined();
      expect(result?.value).toBe("Active");
    });

    it("returns state for uppercase match", () => {
      const result = findStateByValue("ACTIVE");
      expect(result).toBeDefined();
      expect(result?.value).toBe("Active");
    });

    it("returns state for mixed case match", () => {
      const result = findStateByValue("aCtIvE");
      expect(result).toBeDefined();
      expect(result?.value).toBe("Active");
    });

    it("returns undefined for unknown state", () => {
      const result = findStateByValue("Unknown");
      expect(result).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      const result = findStateByValue("");
      expect(result).toBeUndefined();
    });

    it("returns undefined for null", () => {
      const result = findStateByValue(null);
      expect(result).toBeUndefined();
    });

    it("returns undefined for undefined", () => {
      const result = findStateByValue(undefined);
      expect(result).toBeUndefined();
    });

    it("finds all valid states", () => {
      const validStates = [
        "Active",
        "Pending",
        "Queued",
        "Succeeded",
        "Executed",
        "Defeated",
        "Canceled",
        "Expired",
      ];

      for (const state of validStates) {
        const result = findStateByValue(state);
        expect(result).toBeDefined();
        expect(result?.value).toBe(state);
      }
    });

    it("returns state with all required properties", () => {
      const result = findStateByValue("Active");
      expect(result).toHaveProperty("value");
      expect(result).toHaveProperty("label");
      expect(result).toHaveProperty("bgColor");
      expect(result).toHaveProperty("icon");
    });
  });
});
