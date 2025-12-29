import { describe, expect, it } from "vitest";

import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_GOVERNORS,
  blocksToTime,
  CORE_GOVERNOR,
  DEFAULT_CHUNKING_CONFIG,
  DEFAULT_FORM_VALUES,
  getGovernorConfig,
  L1_TIMELOCK,
  L2_CORE_TIMELOCK,
  L2_TREASURY_TIMELOCK,
  PROPOSAL_STATE_NAMES,
  timeToBlocks,
  TREASURY_GOVERNOR,
} from "./arbitrum-governance";

describe("arbitrum-governance config", () => {
  describe("chain constants", () => {
    it("has correct Arbitrum chain ID", () => {
      expect(ARBITRUM_CHAIN_ID).toBe(42161);
    });
  });

  describe("governor contracts", () => {
    it("Core Governor has correct address", () => {
      expect(CORE_GOVERNOR.address).toBe(
        "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9"
      );
      expect(CORE_GOVERNOR.quorum).toBe("4.5%");
    });

    it("Treasury Governor has correct address", () => {
      expect(TREASURY_GOVERNOR.address).toBe(
        "0x789fC99093B09aD01C34DC7251D0C89ce743e5a4"
      );
      expect(TREASURY_GOVERNOR.quorum).toBe("3%");
    });

    it("ARBITRUM_GOVERNORS contains both governors", () => {
      expect(ARBITRUM_GOVERNORS).toHaveLength(2);
      expect(ARBITRUM_GOVERNORS.map((g) => g.id)).toEqual(["core", "treasury"]);
    });
  });

  describe("timelock contracts", () => {
    it("L2 Core Timelock has 8-day delay", () => {
      expect(L2_CORE_TIMELOCK.delay).toBe("8 days");
    });

    it("L2 Treasury Timelock has 3-day delay", () => {
      expect(L2_TREASURY_TIMELOCK.delay).toBe("3 days");
    });

    it("L1 Timelock has 3-day delay", () => {
      expect(L1_TIMELOCK.delay).toBe("3 days");
    });
  });

  describe("getGovernorConfig", () => {
    it("returns correct config for core governor", () => {
      const config = getGovernorConfig("core");
      expect(config.governor).toBe(CORE_GOVERNOR);
      expect(config.l2Timelock).toBe(L2_CORE_TIMELOCK);
      expect(config.l1Timelock).toBe(L1_TIMELOCK);
      expect(config.hasL1Timelock).toBe(true);
    });

    it("returns correct config for treasury governor", () => {
      const config = getGovernorConfig("treasury");
      expect(config.governor).toBe(TREASURY_GOVERNOR);
      expect(config.l2Timelock).toBe(L2_TREASURY_TIMELOCK);
      expect(config.l1Timelock).toBeNull();
      expect(config.hasL1Timelock).toBe(false);
    });
  });

  describe("PROPOSAL_STATE_NAMES", () => {
    it("maps state numbers to names", () => {
      expect(PROPOSAL_STATE_NAMES[0]).toBe("Pending");
      expect(PROPOSAL_STATE_NAMES[1]).toBe("Active");
      expect(PROPOSAL_STATE_NAMES[2]).toBe("Canceled");
      expect(PROPOSAL_STATE_NAMES[3]).toBe("Defeated");
      expect(PROPOSAL_STATE_NAMES[4]).toBe("Succeeded");
      expect(PROPOSAL_STATE_NAMES[5]).toBe("Queued");
      expect(PROPOSAL_STATE_NAMES[6]).toBe("Expired");
      expect(PROPOSAL_STATE_NAMES[7]).toBe("Executed");
    });
  });

  describe("DEFAULT_FORM_VALUES", () => {
    it("has reasonable defaults", () => {
      expect(DEFAULT_FORM_VALUES.daysToSearch).toBe(120);
      expect(DEFAULT_FORM_VALUES.blockRange).toBe(10000000);
      expect(DEFAULT_FORM_VALUES.l1BlockRange).toBe(1000);
    });
  });

  describe("DEFAULT_CHUNKING_CONFIG", () => {
    it("matches form values", () => {
      expect(DEFAULT_CHUNKING_CONFIG.l2ChunkSize).toBe(
        DEFAULT_FORM_VALUES.blockRange
      );
      expect(DEFAULT_CHUNKING_CONFIG.l1ChunkSize).toBe(
        DEFAULT_FORM_VALUES.l1BlockRange
      );
    });

    it("has delay between chunks", () => {
      expect(DEFAULT_CHUNKING_CONFIG.delayBetweenChunks).toBe(100);
    });
  });

  describe("timeToBlocks", () => {
    it("converts seconds to blocks for ethereum", () => {
      // 1 hour = 3600 seconds, at 12s/block = 300 blocks
      expect(timeToBlocks(3600, "ethereum")).toBe(300);
    });

    it("converts seconds to blocks for arbitrum", () => {
      // 1 second = 4 blocks at 0.25s/block
      expect(timeToBlocks(1, "arbitrum")).toBe(4);
      // 60 seconds = 240 blocks
      expect(timeToBlocks(60, "arbitrum")).toBe(240);
    });
  });

  describe("blocksToTime", () => {
    it("converts blocks to seconds for ethereum", () => {
      // 300 blocks at 12s/block = 3600 seconds
      expect(blocksToTime(300, "ethereum")).toBe(3600);
    });

    it("converts blocks to seconds for arbitrum", () => {
      // 4 blocks at 0.25s/block = 1 second
      expect(blocksToTime(4, "arbitrum")).toBe(1);
      // 240 blocks = 60 seconds
      expect(blocksToTime(240, "arbitrum")).toBe(60);
    });
  });

  describe("round-trip conversions", () => {
    it("ethereum: blocks -> time -> blocks", () => {
      const originalBlocks = 100;
      const time = blocksToTime(originalBlocks, "ethereum");
      const resultBlocks = timeToBlocks(time, "ethereum");
      expect(resultBlocks).toBe(originalBlocks);
    });

    it("arbitrum: blocks -> time -> blocks", () => {
      const originalBlocks = 100;
      const time = blocksToTime(originalBlocks, "arbitrum");
      const resultBlocks = timeToBlocks(time, "arbitrum");
      expect(resultBlocks).toBe(originalBlocks);
    });
  });
});
