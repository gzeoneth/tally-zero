/**
 * Tests for stage-tracker log-search utilities
 */

import { ethers } from "ethers";
import { describe, expect, it } from "vitest";

import {
  getL1BlockNumberFromReceipt,
  type ArbitrumTransactionReceipt,
} from "./log-search";

// Helper to create a minimal receipt for testing
function createMockReceipt(
  l1BlockNumber?: number | string | ethers.BigNumber
): ArbitrumTransactionReceipt {
  // Use partial mock - we only need l1BlockNumber for these tests
  return {
    l1BlockNumber,
  } as ArbitrumTransactionReceipt;
}

describe("getL1BlockNumberFromReceipt", () => {
  describe("number input", () => {
    it("returns the number directly", () => {
      const receipt = createMockReceipt(12345678);
      expect(getL1BlockNumberFromReceipt(receipt)).toBe(12345678);
    });

    it("handles zero", () => {
      const receipt = createMockReceipt(0);
      expect(getL1BlockNumberFromReceipt(receipt)).toBe(0);
    });
  });

  describe("string input", () => {
    it("parses decimal string", () => {
      const receipt = createMockReceipt("12345678");
      expect(getL1BlockNumberFromReceipt(receipt)).toBe(12345678);
    });

    it("parses hex string with 0x prefix", () => {
      const receipt = createMockReceipt("0xbc614e"); // 12345678 in hex
      expect(getL1BlockNumberFromReceipt(receipt)).toBe(12345678);
    });

    it("parses hex string with uppercase", () => {
      const receipt = createMockReceipt("0xBC614E");
      expect(getL1BlockNumberFromReceipt(receipt)).toBe(12345678);
    });
  });

  describe("BigNumber input", () => {
    it("converts BigNumber to number", () => {
      const receipt = createMockReceipt(ethers.BigNumber.from(12345678));
      expect(getL1BlockNumberFromReceipt(receipt)).toBe(12345678);
    });

    it("handles BigNumber from hex string", () => {
      const receipt = createMockReceipt(ethers.BigNumber.from("0xbc614e"));
      expect(getL1BlockNumberFromReceipt(receipt)).toBe(12345678);
    });
  });

  describe("error cases", () => {
    it("throws for undefined l1BlockNumber", () => {
      const receipt = createMockReceipt(undefined);
      expect(() => getL1BlockNumberFromReceipt(receipt)).toThrow(
        "Receipt missing l1BlockNumber"
      );
    });

    it("throws for null-like l1BlockNumber", () => {
      const receipt = createMockReceipt(null as unknown as undefined);
      expect(() => getL1BlockNumberFromReceipt(receipt)).toThrow(
        "Receipt missing l1BlockNumber"
      );
    });
  });
});
