"use client";

import { useCallback, useEffect, useState } from "react";

import {
  checkAllRpcHealth,
  getRpcHealthSummary,
  type RpcHealthResult,
} from "@/lib/rpc-health";

export interface UseRpcHealthOptions {
  customUrls?: {
    arb1?: string;
    nova?: string;
    l1?: string;
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
  autoCheck = true,
}: UseRpcHealthOptions = {}): UseRpcHealthResult {
  const [results, setResults] = useState<RpcHealthResult[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  const checkHealth = useCallback(async () => {
    setIsChecking(true);

    // Set initial "checking" state for all endpoints
    setResults([
      { id: "arb1", name: "Arbitrum One", url: "", status: "checking" },
      { id: "nova", name: "Arbitrum Nova", url: "", status: "checking" },
      { id: "l1", name: "Ethereum", url: "", status: "checking" },
    ]);

    try {
      const healthResults = await checkAllRpcHealth(customUrls);
      setResults(healthResults);
      setLastCheckedAt(new Date());
    } catch (error) {
      console.error("Failed to check RPC health:", error);
    } finally {
      setIsChecking(false);
    }
  }, [customUrls]);

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
