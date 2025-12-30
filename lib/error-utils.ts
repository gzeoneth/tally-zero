/**
 * Converts an unknown error type to an Error object.
 * Use this when you need to store or rethrow an Error.
 *
 * @example
 * catch (err) {
 *   setError(toError(err));
 * }
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  if (error && typeof error === "object" && "message" in error) {
    return new Error(String((error as { message: unknown }).message));
  }
  return new Error(String(error));
}

/**
 * Extracts a user-friendly error message from various error types.
 * Handles Error objects, strings, ethers.js errors, and unknown types.
 */
export function getErrorMessage(error: unknown, context?: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return context ? `Failed to ${context}` : "An error occurred";
}
