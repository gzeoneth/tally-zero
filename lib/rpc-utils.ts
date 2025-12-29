export const DEFAULT_MAX_BLOCK_RANGE = 10_000_000;

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  rateLimitDelay?: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 16000,
  backoffFactor: 2,
  rateLimitDelay: 2000, // delay between sequential queries
};

export async function queryWithRetry<T>(
  queryFn: () => Promise<T>,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS
): Promise<T> {
  let lastError: Error = new Error("All retry attempts failed");
  let delay = options.initialDelay || 1000;

  for (let attempt = 0; attempt <= (options.maxRetries || 3); attempt++) {
    try {
      return await queryFn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a rate limit error
      const errorObj = error as { code?: number; message?: string };
      if (
        errorObj.code === 429 ||
        errorObj.message?.includes("rate limit") ||
        errorObj.message?.includes("too many requests")
      ) {
        console.warn(
          `Rate limit hit, attempt ${attempt + 1}/${(options.maxRetries || 3) + 1}`
        );
      }

      if (attempt < (options.maxRetries || 3)) {
        console.warn(`Retry attempt ${attempt + 1} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(
          delay * (options.backoffFactor || 2),
          options.maxDelay || 16000
        );
      }
    }
  }

  throw lastError;
}

export async function batchQueryWithRateLimit<T>(
  queries: (() => Promise<T>)[],
  batchSize: number = 5,
  delayBetweenBatches: number = 1000
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((query) => queryWithRetry(query))
    );
    results.push(...batchResults);

    // Add delay between batches to avoid rate limits
    if (i + batchSize < queries.length) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    }
  }

  return results;
}
