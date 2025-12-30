/**
 * Tests for settings utilities
 */

import { describe, expect, it } from "vitest";

import { formatTtl } from "./settings-utils";

describe("formatTtl", () => {
  it("formats seconds only", () => {
    expect(formatTtl(0)).toBe("0s");
    expect(formatTtl(1)).toBe("1s");
    expect(formatTtl(30)).toBe("30s");
    expect(formatTtl(59)).toBe("59s");
  });

  it("formats minutes and seconds", () => {
    expect(formatTtl(60)).toBe("1m 0s");
    expect(formatTtl(61)).toBe("1m 1s");
    expect(formatTtl(90)).toBe("1m 30s");
    expect(formatTtl(120)).toBe("2m 0s");
    expect(formatTtl(3599)).toBe("59m 59s");
  });

  it("formats hours and minutes", () => {
    expect(formatTtl(3600)).toBe("1h 0m");
    expect(formatTtl(3660)).toBe("1h 1m");
    expect(formatTtl(7200)).toBe("2h 0m");
    expect(formatTtl(7260)).toBe("2h 1m");
    expect(formatTtl(86400)).toBe("24h 0m");
  });

  it("handles common cache duration values", () => {
    expect(formatTtl(900)).toBe("15m 0s"); // 15 minutes
    expect(formatTtl(1800)).toBe("30m 0s"); // 30 minutes
    expect(formatTtl(3600)).toBe("1h 0m"); // 1 hour
    expect(formatTtl(7200)).toBe("2h 0m"); // 2 hours
    expect(formatTtl(21600)).toBe("6h 0m"); // 6 hours
    expect(formatTtl(86400)).toBe("24h 0m"); // 24 hours
  });
});
