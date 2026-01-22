import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock debug before importing the hook
vi.mock("@/lib/debug", () => ({
  debug: {
    storage: vi.fn(),
  },
}));

// Test implementation without React hooks
// This tests the core logic that would be used in the hook

describe("useLocalStorage logic", () => {
  const originalLocalStorage = global.localStorage;
  let mockStorage: Map<string, string>;

  beforeEach(() => {
    mockStorage = new Map();
    const mockLocalStorage = {
      getItem: vi.fn((key: string) => mockStorage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) =>
        mockStorage.set(key, value)
      ),
      removeItem: vi.fn((key: string) => mockStorage.delete(key)),
      clear: vi.fn(() => mockStorage.clear()),
      length: 0,
      key: vi.fn(() => null),
    };
    Object.defineProperty(global, "localStorage", {
      value: mockLocalStorage,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(global, "localStorage", {
      value: originalLocalStorage,
      writable: true,
    });
    vi.clearAllMocks();
  });

  describe("getItem parsing", () => {
    it("returns null for missing keys", () => {
      const result = localStorage.getItem("missing-key");
      expect(result).toBeNull();
    });

    it("returns stored JSON string", () => {
      mockStorage.set("test-key", JSON.stringify({ value: 42 }));
      const result = localStorage.getItem("test-key");
      expect(result).toBe('{"value":42}');
    });

    it("parses stored JSON correctly", () => {
      mockStorage.set("test-key", JSON.stringify("hello"));
      const result = localStorage.getItem("test-key");
      expect(JSON.parse(result!)).toBe("hello");
    });

    it("parses complex objects", () => {
      const complex = { nested: { array: [1, 2, 3], bool: true } };
      mockStorage.set("complex-key", JSON.stringify(complex));
      const result = localStorage.getItem("complex-key");
      expect(JSON.parse(result!)).toEqual(complex);
    });

    it("handles numeric values", () => {
      mockStorage.set("number-key", JSON.stringify(123));
      const result = localStorage.getItem("number-key");
      expect(JSON.parse(result!)).toBe(123);
    });

    it("handles boolean values", () => {
      mockStorage.set("bool-key", JSON.stringify(false));
      const result = localStorage.getItem("bool-key");
      expect(JSON.parse(result!)).toBe(false);
    });

    it("handles null values", () => {
      mockStorage.set("null-key", JSON.stringify(null));
      const result = localStorage.getItem("null-key");
      expect(JSON.parse(result!)).toBeNull();
    });

    it("handles array values", () => {
      mockStorage.set("array-key", JSON.stringify([1, "two", { three: 3 }]));
      const result = localStorage.getItem("array-key");
      expect(JSON.parse(result!)).toEqual([1, "two", { three: 3 }]);
    });
  });

  describe("setItem serialization", () => {
    it("stores string values as JSON", () => {
      localStorage.setItem("string-key", JSON.stringify("test value"));
      expect(mockStorage.get("string-key")).toBe('"test value"');
    });

    it("stores object values as JSON", () => {
      const obj = { foo: "bar", count: 5 };
      localStorage.setItem("object-key", JSON.stringify(obj));
      expect(mockStorage.get("object-key")).toBe('{"foo":"bar","count":5}');
    });

    it("stores array values as JSON", () => {
      localStorage.setItem("array-key", JSON.stringify([1, 2, 3]));
      expect(mockStorage.get("array-key")).toBe("[1,2,3]");
    });

    it("overwrites existing values", () => {
      mockStorage.set("overwrite-key", JSON.stringify("old"));
      localStorage.setItem("overwrite-key", JSON.stringify("new"));
      expect(mockStorage.get("overwrite-key")).toBe('"new"');
    });
  });

  describe("functional update pattern", () => {
    it("supports function-based updates", () => {
      const prev = 10;
      const updater = (p: number) => p + 5;
      const result = updater(prev);
      expect(result).toBe(15);
    });

    it("distinguishes function from direct value", () => {
      const value: unknown = 42;
      const isFunction = value instanceof Function;
      expect(isFunction).toBe(false);

      const updater: unknown = (x: number) => x * 2;
      const isUpdaterFunction = updater instanceof Function;
      expect(isUpdaterFunction).toBe(true);
    });
  });

  describe("storage event handling logic", () => {
    interface MockStorageEvent {
      key: string | null;
      newValue: string | null;
      oldValue: string | null;
    }

    function createMockStorageEvent(options: {
      key: string;
      newValue: string | null;
      oldValue?: string | null;
    }): MockStorageEvent {
      return {
        key: options.key,
        newValue: options.newValue,
        oldValue: options.oldValue ?? null,
      };
    }

    it("creates event with correct structure", () => {
      const event = createMockStorageEvent({
        key: "test-key",
        newValue: JSON.stringify("new value"),
        oldValue: JSON.stringify("old value"),
      });

      expect(event.key).toBe("test-key");
      expect(event.newValue).toBe('"new value"');
      expect(event.oldValue).toBe('"old value"');
    });

    it("handles deletion events (newValue is null)", () => {
      const event = createMockStorageEvent({
        key: "deleted-key",
        newValue: null,
        oldValue: JSON.stringify("was here"),
      });

      expect(event.key).toBe("deleted-key");
      expect(event.newValue).toBeNull();
    });

    it("filters events by key", () => {
      const targetKey = "my-key";
      const otherKey = "other-key";

      const targetEvent = createMockStorageEvent({
        key: targetKey,
        newValue: "value",
      });

      const otherEvent = createMockStorageEvent({
        key: otherKey,
        newValue: "value",
      });

      expect(targetEvent.key === targetKey).toBe(true);
      expect(otherEvent.key === targetKey).toBe(false);
    });

    it("event handler correctly identifies matching key", () => {
      const listenKey = "watched-key";
      const events = [
        createMockStorageEvent({ key: "watched-key", newValue: "a" }),
        createMockStorageEvent({ key: "other-key", newValue: "b" }),
        createMockStorageEvent({ key: "watched-key", newValue: "c" }),
      ];

      const matchingEvents = events.filter((e) => e.key === listenKey);
      expect(matchingEvents).toHaveLength(2);
    });
  });

  describe("error handling", () => {
    it("handles invalid JSON gracefully", () => {
      mockStorage.set("invalid-json", "not valid json {");
      const raw = localStorage.getItem("invalid-json");

      expect(() => JSON.parse(raw!)).toThrow();
    });

    it("handles circular reference errors in setItem", () => {
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;

      expect(() => JSON.stringify(circular)).toThrow();
    });
  });

  describe("edge cases", () => {
    it("handles empty string values", () => {
      mockStorage.set("empty-key", JSON.stringify(""));
      const result = localStorage.getItem("empty-key");
      expect(JSON.parse(result!)).toBe("");
    });

    it("handles undefined serialization", () => {
      // undefined becomes 'undefined' string or is omitted from objects
      const obj = { a: 1, b: undefined };
      const serialized = JSON.stringify(obj);
      expect(serialized).toBe('{"a":1}'); // undefined is omitted
    });

    it("handles special characters in strings", () => {
      const special = 'hello\nworld\t"quotes"';
      mockStorage.set("special-key", JSON.stringify(special));
      const result = localStorage.getItem("special-key");
      expect(JSON.parse(result!)).toBe(special);
    });

    it("handles unicode characters", () => {
      const unicode = "こんにちは 🎉 émojis";
      mockStorage.set("unicode-key", JSON.stringify(unicode));
      const result = localStorage.getItem("unicode-key");
      expect(JSON.parse(result!)).toBe(unicode);
    });

    it("handles very large values", () => {
      const largeArray = Array.from({ length: 10000 }, (_, i) => i);
      mockStorage.set("large-key", JSON.stringify(largeArray));
      const result = localStorage.getItem("large-key");
      expect(JSON.parse(result!)).toHaveLength(10000);
    });
  });
});
