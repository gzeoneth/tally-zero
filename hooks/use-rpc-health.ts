"use client";

import { useCallback, useEffect, useState } from "react";

import {
  checkAllRpcHealth,
  DEFAULT_RPC_ENDPOINTS,
  getRpcHealthSummary,
  type RpcHealthResult,
} from "@/lib/rpc-health";

export interface UseRpcHealthOptions {
  customUrls?: {
    arb1?: string;
    nova?: string;
    l1?: string;
  };
  chunkSizes?: {
    arb1?: number;
    nova?: number;
    l1?: number;
  };
  autoCheck?: boolean;
}

export interface UseRpcHealthResult {
  results: RpcHealthResult[];
  isChecking: boolean;
  lastCheckedAt: Date | null;
  summary: {
    allHealthy: boolean;
    requiredHealthy: boolean;
    healthyCount: number;
    totalCount: number;
  } | null;
  checkHealth: () => Promise<void>;
}

export function useRpcHealth({
  customUrls,
  chunkSizes,
  autoCheck = true,
}: UseRpcHealthOptions = {}): UseRpcHealthResult {
  const [results, setResults] = useState<RpcHealthResult[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  const checkHealth = useCallback(async () => {
    setIsChecking(true);

    setResults(
      DEFAULT_RPC_ENDPOINTS.map((endpoint) => ({
        id: endpoint.id,
        name: endpoint.name,
        url: "",
        status: "checking" as const,
      }))
    );

    try {
      const healthResults = await checkAllRpcHealth(customUrls, chunkSizes);
      setResults(healthResults);
      setLastCheckedAt(new Date());
    } catch (error) {
      console.error("Failed to check RPC health:", error);
    } finally {
      setIsChecking(false);
    }
  }, [customUrls, chunkSizes]);

  // Auto-check on mount
  useEffect(() => {
    if (autoCheck) {
      checkHealth();
    }
  }, [autoCheck, checkHealth]);

  const summary =
    results.length > 0 && !isChecking ? getRpcHealthSummary(results) : null;

  return {
    results,
    isChecking,
    lastCheckedAt,
    summary,
    checkHealth,
  };
}
