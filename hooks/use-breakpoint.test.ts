import { describe, expect, it } from "vitest";

import { BREAKPOINTS, computeBreakpointState } from "./use-breakpoint";

describe("use-breakpoint", () => {
  describe("BREAKPOINTS", () => {
    it("has correct Tailwind breakpoint values", () => {
      expect(BREAKPOINTS.sm).toBe(640);
      expect(BREAKPOINTS.md).toBe(768);
      expect(BREAKPOINTS.lg).toBe(1024);
      expect(BREAKPOINTS.xl).toBe(1280);
      expect(BREAKPOINTS["2xl"]).toBe(1536);
    });
  });

  describe("computeBreakpointState", () => {
    it("returns all false for mobile width (< 640px)", () => {
      const state = computeBreakpointState(500);

      expect(state.isMobile).toBe(true);
      expect(state.sm).toBe(false);
      expect(state.md).toBe(false);
      expect(state.lg).toBe(false);
      expect(state.xl).toBe(false);
      expect(state["2xl"]).toBe(false);
    });

    it("returns sm=true at 640px", () => {
      const state = computeBreakpointState(640);

      expect(state.isMobile).toBe(false);
      expect(state.sm).toBe(true);
      expect(state.md).toBe(false);
      expect(state.lg).toBe(false);
      expect(state.xl).toBe(false);
      expect(state["2xl"]).toBe(false);
    });

    it("returns md=true at 768px", () => {
      const state = computeBreakpointState(768);

      expect(state.isMobile).toBe(false);
      expect(state.sm).toBe(true);
      expect(state.md).toBe(true);
      expect(state.lg).toBe(false);
      expect(state.xl).toBe(false);
      expect(state["2xl"]).toBe(false);
    });

    it("returns lg=true at 1024px", () => {
      const state = computeBreakpointState(1024);

      expect(state.isMobile).toBe(false);
      expect(state.sm).toBe(true);
      expect(state.md).toBe(true);
      expect(state.lg).toBe(true);
      expect(state.xl).toBe(false);
      expect(state["2xl"]).toBe(false);
    });

    it("returns xl=true at 1280px", () => {
      const state = computeBreakpointState(1280);

      expect(state.isMobile).toBe(false);
      expect(state.sm).toBe(true);
      expect(state.md).toBe(true);
      expect(state.lg).toBe(true);
      expect(state.xl).toBe(true);
      expect(state["2xl"]).toBe(false);
    });

    it("returns all true at 2xl (1536px)", () => {
      const state = computeBreakpointState(1536);

      expect(state.isMobile).toBe(false);
      expect(state.sm).toBe(true);
      expect(state.md).toBe(true);
      expect(state.lg).toBe(true);
      expect(state.xl).toBe(true);
      expect(state["2xl"]).toBe(true);
    });

    it("handles boundary conditions correctly", () => {
      // Just below sm
      expect(computeBreakpointState(639).sm).toBe(false);
      expect(computeBreakpointState(639).isMobile).toBe(true);

      // Just below md
      expect(computeBreakpointState(767).md).toBe(false);
      expect(computeBreakpointState(767).sm).toBe(true);

      // Just below lg
      expect(computeBreakpointState(1023).lg).toBe(false);
      expect(computeBreakpointState(1023).md).toBe(true);

      // Just below xl
      expect(computeBreakpointState(1279).xl).toBe(false);
      expect(computeBreakpointState(1279).lg).toBe(true);

      // Just below 2xl
      expect(computeBreakpointState(1535)["2xl"]).toBe(false);
      expect(computeBreakpointState(1535).xl).toBe(true);
    });

    it("handles zero width", () => {
      const state = computeBreakpointState(0);

      expect(state.isMobile).toBe(true);
      expect(state.sm).toBe(false);
    });

    it("handles very large width", () => {
      const state = computeBreakpointState(4000);

      expect(state.isMobile).toBe(false);
      expect(state.sm).toBe(true);
      expect(state.md).toBe(true);
      expect(state.lg).toBe(true);
      expect(state.xl).toBe(true);
      expect(state["2xl"]).toBe(true);
    });
  });
});
