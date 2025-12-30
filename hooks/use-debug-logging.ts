"use client";

import { STORAGE_KEYS } from "@/config/storage-keys";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useCallback, useMemo } from "react";

/**
 * Hook to manage debug logging state
 *
 * Debug logging is only effective when nerd mode is also enabled.
 * Changes take effect after page refresh.
 */
export function useDebugLogging() {
  const [enabled, setEnabled] = useLocalStorage<boolean>(
    STORAGE_KEYS.DEBUG_LOGGING,
    false
  );

  const toggle = useCallback(() => {
    setEnabled(!enabled);
    // Inform user that refresh is needed
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, [enabled, setEnabled]);

  return useMemo(
    () => ({
      enabled,
      setEnabled,
      toggle,
    }),
    [enabled, setEnabled, toggle]
  );
}
