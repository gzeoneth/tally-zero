import { useEffect, useState } from "react";

const IS_SERVER = typeof window === "undefined";

/** Standard Tailwind CSS breakpoint values in pixels */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

/** Breakpoint state returned by useBreakpoint */
export interface BreakpointState {
  /** Width < 640px (mobile) */
  isMobile: boolean;
  /** Width >= 640px */
  sm: boolean;
  /** Width >= 768px */
  md: boolean;
  /** Width >= 1024px */
  lg: boolean;
  /** Width >= 1280px */
  xl: boolean;
  /** Width >= 1536px */
  "2xl": boolean;
}

const DEFAULT_STATE: BreakpointState = {
  isMobile: false,
  sm: false,
  md: false,
  lg: false,
  xl: false,
  "2xl": false,
};

export function computeBreakpointState(width: number): BreakpointState {
  return {
    isMobile: width < BREAKPOINTS.sm,
    sm: width >= BREAKPOINTS.sm,
    md: width >= BREAKPOINTS.md,
    lg: width >= BREAKPOINTS.lg,
    xl: width >= BREAKPOINTS.xl,
    "2xl": width >= BREAKPOINTS["2xl"],
  };
}

/**
 * Hook that tracks all standard Tailwind breakpoints with a single resize listener.
 * More efficient than multiple useMediaQuery calls.
 *
 * @returns Object with boolean flags for each breakpoint
 *
 * @example
 * const { isMobile, sm, md, lg, xl } = useBreakpoint();
 * // isMobile: width < 640px
 * // sm: width >= 640px
 * // md: width >= 768px
 * // lg: width >= 1024px
 * // xl: width >= 1280px
 */
export function useBreakpoint(): BreakpointState {
  const [state, setState] = useState<BreakpointState>(() => {
    if (IS_SERVER) return DEFAULT_STATE;
    return computeBreakpointState(window.innerWidth);
  });

  useEffect(() => {
    if (IS_SERVER) return;

    const handleResize = () => {
      setState(computeBreakpointState(window.innerWidth));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return state;
}
