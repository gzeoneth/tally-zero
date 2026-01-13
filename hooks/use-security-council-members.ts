"use client";

import { SC_CONTRACTS } from "@/config/security-council";
import { debug } from "@/lib/debug";
import { createRpcProvider } from "@/lib/rpc-utils";
import { ARBITRUM_RPC_URL } from "@config/arbitrum-governance";
import { ethers } from "ethers";
import { useCallback, useEffect, useState } from "react";
import { useRpcSettings } from "./use-rpc-settings";

const SECURITY_COUNCIL_MANAGER_ABI = [
  "function getFirstCohort() external view returns (address[])",
  "function getSecondCohort() external view returns (address[])",
];

export interface SecurityCouncilMembers {
  firstCohort: string[];
  secondCohort: string[];
}

export interface UseSecurityCouncilMembersResult {
  members: SecurityCouncilMembers | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useSecurityCouncilMembers(): UseSecurityCouncilMembersResult {
  const { l2Rpc, isHydrated } = useRpcSettings();
  const [members, setMembers] = useState<SecurityCouncilMembers | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const l2Url = l2Rpc || ARBITRUM_RPC_URL;

  const fetchMembers = useCallback(async () => {
    if (!isHydrated) return;

    setIsLoading(true);
    setError(null);

    try {
      const provider = await createRpcProvider(l2Url);
      const manager = new ethers.Contract(
        SC_CONTRACTS.SECURITY_COUNCIL_MANAGER,
        SECURITY_COUNCIL_MANAGER_ABI,
        provider
      );

      const [firstCohort, secondCohort] = await Promise.all([
        manager.getFirstCohort() as Promise<string[]>,
        manager.getSecondCohort() as Promise<string[]>,
      ]);

      debug.app(
        "Fetched SC members: first=%d, second=%d",
        firstCohort.length,
        secondCohort.length
      );

      setMembers({ firstCohort, secondCohort });
    } catch (err) {
      debug.app("Failed to fetch SC members: %O", err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [l2Url, isHydrated]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  return {
    members,
    isLoading,
    error,
    refresh: fetchMembers,
  };
}
