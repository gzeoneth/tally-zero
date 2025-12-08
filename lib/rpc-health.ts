import { ethers } from "ethers";

import {
  ARBITRUM_NOVA_RPC_URL,
  ARBITRUM_RPC_URL,
  ETHEREUM_RPC_URL,
} from "@/config/arbitrum-governance";

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

/**
 * Test connectivity to a single RPC endpoint
 */
export async function checkRpcHealth(
  endpoint: RpcEndpoint,
  customUrl?: string
): Promise<RpcHealthResult> {
  const url = customUrl || endpoint.url;
  const startTime = Date.now();

  const baseResult: RpcHealthResult = {
    id: endpoint.id,
    name: endpoint.name,
    url,
    status: "checking",
  };

  // Skip if URL is empty
  if (!url || url.trim() === "") {
    return {
      ...baseResult,
      status: "down",
      error: "No RPC URL configured",
    };
  }

  try {
    const provider = new ethers.providers.JsonRpcProvider(url);

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Request timeout")),
        HEALTH_CHECK_TIMEOUT
      );
    });

    // Race between the actual request and timeout
    const blockNumber = await Promise.race([
      provider.getBlockNumber(),
      timeoutPromise,
    ]);

    const latencyMs = Date.now() - startTime;

    // Consider > 3 seconds as degraded
    const status = latencyMs > 3000 ? "degraded" : "healthy";

    return {
      ...baseResult,
      status,
      latencyMs,
      blockNumber,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    return {
      ...baseResult,
      status: "down",
      latencyMs,
      error: errorMessage,
    };
  }
}

/**
 * Check health of all RPC endpoints in parallel
 */
export async function checkAllRpcHealth(customUrls?: {
  arb1?: string;
  nova?: string;
  l1?: string;
}): Promise<RpcHealthResult[]> {
  const endpoints = DEFAULT_RPC_ENDPOINTS.map((endpoint) => ({
    endpoint,
    customUrl: customUrls?.[endpoint.id],
  }));

  const results = await Promise.all(
    endpoints.map(({ endpoint, customUrl }) =>
      checkRpcHealth(endpoint, customUrl)
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
