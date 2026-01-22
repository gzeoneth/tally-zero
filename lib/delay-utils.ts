/**
 * Returns a promise that resolves after the specified milliseconds
 * @param ms - Number of milliseconds to wait
 * @returns Promise that resolves after the delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a promise with a timeout, rejecting if the timeout is reached first.
 * The original promise continues executing but its result will be ignored.
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param errorMessage - Optional custom error message (defaults to "Operation timed out")
 * @returns The result of the promise if it resolves before the timeout
 * @throws Error with the provided message if the timeout is reached first
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = "Operation timed out"
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}
