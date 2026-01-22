"use client";

/**
 * Hook for creating cancellation-aware async operations
 * Consolidates the common pattern of using AbortController + cancelled flag
 */

import { useCallback, useEffect, useRef } from "react";

/** Return type for useAbortSignal hook */
export interface UseAbortSignalResult {
  /** Check if current operation should be cancelled */
  isCancelled: () => boolean;
  /** Get the abort signal for fetch/other AbortController-aware APIs */
  getSignal: () => AbortSignal;
  /** Manually abort the current operation */
  abort: () => void;
  /** Reset abort state for a new operation */
  reset: () => void;
}

/**
 * Hook for managing cancellation state in async operations
 * Provides both a cancelled flag check and an AbortSignal
 *
 * @returns Cancellation utilities
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isCancelled, getSignal, reset } = useAbortSignal();
 *
 *   useEffect(() => {
 *     reset(); // Reset for new effect run
 *     const signal = getSignal();
 *
 *     async function fetchData() {
 *       const response = await fetch(url, { signal });
 *       if (isCancelled()) return;
 *       // process response...
 *     }
 *
 *     fetchData();
 *   }, [deps]);
 * }
 * ```
 */
export function useAbortSignal(): UseAbortSignalResult {
  const controllerRef = useRef<AbortController>(new AbortController());
  const cancelledRef = useRef(false);

  // Auto-cleanup on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      controllerRef.current.abort();
    };
  }, []);

  const isCancelled = useCallback(() => {
    return cancelledRef.current || controllerRef.current.signal.aborted;
  }, []);

  const getSignal = useCallback(() => {
    return controllerRef.current.signal;
  }, []);

  const abort = useCallback(() => {
    cancelledRef.current = true;
    controllerRef.current.abort();
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = false;
    controllerRef.current = new AbortController();
  }, []);

  return { isCancelled, getSignal, abort, reset };
}
