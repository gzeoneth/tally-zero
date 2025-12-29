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
