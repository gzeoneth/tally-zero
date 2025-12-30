import { ethers } from "ethers";

import {
  ARBITRUM_NOVA_RPC_URL,
  ARBITRUM_RPC_URL,
  DEFAULT_CHUNKING_CONFIG,
  ETHEREUM_RPC_URL,
} from "@/config/arbitrum-governance";
import { getErrorMessage } from "@/lib/error-utils";

export type RpcId = "arb1" | "nova" | "l1";

export interface RpcEndpoint {
  id: RpcId;
  name: string;
  url: string;
  chainId: number;
  required: boolean;
}

export interface RpcHealthResult {
  id: RpcId;
  name: string;
  url: string;
  status: "checking" | "healthy" | "degraded" | "down";
  latencyMs?: number;
  blockNumber?: number;
  error?: string;
  logSearchSupported?: boolean;
  logSearchError?: string;
}

export const DEFAULT_RPC_ENDPOINTS: RpcEndpoint[] = [
  {
    id: "arb1",
    name: "Arbitrum One",
    url: ARBITRUM_RPC_URL,
    chainId: 42161,
    required: true,
  },
  {
    id: "nova",
    name: "Arbitrum Nova",
    url: ARBITRUM_NOVA_RPC_URL,
    chainId: 42170,
    required: false,
  },
  {
    id: "l1",
    name: "Ethereum",
    url: ETHEREUM_RPC_URL,
    chainId: 1,
    required: false,
  },
];

const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds
const LOG_SEARCH_TIMEOUT = 10000; // 10 seconds for log search
const HEALTH_CACHE_TTL = 60000; // 60 seconds cache for health results

// Cache for health check results to avoid redundant RPC calls
interface HealthCacheEntry {
  result: RpcHealthResult;
  timestamp: number;
}
const healthCache = new Map<string, HealthCacheEntry>();

/**
 * Generate a cache key for an RPC health check
 */
function getCacheKey(
  endpointId: RpcId,
  customUrl?: string,
  chunkSize?: number
): string {
  return `${endpointId}:${customUrl || "default"}:${chunkSize || "default"}`;
}

/**
 * Test connectivity to a single RPC endpoint.
 * Results are cached for 60 seconds to reduce redundant RPC calls.
 */
export async function checkRpcHealth(
  endpoint: RpcEndpoint,
  customUrl?: string,
  chunkSize?: number,
  skipCache?: boolean
): Promise<RpcHealthResult> {
  const cacheKey = getCacheKey(endpoint.id, customUrl, chunkSize);

  // Check cache first (unless skipCache is true)
  if (!skipCache) {
    const cached = healthCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < HEALTH_CACHE_TTL) {
      return cached.result;
    }
  }

  const url = customUrl || endpoint.url;
  const startTime = Date.now();

  const baseResult: RpcHealthResult = {
    id: endpoint.id,
    name: endpoint.name,
    url,
    status: "checking",
  };

  if (!url || url.trim() === "") {
    return {
      ...baseResult,
      status: "down",
      error: "No RPC URL configured",
    };
  }

  try {
    const provider = new ethers.providers.JsonRpcProvider(url);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Request timeout")),
        HEALTH_CHECK_TIMEOUT
      );
    });

    const blockNumber = await Promise.race([
      provider.getBlockNumber(),
      timeoutPromise,
    ]);

    const latencyMs = Date.now() - startTime;

    // Test log search with configured chunk size
    const effectiveChunkSize =
      chunkSize ||
      (endpoint.id === "l1"
        ? DEFAULT_CHUNKING_CONFIG.l1ChunkSize
        : DEFAULT_CHUNKING_CONFIG.l2ChunkSize);

    const logSearchResult = await testLogSearch(
      provider,
      blockNumber,
      effectiveChunkSize
    );

    if (!logSearchResult.supported) {
      const result: RpcHealthResult = {
        ...baseResult,
        status: "down",
        latencyMs,
        blockNumber,
        logSearchSupported: false,
        logSearchError: logSearchResult.error,
        error: `Log search failed: ${logSearchResult.error}`,
      };
      healthCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }

    const status = latencyMs > 3000 ? "degraded" : "healthy";

    const result: RpcHealthResult = {
      ...baseResult,
      status,
      latencyMs,
      blockNumber,
      logSearchSupported: true,
    };
    healthCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = getErrorMessage(error);

    const result: RpcHealthResult = {
      ...baseResult,
      status: "down",
      latencyMs,
      error: errorMessage,
    };
    // Don't cache failures - allow retry on next request
    return result;
  }
}

/**
 * Clear the health check cache (useful for manual refresh)
 */
export function clearHealthCache(): void {
  healthCache.clear();
}

/**
 * Test if the RPC supports log searches with the given chunk size
 */
async function testLogSearch(
  provider: ethers.providers.JsonRpcProvider,
  currentBlock: number,
  chunkSize: number
): Promise<{ supported: boolean; error?: string }> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Log search timeout")),
        LOG_SEARCH_TIMEOUT
      );
    });

    const fromBlock = Math.max(0, currentBlock - chunkSize);

    // Query for any logs in the block range (use a non-existent address to get empty results quickly)
    await Promise.race([
      provider.getLogs({
        fromBlock,
        toBlock: currentBlock,
        address: "0x0000000000000000000000000000000000000001",
      }),
      timeoutPromise,
    ]);

    return { supported: true };
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    // Check for common block range errors
    if (
      errorMessage.includes("block range") ||
      errorMessage.includes("exceed") ||
      errorMessage.includes("too large") ||
      errorMessage.includes("limit") ||
      errorMessage.includes("10000") ||
      errorMessage.includes("query returned more than")
    ) {
      return {
        supported: false,
        error: `Block range ${chunkSize.toLocaleString()} too large for this RPC`,
      };
    }

    if (errorMessage.includes("timeout")) {
      return {
        supported: false,
        error: "Log search timed out - block range may be too large",
      };
    }

    // Other errors might be transient, consider it supported
    return { supported: true };
  }
}

/**
 * Check health of all RPC endpoints in parallel
 */
export async function checkAllRpcHealth(
  customUrls?: {
    arb1?: string;
    nova?: string;
    l1?: string;
  },
  chunkSizes?: {
    arb1?: number;
    nova?: number;
    l1?: number;
  }
): Promise<RpcHealthResult[]> {
  const endpoints = DEFAULT_RPC_ENDPOINTS.map((endpoint) => ({
    endpoint,
    customUrl: customUrls?.[endpoint.id],
    chunkSize: chunkSizes?.[endpoint.id],
  }));

  const results = await Promise.all(
    endpoints.map(({ endpoint, customUrl, chunkSize }) =>
      checkRpcHealth(endpoint, customUrl, chunkSize)
    )
  );

  return results;
}

/**
 * Get a summary of RPC health status
 */
export function getRpcHealthSummary(results: RpcHealthResult[]): {
  allHealthy: boolean;
  requiredHealthy: boolean;
  healthyCount: number;
  totalCount: number;
} {
  const healthyResults = results.filter((r) => r.status === "healthy");
  const requiredEndpoints = DEFAULT_RPC_ENDPOINTS.filter((e) => e.required);
  const requiredHealthy = requiredEndpoints.every((endpoint) => {
    const result = results.find((r) => r.id === endpoint.id);
    return result?.status === "healthy" || result?.status === "degraded";
  });

  return {
    allHealthy: results.every(
      (r) => r.status === "healthy" || r.status === "degraded"
    ),
    requiredHealthy,
    healthyCount: healthyResults.length,
    totalCount: results.length,
  };
}
