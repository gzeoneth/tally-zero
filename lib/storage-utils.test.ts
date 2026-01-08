import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CACHE_VERSION,
  DEFAULT_CACHE_TTL_MS,
  STORAGE_KEYS,
} from "@/config/storage-keys";

import {
  checkAndInvalidateCacheVersion,
  clearAllCaches,
  getStoredCacheTtlMs,
  getStoredJsonString,
  getStoredNumber,
  getStoredString,
  getStoredValue,
  hasStoredValue,
  removeStoredValue,
  setStoredValue,
} from "./storage-utils";

describe("storage-utils", () => {
  // Mock localStorage
  const mockStorage: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: vi.fn((key: string) => mockStorage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
    }),
    get length() {
      return Object.keys(mockStorage).length;
    },
    key: vi.fn((index: number) => Object.keys(mockStorage)[index] ?? null),
  };

  beforeEach(() => {
    // Clear mock storage
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);

    // Mock window with localStorage
    vi.stubGlobal("window", { localStorage: mockLocalStorage });
    vi.stubGlobal("localStorage", mockLocalStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getStoredValue", () => {
    it("returns default value when key does not exist", () => {
      expect(getStoredValue("nonexistent", "default")).toBe("default");
    });

    it("returns parsed JSON value when key exists", () => {
      mockStorage["test-key"] = JSON.stringify({ foo: "bar" });
      expect(getStoredValue("test-key", {})).toEqual({ foo: "bar" });
    });

    it("uses custom deserializer when provided", () => {
      mockStorage["test-key"] = "42";
      const result = getStoredValue("test-key", 0, (v) => parseInt(v, 10));
      expect(result).toBe(42);
    });

    it("returns default value on parse error", () => {
      mockStorage["test-key"] = "invalid json {";
      expect(getStoredValue("test-key", "default")).toBe("default");
    });
  });

  describe("getStoredString", () => {
    it("returns default value when key does not exist", () => {
      expect(getStoredString("nonexistent", "default")).toBe("default");
    });

    it("returns stored string directly", () => {
      mockStorage["test-key"] = "stored value";
      expect(getStoredString("test-key", "default")).toBe("stored value");
    });
  });

  describe("getStoredJsonString", () => {
    it("returns default value when key does not exist", () => {
      expect(getStoredJsonString("nonexistent", "default")).toBe("default");
    });

    it("returns parsed JSON string value", () => {
      mockStorage["test-key"] = JSON.stringify("json string");
      expect(getStoredJsonString("test-key", "default")).toBe("json string");
    });

    it("returns default value for invalid JSON", () => {
      mockStorage["test-key"] = "invalid json {";
      expect(getStoredJsonString("test-key", "default")).toBe("default");
    });

    it("returns default value for empty parsed value", () => {
      mockStorage["test-key"] = JSON.stringify("");
      expect(getStoredJsonString("test-key", "default")).toBe("default");
    });
  });

  describe("getStoredNumber", () => {
    it("returns default value when key does not exist", () => {
      expect(getStoredNumber("nonexistent", 42)).toBe(42);
    });

    it("returns parsed number", () => {
      mockStorage["test-key"] = JSON.stringify(123);
      expect(getStoredNumber("test-key", 0)).toBe(123);
    });

    it("returns default value for non-number", () => {
      mockStorage["test-key"] = JSON.stringify("not a number");
      expect(getStoredNumber("test-key", 42)).toBe(42);
    });

    it("returns default value for NaN", () => {
      mockStorage["test-key"] = JSON.stringify(NaN);
      expect(getStoredNumber("test-key", 42)).toBe(42);
    });

    it("returns default value for invalid JSON", () => {
      mockStorage["test-key"] = "invalid json";
      expect(getStoredNumber("test-key", 42)).toBe(42);
    });
  });

  describe("setStoredValue", () => {
    it("stores JSON serialized value", () => {
      setStoredValue("test-key", { foo: "bar" });
      expect(mockStorage["test-key"]).toBe('{"foo":"bar"}');
    });

    it("uses custom serializer when provided", () => {
      setStoredValue("test-key", 42, (v) => `custom:${v}`);
      expect(mockStorage["test-key"]).toBe("custom:42");
    });
  });

  describe("removeStoredValue", () => {
    it("removes the key from storage", () => {
      mockStorage["test-key"] = "value";
      removeStoredValue("test-key");
      expect(mockStorage["test-key"]).toBeUndefined();
    });
  });

  describe("hasStoredValue", () => {
    it("returns false when key does not exist", () => {
      expect(hasStoredValue("nonexistent")).toBe(false);
    });

    it("returns true when key exists", () => {
      mockStorage["test-key"] = "value";
      expect(hasStoredValue("test-key")).toBe(true);
    });
  });

  describe("SSR safety (window undefined)", () => {
    beforeEach(() => {
      // Simulate SSR by making window undefined
      vi.stubGlobal("window", undefined);
    });

    it("getStoredValue returns default in SSR", () => {
      expect(getStoredValue("key", "default")).toBe("default");
    });

    it("getStoredString returns default in SSR", () => {
      expect(getStoredString("key", "default")).toBe("default");
    });

    it("getStoredJsonString returns default in SSR", () => {
      expect(getStoredJsonString("key", "default")).toBe("default");
    });

    it("getStoredNumber returns default in SSR", () => {
      expect(getStoredNumber("key", 42)).toBe(42);
    });

    it("setStoredValue does nothing in SSR", () => {
      setStoredValue("key", "value");
      // No error thrown
    });

    it("removeStoredValue does nothing in SSR", () => {
      removeStoredValue("key");
      // No error thrown
    });

    it("hasStoredValue returns false in SSR", () => {
      expect(hasStoredValue("key")).toBe(false);
    });

    it("getStoredCacheTtlMs returns default in SSR", () => {
      expect(getStoredCacheTtlMs()).toBe(DEFAULT_CACHE_TTL_MS);
    });
  });

  describe("getStoredCacheTtlMs", () => {
    it("returns default when no value is stored", () => {
      expect(getStoredCacheTtlMs()).toBe(DEFAULT_CACHE_TTL_MS);
    });

    it("converts seconds to milliseconds", () => {
      mockStorage[STORAGE_KEYS.CACHE_TTL] = JSON.stringify(120);
      expect(getStoredCacheTtlMs()).toBe(120000);
    });

    it("returns default for zero value", () => {
      mockStorage[STORAGE_KEYS.CACHE_TTL] = JSON.stringify(0);
      expect(getStoredCacheTtlMs()).toBe(DEFAULT_CACHE_TTL_MS);
    });

    it("returns default for negative value", () => {
      mockStorage[STORAGE_KEYS.CACHE_TTL] = JSON.stringify(-100);
      expect(getStoredCacheTtlMs()).toBe(DEFAULT_CACHE_TTL_MS);
    });
  });

  describe("clearAllCaches", () => {
    it("clears all stage cache entries", () => {
      // #given
      mockStorage[`${STORAGE_KEYS.STAGES_CACHE_PREFIX}0x123-1`] = "data1";
      mockStorage[`${STORAGE_KEYS.STAGES_CACHE_PREFIX}0x456-2`] = "data2";
      mockStorage[STORAGE_KEYS.L1_RPC] = "https://rpc.example.com";

      // #when
      const count = clearAllCaches();

      // #then
      expect(count).toBe(2);
      expect(
        mockStorage[`${STORAGE_KEYS.STAGES_CACHE_PREFIX}0x123-1`]
      ).toBeUndefined();
      expect(
        mockStorage[`${STORAGE_KEYS.STAGES_CACHE_PREFIX}0x456-2`]
      ).toBeUndefined();
      expect(mockStorage[STORAGE_KEYS.L1_RPC]).toBe("https://rpc.example.com");
    });

    it("clears all timelock cache entries", () => {
      // #given
      mockStorage[`${STORAGE_KEYS.TIMELOCK_OP_CACHE_PREFIX}0xabc-op1`] =
        "data1";
      mockStorage[`${STORAGE_KEYS.TIMELOCK_OP_CACHE_PREFIX}0xdef-op2`] =
        "data2";

      // #when
      const count = clearAllCaches();

      // #then
      expect(count).toBe(2);
      expect(
        mockStorage[`${STORAGE_KEYS.TIMELOCK_OP_CACHE_PREFIX}0xabc-op1`]
      ).toBeUndefined();
    });

    it("clears all checkpoint cache entries", () => {
      // #given
      mockStorage[`${STORAGE_KEYS.CHECKPOINT_CACHE_PREFIX}proposal:0x123:1`] =
        "checkpoint1";
      mockStorage[`${STORAGE_KEYS.CHECKPOINT_CACHE_PREFIX}proposal:0x456:2`] =
        "checkpoint2";

      // #when
      const count = clearAllCaches();

      // #then
      expect(count).toBe(2);
      expect(
        mockStorage[`${STORAGE_KEYS.CHECKPOINT_CACHE_PREFIX}proposal:0x123:1`]
      ).toBeUndefined();
    });

    it("clears stage, timelock, and checkpoint caches", () => {
      // #given
      mockStorage[`${STORAGE_KEYS.STAGES_CACHE_PREFIX}0x123-1`] = "stage";
      mockStorage[`${STORAGE_KEYS.TIMELOCK_OP_CACHE_PREFIX}0xabc-op1`] =
        "timelock";
      mockStorage[`${STORAGE_KEYS.CHECKPOINT_CACHE_PREFIX}proposal:0x123:1`] =
        "checkpoint";

      // #when
      const count = clearAllCaches();

      // #then
      expect(count).toBe(3);
    });

    it("returns 0 when no caches exist", () => {
      // #given
      mockStorage[STORAGE_KEYS.L1_RPC] = "https://rpc.example.com";

      // #when
      const count = clearAllCaches();

      // #then
      expect(count).toBe(0);
    });
  });

  describe("checkAndInvalidateCacheVersion", () => {
    it("does not invalidate when version matches", () => {
      // #given
      mockStorage[STORAGE_KEYS.LAST_CACHE_VERSION] =
        JSON.stringify(CACHE_VERSION);
      mockStorage[`${STORAGE_KEYS.STAGES_CACHE_PREFIX}0x123-1`] = "data";

      // #when
      const result = checkAndInvalidateCacheVersion();

      // #then
      expect(result.wasInvalidated).toBe(false);
      expect(result.currentVersion).toBe(CACHE_VERSION);
      expect(mockStorage[`${STORAGE_KEYS.STAGES_CACHE_PREFIX}0x123-1`]).toBe(
        "data"
      );
    });

    it("invalidates caches when version is older", () => {
      // #given
      const oldVersion = CACHE_VERSION - 1;
      mockStorage[STORAGE_KEYS.LAST_CACHE_VERSION] = JSON.stringify(oldVersion);
      mockStorage[`${STORAGE_KEYS.STAGES_CACHE_PREFIX}0x123-1`] = "data";
      mockStorage[`${STORAGE_KEYS.TIMELOCK_OP_CACHE_PREFIX}0xabc-op1`] = "data";
      mockStorage[`${STORAGE_KEYS.CHECKPOINT_CACHE_PREFIX}proposal:0x123:1`] =
        "checkpoint";

      // #when
      const result = checkAndInvalidateCacheVersion();

      // #then
      expect(result.wasInvalidated).toBe(true);
      expect(result.previousVersion).toBe(oldVersion);
      expect(result.currentVersion).toBe(CACHE_VERSION);
      expect(
        mockStorage[`${STORAGE_KEYS.STAGES_CACHE_PREFIX}0x123-1`]
      ).toBeUndefined();
      expect(
        mockStorage[`${STORAGE_KEYS.TIMELOCK_OP_CACHE_PREFIX}0xabc-op1`]
      ).toBeUndefined();
      expect(
        mockStorage[`${STORAGE_KEYS.CHECKPOINT_CACHE_PREFIX}proposal:0x123:1`]
      ).toBeUndefined();
    });

    it("invalidates when no version is stored (fresh install)", () => {
      // #given
      mockStorage[`${STORAGE_KEYS.STAGES_CACHE_PREFIX}0x123-1`] = "data";

      // #when
      const result = checkAndInvalidateCacheVersion();

      // #then
      expect(result.wasInvalidated).toBe(true);
      expect(result.previousVersion).toBe(null);
      expect(result.currentVersion).toBe(CACHE_VERSION);
    });

    it("stores current version after invalidation", () => {
      // #given - no version stored

      // #when
      checkAndInvalidateCacheVersion();

      // #then
      expect(mockStorage[STORAGE_KEYS.LAST_CACHE_VERSION]).toBe(
        JSON.stringify(CACHE_VERSION)
      );
    });

    it("preserves non-cache settings during invalidation", () => {
      // #given
      mockStorage[STORAGE_KEYS.L1_RPC] = "https://rpc.example.com";
      mockStorage[STORAGE_KEYS.NERD_MODE] = "true";
      mockStorage[`${STORAGE_KEYS.STAGES_CACHE_PREFIX}0x123-1`] = "data";

      // #when
      checkAndInvalidateCacheVersion();

      // #then
      expect(mockStorage[STORAGE_KEYS.L1_RPC]).toBe("https://rpc.example.com");
      expect(mockStorage[STORAGE_KEYS.NERD_MODE]).toBe("true");
      expect(
        mockStorage[`${STORAGE_KEYS.STAGES_CACHE_PREFIX}0x123-1`]
      ).toBeUndefined();
    });
  });

  describe("checkAndInvalidateCacheVersion SSR safety", () => {
    beforeEach(() => {
      vi.stubGlobal("window", undefined);
    });

    it("returns not invalidated in SSR", () => {
      // #when
      const result = checkAndInvalidateCacheVersion();

      // #then
      expect(result.wasInvalidated).toBe(false);
      expect(result.previousVersion).toBe(null);
    });
  });

  describe("clearAllCaches SSR safety", () => {
    beforeEach(() => {
      vi.stubGlobal("window", undefined);
    });

    it("returns 0 in SSR", () => {
      expect(clearAllCaches()).toBe(0);
    });
  });
});
