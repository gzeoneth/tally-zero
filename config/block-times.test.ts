import { describe, expect, it } from "vitest";

import {
  BLOCK_TIMES,
  BLOCKS_PER_DAY,
  blocksToTime,
  getBlocksPerDay,
  getBlockTime,
  L1_SECONDS_PER_BLOCK,
  timeToBlocks,
} from "./block-times";

describe("block-times config", () => {
  describe("BLOCK_TIMES", () => {
    it("has correct block time for Ethereum", () => {
      expect(BLOCK_TIMES[1]).toBe(12);
    });

    it("has correct block time for Arbitrum", () => {
      expect(BLOCK_TIMES[42161]).toBe(0.25);
    });

    it("has correct block time for Optimism", () => {
      expect(BLOCK_TIMES[10]).toBe(2);
    });

    it("has correct block time for Polygon", () => {
      expect(BLOCK_TIMES[137]).toBe(2);
    });

    it("has correct block time for Avalanche", () => {
      expect(BLOCK_TIMES[43114]).toBe(2);
    });
  });

  describe("L1_SECONDS_PER_BLOCK", () => {
    it("equals Ethereum block time", () => {
      expect(L1_SECONDS_PER_BLOCK).toBe(12);
    });
  });

  describe("BLOCKS_PER_DAY", () => {
    it("calculates correct blocks per day for Ethereum", () => {
      // 86400 seconds per day / 12 seconds per block = 7200 blocks
      expect(BLOCKS_PER_DAY.ethereum).toBe(7200);
    });

    it("calculates correct blocks per day for Arbitrum", () => {
      // 86400 seconds per day / 0.25 seconds per block = 345600 blocks
      expect(BLOCKS_PER_DAY.arbitrum).toBe(345600);
    });
  });

  describe("getBlockTime", () => {
    it("returns correct time for known chains", () => {
      expect(getBlockTime(1)).toBe(12);
      expect(getBlockTime(42161)).toBe(0.25);
      expect(getBlockTime(10)).toBe(2);
    });

    it("returns default (12s) for unknown chains", () => {
      expect(getBlockTime(99999)).toBe(12);
      expect(getBlockTime(0)).toBe(12);
    });
  });

  describe("getBlocksPerDay", () => {
    it("returns correct blocks per day for Ethereum", () => {
      expect(getBlocksPerDay(1)).toBe(7200);
    });

    it("returns correct blocks per day for Arbitrum", () => {
      expect(getBlocksPerDay(42161)).toBe(345600);
    });

    it("returns correct blocks per day for Optimism", () => {
      // 86400 / 2 = 43200
      expect(getBlocksPerDay(10)).toBe(43200);
    });

    it("uses default for unknown chains", () => {
      // Uses default 12s block time: 86400 / 12 = 7200
      expect(getBlocksPerDay(99999)).toBe(7200);
    });
  });

  describe("timeToBlocks", () => {
    it("converts seconds to blocks for Ethereum", () => {
      expect(timeToBlocks(60, 1)).toBe(5); // 60s / 12s = 5 blocks
      expect(timeToBlocks(120, 1)).toBe(10);
    });

    it("converts seconds to blocks for Arbitrum", () => {
      expect(timeToBlocks(1, 42161)).toBe(4); // 1s / 0.25s = 4 blocks
      expect(timeToBlocks(10, 42161)).toBe(40);
    });

    it("rounds up partial blocks", () => {
      // 5s / 12s = 0.416... should round up to 1
      expect(timeToBlocks(5, 1)).toBe(1);
      // 25s / 12s = 2.08... should round up to 3
      expect(timeToBlocks(25, 1)).toBe(3);
    });

    it("handles zero seconds", () => {
      expect(timeToBlocks(0, 1)).toBe(0);
    });
  });

  describe("blocksToTime", () => {
    it("converts blocks to seconds for Ethereum", () => {
      expect(blocksToTime(5, 1)).toBe(60); // 5 blocks * 12s = 60s
      expect(blocksToTime(10, 1)).toBe(120);
    });

    it("converts blocks to seconds for Arbitrum", () => {
      expect(blocksToTime(4, 42161)).toBe(1); // 4 blocks * 0.25s = 1s
      expect(blocksToTime(40, 42161)).toBe(10);
    });

    it("handles zero blocks", () => {
      expect(blocksToTime(0, 1)).toBe(0);
    });

    it("handles large block counts", () => {
      // 1 million blocks on Ethereum = 12 million seconds
      expect(blocksToTime(1000000, 1)).toBe(12000000);
    });
  });

  describe("round-trip consistency", () => {
    it("timeToBlocks then blocksToTime gives approximately original time", () => {
      const originalSeconds = 3600; // 1 hour
      const blocks = timeToBlocks(originalSeconds, 1);
      const resultSeconds = blocksToTime(blocks, 1);
      // Due to ceiling in timeToBlocks, result may be slightly higher
      expect(resultSeconds).toBeGreaterThanOrEqual(originalSeconds);
      // But not by more than one block time
      expect(resultSeconds - originalSeconds).toBeLessThan(12);
    });
  });
});
