"use client";

import { ethers } from "ethers";
import { useCallback, useEffect, useState } from "react";

import { ARBITRUM_RPC_URL, ARB_TOKEN } from "@/config/arbitrum-governance";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { getDelegateLabel, loadDelegateCache } from "@/lib/delegate-cache";

// Minimal ABI for ERC20Votes with OpenZeppelin standard methods
const ERC20_VOTES_ABI = [
  "function getVotes(address account) view returns (uint256)",
  "function delegates(address account) view returns (address)",
];

export interface DelegateLookupResult {
  address: string;
  votingPower: string;
  delegatedTo: string;
  isSelfDelegated: boolean;
  label?: string;
  cacheRank?: number;
  cacheVotingPower?: string;
}

export interface UseDelegateLookupOptions {
  address: string;
  enabled?: boolean;
  customRpcUrl?: string;
}

export interface UseDelegateLookupReturn {
  result: DelegateLookupResult | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDelegateLookup({
  address,
  enabled = true,
  customRpcUrl,
}: UseDelegateLookupOptions): UseDelegateLookupReturn {
  const [storedL2Rpc, , l2RpcHydrated] = useLocalStorage(
    STORAGE_KEYS.L2_RPC,
    ""
  );

  const [result, setResult] = useState<DelegateLookupResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rpcUrl = customRpcUrl || storedL2Rpc || ARBITRUM_RPC_URL;

  const fetchDelegateInfo = useCallback(async () => {
    if (!address || !enabled) return;

    // Validate address format
    if (!ethers.utils.isAddress(address)) {
      setError("Invalid Ethereum address");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      await provider.ready;

      const contract = new ethers.Contract(
        ARB_TOKEN.address,
        ERC20_VOTES_ABI,
        provider
      );

      // Fetch voting power and delegate in parallel
      const [votingPower, delegatedTo] = await Promise.all([
        contract.getVotes(address),
        contract.delegates(address),
      ]);

      // Check if address is in the delegate cache
      let cacheRank: number | undefined;
      let cacheVotingPower: string | undefined;
      const label = getDelegateLabel(address);

      try {
        const cache = await loadDelegateCache();
        if (cache) {
          const index = cache.delegates.findIndex(
            (d) => d.address.toLowerCase() === address.toLowerCase()
          );
          if (index !== -1) {
            cacheRank = index + 1;
            cacheVotingPower = cache.delegates[index].votingPower;
          }
        }
      } catch (cacheErr) {
        console.warn("Failed to check delegate cache:", cacheErr);
      }

      const normalizedAddress = address.toLowerCase();
      const normalizedDelegate = delegatedTo.toLowerCase();

      setResult({
        address: ethers.utils.getAddress(address),
        votingPower: votingPower.toString(),
        delegatedTo: ethers.utils.getAddress(delegatedTo),
        isSelfDelegated: normalizedAddress === normalizedDelegate,
        label,
        cacheRank,
        cacheVotingPower,
      });
    } catch (err) {
      console.error("[useDelegateLookup] Error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch delegate info"
      );
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }, [address, enabled, rpcUrl]);

  useEffect(() => {
    if (!l2RpcHydrated) return;
    if (address && enabled) {
      fetchDelegateInfo();
    } else {
      setResult(null);
      setError(null);
    }
  }, [l2RpcHydrated, address, enabled, fetchDelegateInfo]);

  return {
    result,
    isLoading,
    error,
    refetch: fetchDelegateInfo,
  };
}
