/**
 * Tests for governor-search cache-utils
 */

import { describe, expect, it } from "vitest";

import { calculateSearchRanges } from "./cache-utils";

describe("calculateSearchRanges", () => {
  it("returns full RPC range for any input", () => {
    const result = calculateSearchRanges(1000, 2000);

    expect(result.rpcRanges).toEqual([{ start: 1000, end: 2000 }]);
    expect(result.rangeInfo).toContain("Searching blocks");
  });

  it("handles different block ranges", () => {
    const result = calculateSearchRanges(500, 10000);

    expect(result.rpcRanges).toEqual([{ start: 500, end: 10000 }]);
    expect(result.rangeInfo).toContain("500");
    expect(result.rangeInfo).toContain("10,000");
  });
});
