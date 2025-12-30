/**
 * Debug logging utilities for TallyZero
 *
 * Uses the industry-standard `debug` package with environment-aware defaults:
 * - Node.js: Enable via DEBUG=tally:* environment variable
 * - Browser: Enable via nerd mode + debug toggle in settings
 *
 * @example
 * ```ts
 * import { debug } from "@/lib/debug";
 *
 * debug.stageTracker("Tracking proposal %s", proposalId);
 * debug.rpc("Fetching block %d", blockNumber);
 * ```
 *
 * Enable specific namespaces:
 * - DEBUG=tally:* (all)
 * - DEBUG=tally:rpc,tally:cache (specific)
 * - DEBUG=tally:stage-tracker (single)
 */

import createDebug from "debug";

import { STORAGE_KEYS } from "@/config/storage-keys";

// ============================================================================
// Environment Detection
// ============================================================================

const IS_BROWSER =
  typeof window !== "undefined" && typeof localStorage !== "undefined";

// ============================================================================
// Browser Integration
// ============================================================================

/**
 * Check if debug logging is enabled in browser via nerd mode + debug toggle
 */
function isBrowserDebugEnabled(): boolean {
  if (!IS_BROWSER) return false;

  try {
    const nerdMode = localStorage.getItem(STORAGE_KEYS.NERD_MODE) === "true";
    const debugLogging =
      localStorage.getItem(STORAGE_KEYS.DEBUG_LOGGING) === "true";
    return nerdMode && debugLogging;
  } catch {
    return false;
  }
}

/**
 * Check if debug logging is currently enabled
 */
export function isDebugEnabled(): boolean {
  if (IS_BROWSER) {
    return isBrowserDebugEnabled();
  }
  // In Node.js, check if DEBUG env includes tally namespaces
  const debugEnv =
    // eslint-disable-next-line no-process-env
    typeof process !== "undefined" ? process.env?.DEBUG : undefined;
  return debugEnv?.includes("tally") ?? false;
}

// ============================================================================
// Logger Factory
// ============================================================================

type DebugLogger = ReturnType<typeof createDebug>;

/**
 * Create a wrapped debug logger that respects our browser settings
 * In Node.js, uses debug package directly (respects DEBUG env)
 * In browser, checks nerd mode + debug toggle before logging
 */
function createWrappedLogger(namespace: string): DebugLogger {
  const baseLogger = createDebug(namespace);

  if (!IS_BROWSER) {
    // In Node.js, use the debug package directly
    return baseLogger;
  }

  // In browser, wrap to check our settings on each call
  const wrappedLogger = (formatter: string, ...args: unknown[]) => {
    if (isBrowserDebugEnabled()) {
      // Temporarily enable this namespace for logging
      const prevEnabled = createDebug.enabled(namespace);
      if (!prevEnabled) {
        createDebug.enable(namespace);
      }
      baseLogger(formatter, ...args);
      if (!prevEnabled) {
        createDebug.disable();
      }
    }
  };

  // Copy over debug package properties for compatibility
  Object.assign(wrappedLogger, baseLogger);
  return wrappedLogger as DebugLogger;
}

// ============================================================================
// Pre-defined Loggers
// ============================================================================

/**
 * Namespaced debug loggers for common subsystems
 *
 * Enable via:
 * - Node.js: DEBUG=tally:* yarn cache:build
 * - Browser: Settings → Nerd Mode → Debug Logging
 */
export const debug = {
  stageTracker: createWrappedLogger("tally:stage-tracker"),
  rpc: createWrappedLogger("tally:rpc"),
  cache: createWrappedLogger("tally:cache"),
  lifecycle: createWrappedLogger("tally:lifecycle"),
  calldata: createWrappedLogger("tally:calldata"),
  app: createWrappedLogger("tally:app"),
} as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Enable debug logging (browser only)
 * Sets the localStorage flag - takes effect immediately
 */
export function enableDebugLogging(): void {
  if (!IS_BROWSER) return;

  try {
    localStorage.setItem(STORAGE_KEYS.DEBUG_LOGGING, "true");
    console.log(
      "[TallyZero] Debug logging enabled. Namespaces:",
      Object.keys(debug).join(", ")
    );
  } catch {
    // Storage unavailable
  }
}

/**
 * Disable debug logging (browser only)
 */
export function disableDebugLogging(): void {
  if (!IS_BROWSER) return;

  try {
    localStorage.removeItem(STORAGE_KEYS.DEBUG_LOGGING);
    console.log("[TallyZero] Debug logging disabled.");
  } catch {
    // Storage unavailable
  }
}

// ============================================================================
// Browser Console API
// ============================================================================

if (IS_BROWSER) {
  Object.assign(window, {
    TallyZeroDebug: {
      enable: enableDebugLogging,
      disable: disableDebugLogging,
      isEnabled: isDebugEnabled,
      namespaces: Object.keys(debug),
    },
  });
}
