"use client";

import { ethers } from "ethers";
import { useCallback, useEffect, useRef, useState } from "react";

import { addressesEqual } from "@/lib/address-utils";
import { getDelegateCacheStats, loadDelegateCache } from "@/lib/delegate-cache";
import type {
  DelegateCache,
  DelegateCacheStats,
  DelegateInfo,
} from "@/types/delegate";
import { ARBITRUM_RPC_URL, ARB_TOKEN } from "@config/arbitrum-governance";
import ERC20Votes_ABI from "@data/ERC20Votes_ABI.json";

export interface UseDelegateSearchOptions {
  enabled: boolean;
  customRpcUrl?: string;
  minVotingPower?: string;
  addressFilter?: string;
}

export interface UseDelegateSearchResult {
  delegates: DelegateInfo[];
  totalVotingPower: string;
  totalSupply: string;
  error: Error | null;
  isLoading: boolean;
  cacheStats?: DelegateCacheStats;
  snapshotBlock: number;
  refreshVisibleDelegates: (addresses: string[]) => Promise<void>;
  isRefreshingVisible: boolean;
}

function filterDelegates(
  delegates: DelegateInfo[],
  options: {
    minVotingPower?: string;
    addressFilter?: string;
  }
): DelegateInfo[] {
  let filtered = delegates;

  if (options.minVotingPower) {
    const minPower = BigInt(options.minVotingPower);
    filtered = filtered.filter((d) => BigInt(d.votingPower) >= minPower);
  }

  if (options.addressFilter && options.addressFilter.trim()) {
    const searchTerm = options.addressFilter.toLowerCase().trim();
    filtered = filtered.filter((d) =>
      d.address.toLowerCase().includes(searchTerm)
    );
  }

  return filtered;
}

export function useDelegateSearch({
  enabled,
  customRpcUrl,
  minVotingPower,
  addressFilter,
}: UseDelegateSearchOptions): UseDelegateSearchResult {
  const [delegates, setDelegates] = useState<DelegateInfo[]>([]);
  const [totalVotingPower, setTotalVotingPower] = useState<string>("0");
  const [totalSupply, setTotalSupply] = useState<string>("0");
  const [snapshotBlock, setSnapshotBlock] = useState<number>(0);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingVisible, setIsRefreshingVisible] = useState(false);
  const [cacheStats, setCacheStats] = useState<DelegateCacheStats>();
  const [cache, setCache] = useState<DelegateCache | null>(null);

  const refreshedAddresses = useRef<Set<string>>(new Set());

  const rpcUrl = customRpcUrl || ARBITRUM_RPC_URL;

  // Load cache on mount - filters are applied in a separate effect
  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    loadDelegateCache()
      .then((loaded) => {
        if (cancelled) return;

        if (loaded) {
          setCache(loaded);
          setTotalVotingPower(loaded.totalVotingPower);
          setTotalSupply(loaded.totalSupply);
          setSnapshotBlock(loaded.snapshotBlock);
          setCacheStats(getDelegateCacheStats(loaded));
          console.debug(
            `[useDelegateSearch] Cache loaded: ${loaded.delegates.length} delegates (block ${loaded.snapshotBlock})`
          );
        }
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[useDelegateSearch] Failed to load cache:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Apply filters when they change
  useEffect(() => {
    if (cache) {
      const filtered = filterDelegates(cache.delegates, {
        minVotingPower,
        addressFilter,
      });
      setDelegates(filtered);
    }
  }, [minVotingPower, addressFilter, cache]);

  const refreshVisibleDelegates = useCallback(
    async (addresses: string[]) => {
      if (!enabled || addresses.length === 0) return;

      const toRefresh = addresses.filter(
        (addr) => !refreshedAddresses.current.has(addr.toLowerCase())
      );

      if (toRefresh.length === 0) return;

      setIsRefreshingVisible(true);

      try {
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        await provider.ready;

        const contract = new ethers.Contract(
          ARB_TOKEN.address,
          ERC20Votes_ABI,
          provider
        );

        const refreshPromises = toRefresh.map(async (address) => {
          try {
            const votes = await contract.getCurrentVotes(address);
            refreshedAddresses.current.add(address.toLowerCase());
            return { address, votingPower: votes.toString() };
          } catch (err) {
            console.warn(`Failed to refresh voting power for ${address}:`, err);
            return null;
          }
        });

        const results = await Promise.all(refreshPromises);
        const successfulResults = results.filter(
          (r): r is { address: string; votingPower: string } => r !== null
        );

        if (successfulResults.length > 0 && cache) {
          const updatedDelegates = cache.delegates.map((d) => {
            const refreshed = successfulResults.find((r) =>
              addressesEqual(r.address, d.address)
            );
            return refreshed ? { ...d, votingPower: refreshed.votingPower } : d;
          });

          updatedDelegates.sort((a, b) => {
            const diff = BigInt(b.votingPower) - BigInt(a.votingPower);
            return diff > BigInt(0) ? 1 : diff < BigInt(0) ? -1 : 0;
          });

          const newCache = { ...cache, delegates: updatedDelegates };
          setCache(newCache);

          const filtered = filterDelegates(updatedDelegates, {
            minVotingPower,
            addressFilter,
          });
          setDelegates(filtered);

          const newTotalVotingPower = updatedDelegates
            .reduce((sum, d) => sum + BigInt(d.votingPower), BigInt(0))
            .toString();
          setTotalVotingPower(newTotalVotingPower);
        }
      } catch (err) {
        console.error(
          "[useDelegateSearch] Error refreshing visible delegates:",
          err
        );
      } finally {
        setIsRefreshingVisible(false);
      }
    },
    [enabled, rpcUrl, cache, minVotingPower, addressFilter]
  );

  return {
    delegates,
    totalVotingPower,
    totalSupply,
    error,
    isLoading,
    cacheStats,
    snapshotBlock,
    refreshVisibleDelegates,
    isRefreshingVisible,
  };
}
