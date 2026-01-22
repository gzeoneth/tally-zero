import { describe, expect, it, vi } from "vitest";

import { delay, withTimeout } from "./delay-utils";

describe("delay-utils", () => {
  describe("delay", () => {
    it("returns a promise", () => {
      const result = delay(0);
      expect(result).toBeInstanceOf(Promise);
    });

    it("resolves after the specified time", async () => {
      vi.useFakeTimers();

      let resolved = false;
      const promise = delay(100).then(() => {
        resolved = true;
      });

      expect(resolved).toBe(false);

      vi.advanceTimersByTime(50);
      await Promise.resolve(); // Flush microtasks
      expect(resolved).toBe(false);

      vi.advanceTimersByTime(50);
      await promise;
      expect(resolved).toBe(true);

      vi.useRealTimers();
    });

    it("resolves with undefined", async () => {
      const result = await delay(0);
      expect(result).toBeUndefined();
    });

    it("handles zero milliseconds", async () => {
      const start = Date.now();
      await delay(0);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(50); // Should resolve almost immediately
    });
  });

  describe("withTimeout", () => {
    it("returns the promise result if it resolves before timeout", async () => {
      const promise = Promise.resolve("success");
      const result = await withTimeout(promise, 1000);
      expect(result).toBe("success");
    });

    it("rejects with timeout error if promise takes too long", async () => {
      vi.useFakeTimers();

      const slowPromise = new Promise((resolve) => setTimeout(resolve, 5000));
      const timeoutPromise = withTimeout(slowPromise, 100);

      vi.advanceTimersByTime(100);

      await expect(timeoutPromise).rejects.toThrow("Operation timed out");

      vi.useRealTimers();
    });

    it("uses custom error message when provided", async () => {
      vi.useFakeTimers();

      const slowPromise = new Promise((resolve) => setTimeout(resolve, 5000));
      const timeoutPromise = withTimeout(slowPromise, 100, "Custom timeout");

      vi.advanceTimersByTime(100);

      await expect(timeoutPromise).rejects.toThrow("Custom timeout");

      vi.useRealTimers();
    });

    it("propagates errors from the original promise", async () => {
      const failingPromise = Promise.reject(new Error("Original error"));
      await expect(withTimeout(failingPromise, 1000)).rejects.toThrow(
        "Original error"
      );
    });

    it("resolves immediately for already resolved promises", async () => {
      const result = await withTimeout(Promise.resolve(42), 1000);
      expect(result).toBe(42);
    });

    it("preserves the resolved value type", async () => {
      const obj = { a: 1, b: "test" };
      const result = await withTimeout(Promise.resolve(obj), 1000);
      expect(result).toEqual(obj);
    });
  });
});
