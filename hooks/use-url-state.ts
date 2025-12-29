"use client";

import { isValidTxHash } from "@/lib/address-utils";
import { useCallback, useEffect, useState } from "react";

/**
 * URL state types for deep linking support
 */
export type UrlStateType = "proposal" | "timelock" | null;

export interface UrlState {
  type: UrlStateType;
  id: string | null;
  tab?: string;
  /** Operation index for timelock deep links (1-based) */
  opIndex?: number;
}

/**
 * Parses the URL hash to extract deep link state
 * Supports formats:
 * - #proposal/<proposalId>
 * - #proposal/<proposalId>/<tab>
 * - #timelock/<txHash>
 * - #timelock/<txHash>/<opIndex>
 */
function parseUrlHash(hash: string): UrlState {
  if (!hash || hash === "#") {
    return { type: null, id: null };
  }

  // Remove leading # if present
  const cleanHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const parts = cleanHash.split("/");

  if (parts.length < 2) {
    return { type: null, id: null };
  }

  const [type, id, thirdPart] = parts;

  if (type === "proposal" && id) {
    return { type: "proposal", id, tab: thirdPart };
  }

  if (type === "timelock" && id && isValidTxHash(id)) {
    const opIndex = thirdPart ? parseInt(thirdPart, 10) : undefined;
    return {
      type: "timelock",
      id,
      opIndex: opIndex && !isNaN(opIndex) && opIndex > 0 ? opIndex : undefined,
    };
  }

  return { type: null, id: null };
}

/**
 * Builds a URL hash from state
 */
function buildUrlHash(state: UrlState): string {
  if (!state.type || !state.id) {
    return "";
  }

  if (state.type === "proposal") {
    if (state.tab && state.tab !== "description") {
      return `#proposal/${state.id}/${state.tab}`;
    }
    return `#proposal/${state.id}`;
  }

  if (state.type === "timelock") {
    if (state.opIndex && state.opIndex > 0) {
      return `#timelock/${state.id}/${state.opIndex}`;
    }
    return `#timelock/${state.id}`;
  }

  return "";
}

/**
 * Hook for managing URL hash state for deep linking
 * Provides bidirectional sync between URL hash and component state
 */
export function useUrlState() {
  const [urlState, setUrlStateInternal] = useState<UrlState>({
    type: null,
    id: null,
  });

  // Parse initial hash on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const initialState = parseUrlHash(window.location.hash);
    setUrlStateInternal(initialState);
  }, []);

  // Listen for hash changes (back/forward navigation)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleHashChange = () => {
      const newState = parseUrlHash(window.location.hash);
      setUrlStateInternal(newState);
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Update URL hash when state changes programmatically
  const setUrlState = useCallback((newState: UrlState) => {
    if (typeof window === "undefined") return;

    const newHash = buildUrlHash(newState);
    // Normalize current hash for comparison (remove # prefix if present)
    const currentHashNormalized = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const newHashNormalized = newHash.startsWith("#")
      ? newHash.slice(1)
      : newHash;

    // Only update if different to avoid extra history entries
    if (newHashNormalized !== currentHashNormalized) {
      if (newHash) {
        // Set hash directly - this works well with Next.js
        window.location.hash = newHash;
      } else {
        // Clear hash by setting to empty - this leaves a trailing # but is safe with Next.js
        // The trailing # is acceptable and doesn't affect functionality
        window.location.hash = "";
      }
    }

    setUrlStateInternal(newState);
  }, []);

  // Convenience methods
  const openProposal = useCallback(
    (proposalId: string, tab?: string) => {
      setUrlState({ type: "proposal", id: proposalId, tab });
    },
    [setUrlState]
  );

  const openTimelock = useCallback(
    (txHash: string, opIndex?: number) => {
      setUrlState({ type: "timelock", id: txHash, opIndex });
    },
    [setUrlState]
  );

  const clearUrlState = useCallback(() => {
    setUrlState({ type: null, id: null });
  }, [setUrlState]);

  return {
    urlState,
    setUrlState,
    openProposal,
    openTimelock,
    clearUrlState,
  };
}
