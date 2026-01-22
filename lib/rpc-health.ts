/**
 * RPC endpoint health monitoring
 *
 * Provides functions to check RPC endpoint health, including
 * connectivity, latency, and log search capability verification.
 */

import { ethers } from "ethers";

import {
  ARBITRUM_NOVA_RPC_URL,
  ARBITRUM_RPC_URL,
  DEFAULT_CHUNKING_CONFIG,
  ETHEREUM_RPC_URL,
} from "@/config/arbitrum-governance";
import { buildLookupMap } from "@/lib/collection-utils";
import { MS_PER_MINUTE, MS_PER_SECOND } from "@/lib/date-utils";
import { withTimeout } from "@/lib/delay-utils";
import { getErrorMessage } from "@/lib/error-utils";

/** RPC endpoint identifier */
export type RpcId = "arb1" | "nova" | "l1";

/** RPC endpoint configuration */
export interface RpcEndpoint {
  /** Unique endpoint identifier */
  id: RpcId;
  /** Human-readable endpoint name */
  name: string;
  /** RPC URL */
  url: string;
  /** Chain ID for the network */
  chainId: number;
  /** Whether this endpoint is required for operation */
  required: boolean;
}

/** Result of an RPC health check */
export interface RpcHealthResult {
  /** Endpoint identifier */
  id: RpcId;
  /** Human-readable endpoint name */
  name: string;
  /** RPC URL that was checked */
  url: string;
  /** Health status */
  status: "checking" | "healthy" | "degraded" | "down";
  /** Response latency in milliseconds */
  latencyMs?: number;
  /** Current block number */
  blockNumber?: number;
  /** Error message if check failed */
  error?: string;
  /** Whether log search queries are supported */
  logSearchSupported?: boolean;
  /** Error from log search test */
  logSearchError?: string;
  /** Whether archive data queries are supported */
  archiveDataSupported?: boolean;
  /** Error from archive data test */
  archiveDataError?: string;
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

const HEALTH_CHECK_TIMEOUT = 5 * MS_PER_SECOND; // 5 seconds
const LOG_SEARCH_TIMEOUT = 10 * MS_PER_SECOND; // 10 seconds for log search
const ARCHIVE_DATA_TIMEOUT = 10 * MS_PER_SECOND; // 10 seconds for archive data test
const HEALTH_CACHE_TTL = MS_PER_MINUTE; // 60 seconds cache for health results
const FAILURE_CACHE_BASE_TTL = 5 * MS_PER_SECOND; // 5 seconds base TTL for failures
const FAILURE_CACHE_MAX_TTL = 2 * MS_PER_MINUTE; // 2 minutes max TTL for failures

/**
 * Transaction hashes from ~1 year ago for archive data testing.
 * Used to verify if the RPC endpoint supports historical data queries.
 *
 * Note: Each network requires its own transaction hash from that specific network.
 * All hashes sourced from the timelock operations cache:
 * - arb1: Arbitrum One transaction from August 2023
 * - nova: Arbitrum Nova transaction from September 2023
 * - l1: Ethereum mainnet transaction from July 2023
 */
const ARCHIVE_TEST_TX_HASHES: Record<RpcId, string> = {
  arb1: "0xd44606396ab621bb8e389b04cc8d53d8765a836030f9cc553e7efb59af85fc87", // Arbitrum One, August 2023
  nova: "0x5d9320f2d00324f3cef70f6d9bf54b0a5fe1b0b0ebae25f0d459596c2c739cdd", // Arbitrum Nova, September 2023
  l1: "0x9911ad5fdb37d003becbb74450defdc88f47ebc96a5ab2453ced7e2b3d29a9e5", // Ethereum L1, July 2023
};

// Cache for health check results to avoid redundant RPC calls
interface HealthCacheEntry {
  result: RpcHealthResult;
  timestamp: number;
  failureCount?: number;
}
const healthCache = new Map<string, HealthCacheEntry>();

/**
 * Calculate TTL for failed health checks using exponential backoff
 *
 * @param failureCount - Number of consecutive failures
 * @returns TTL in milliseconds (capped at FAILURE_CACHE_MAX_TTL)
 */
function getFailureTtl(failureCount: number): number {
  const ttl = FAILURE_CACHE_BASE_TTL * Math.pow(2, failureCount - 1);
  return Math.min(ttl, FAILURE_CACHE_MAX_TTL);
}

/**
 * Generate a cache key for an RPC health check
 *
 * @param endpointId - The RPC endpoint identifier
 * @param customUrl - Optional custom URL override
 * @param chunkSize - Optional chunk size for log search test
 * @returns The cache key string
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
 *
 * @param endpoint - The RPC endpoint configuration
 * @param customUrl - Optional custom URL override
 * @param chunkSize - Optional chunk size for log search test
 * @param skipCache - Whether to skip the cache and force a fresh check
 * @returns Health check result with status, latency, log search support, and archive data support
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
    if (cached) {
      const ttl =
        cached.result.status === "down"
          ? getFailureTtl(cached.failureCount ?? 1)
          : HEALTH_CACHE_TTL;
      if (Date.now() - cached.timestamp < ttl) {
        return cached.result;
      }
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
    const provider = new ethers.providers.StaticJsonRpcProvider(url);

    const blockNumber = await withTimeout(
      provider.getBlockNumber(),
      HEALTH_CHECK_TIMEOUT,
      "Request timeout"
    );

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

    // Test archive data support (only for L1 endpoint for now, but can be extended)
    const archiveDataResult = await testArchiveData(provider, endpoint.id);

    // Determine overall status based on latency and capability checks
    // Archive data is not required for basic health, but we flag it as degraded if not supported
    let status: "healthy" | "degraded" =
      latencyMs > 3000 ? "degraded" : "healthy";

    // If archive data is not supported, mark as degraded (not down, since it's still functional)
    if (!archiveDataResult.supported) {
      status = "degraded";
    }

    const result: RpcHealthResult = {
      ...baseResult,
      status,
      latencyMs,
      blockNumber,
      logSearchSupported: true,
      archiveDataSupported: archiveDataResult.supported,
      archiveDataError: archiveDataResult.error,
    };
    // Reset failure count on success
    healthCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      failureCount: 0,
    });
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

    // Cache failures with exponential backoff to prevent rapid retries
    const cached = healthCache.get(cacheKey);
    const failureCount = (cached?.failureCount ?? 0) + 1;
    healthCache.set(cacheKey, { result, timestamp: Date.now(), failureCount });

    return result;
  }
}

/**
 * Test if the RPC supports log searches with the given chunk size
 *
 * @param provider - The ethers JSON-RPC provider
 * @param currentBlock - The current block number
 * @param chunkSize - The chunk size to test
 * @returns Object indicating if log search is supported and any error
 */
async function testLogSearch(
  provider: ethers.providers.JsonRpcProvider,
  currentBlock: number,
  chunkSize: number
): Promise<{ supported: boolean; error?: string }> {
  try {
    const fromBlock = Math.max(0, currentBlock - chunkSize);

    await withTimeout(
      provider.getLogs({
        fromBlock,
        toBlock: currentBlock,
        address: "0x0000000000000000000000000000000000000001",
      }),
      LOG_SEARCH_TIMEOUT,
      "Log search timeout"
    );

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
 * Test if the RPC supports archive data by querying an old transaction receipt
 *
 * @param provider - The ethers JSON-RPC provider
 * @param endpointId - The endpoint identifier to get the test transaction hash
 * @returns Object indicating if archive data is supported and any error
 */
async function testArchiveData(
  provider: ethers.providers.JsonRpcProvider,
  endpointId: RpcId
): Promise<{ supported: boolean; error?: string }> {
  const txHash = ARCHIVE_TEST_TX_HASHES[endpointId];

  try {
    const receipt = await withTimeout(
      provider.getTransactionReceipt(txHash),
      ARCHIVE_DATA_TIMEOUT,
      "Archive data test timeout"
    );

    // If we get null, the RPC doesn't have archive data
    if (receipt === null) {
      return {
        supported: false,
        error: "RPC does not support archive data - old receipt not found",
      };
    }

    return { supported: true };
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    // Check for common archive data errors
    if (
      errorMessage.includes("missing trie node") ||
      errorMessage.includes("header not found") ||
      errorMessage.includes("unknown block") ||
      errorMessage.includes("block not found") ||
      errorMessage.includes("does not support archive") ||
      errorMessage.includes("archive node required")
    ) {
      return {
        supported: false,
        error: "RPC does not support archive data",
      };
    }

    if (errorMessage.includes("timeout")) {
      return {
        supported: false,
        error: "Archive data test timed out",
      };
    }

    // Other errors might be transient or unrelated to archive support
    // Be conservative and report as not supported with the actual error
    return {
      supported: false,
      error: `Archive data test failed: ${errorMessage}`,
    };
  }
}

/**
 * Check health of all RPC endpoints in parallel
 *
 * @param customUrls - Optional custom URLs for each endpoint
 * @param chunkSizes - Optional chunk sizes for log search tests
 * @returns Array of health check results for all endpoints
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
 *
 * @param results - Array of health check results
 * @returns Summary with counts and health status flags
 */
export function getRpcHealthSummary(results: RpcHealthResult[]): {
  allHealthy: boolean;
  requiredHealthy: boolean;
  healthyCount: number;
  totalCount: number;
} {
  const healthyResults = results.filter((r) => r.status === "healthy");
  const requiredEndpoints = DEFAULT_RPC_ENDPOINTS.filter((e) => e.required);

  // Build Map for O(1) lookups instead of O(n) find per endpoint
  const resultsById = buildLookupMap(results, (r) => r.id);

  const requiredHealthy = requiredEndpoints.every((endpoint) => {
    const result = resultsById.get(endpoint.id);
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
