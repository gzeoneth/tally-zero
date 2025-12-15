import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_BLOCK_RANGE } from "./rpc-utils";

describe("rpc-utils", () => {
  it("DEFAULT_MAX_BLOCK_RANGE is 10M", () => {
    expect(DEFAULT_MAX_BLOCK_RANGE).toBe(10_000_000);
  });
});
