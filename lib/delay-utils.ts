/**
 * Returns a promise that resolves after the specified milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if we're running in Node.js (vs browser)
 */
function isNodeEnvironment(): boolean {
  return (
    typeof process !== "undefined" &&
    process.versions != null &&
    process.versions.node != null
  );
}

/**
 * Check if debug logging is enabled for stage tracker
 * - In Node.js (cache:build scripts): enabled by default, set DEBUG_STAGE_TRACKER=false to disable
 * - In browser (UI hooks): disabled by default, set DEBUG_STAGE_TRACKER=true to enable
 */
export function isDebugEnabled(): boolean {
  /* eslint-disable no-process-env */
  if (typeof process !== "undefined" && process.env) {
    // Explicit setting takes precedence
    if (process.env.DEBUG_STAGE_TRACKER === "true") return true;
    if (process.env.DEBUG_STAGE_TRACKER === "false") return false;
  }
  /* eslint-enable no-process-env */
  // Default: enabled in Node.js, disabled in browser
  return isNodeEnvironment();
}

/**
 * Debug log - outputs based on environment and DEBUG_STAGE_TRACKER setting
 */
export function debugLog(prefix: string, ...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.log(prefix, ...args);
  }
}
