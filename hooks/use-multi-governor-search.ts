"use client";

/**
 * Hook for searching proposals across multiple governors
 */

import { useEffect, useState } from "react";

import { debug } from "@/lib/debug";
import {
  calculateSearchRanges,
  parseProposals,
  refreshProposalStates,
  searchGovernor,
  type CacheHitInfo,
  type UseMultiGovernorSearchOptions,
  type UseMultiGovernorSearchResult,
} from "@/lib/governor-search";
import {
  getCachedProposals,
  getCacheSnapshotBlock,
  getCacheStartBlock,
  mergeProposals,
  needsStateRefresh,
  sortProposals,
} from "@/lib/proposal-cache";
import {
  subscribeToVoteUpdates,
  type VoteUpdate,
} from "@/lib/proposal-tracker-manager";
import { createRpcProvider } from "@/lib/rpc-utils";
import { ParsedProposal } from "@/types/proposal";
import {
  ARBITRUM_GOVERNORS,
  ARBITRUM_RPC_URL,
  BLOCKS_PER_DAY,
} from "@config/arbitrum-governance";

/** Default block range for chunked RPC queries */
const DEFAULT_BLOCK_RANGE = 10000000;

/**
 * Hook for searching proposals across Core and Treasury governors
 * @param options - Search options including days to search and RPC URL
 * @returns Proposals, progress, errors, and cache information
 */
export function useMultiGovernorSearch({
  daysToSearch,
  enabled,
  customRpcUrl,
  blockRange = DEFAULT_BLOCK_RANGE,
}: UseMultiGovernorSearchOptions): UseMultiGovernorSearchResult {
  const [progress, setProgress] = useState(0);
  const [proposals, setProposals] = useState<ParsedProposal[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [providerReady, setProviderReady] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<CacheHitInfo>();

  const rpcUrl = customRpcUrl || ARBITRUM_RPC_URL;

  // Initialize provider using cached factory
  useEffect(() => {
    setProviderReady(false);
    createRpcProvider(rpcUrl)
      .then(() => setProviderReady(true))
      .catch((err) => setError(err as Error));
  }, [rpcUrl]);

  // Search for proposals
  useEffect(() => {
    if (!enabled || !providerReady) return;

    const abortController = new AbortController();
    let cancelled = false;

    const search = async () => {
      setIsSearching(true);
      setError(null);
      setProgress(0);

      try {
        const provider = await createRpcProvider(rpcUrl);
        const currentBlock = await provider.getBlockNumber();

        // Calculate user's desired search range
        const blocksToSearch = BLOCKS_PER_DAY.arbitrum * daysToSearch;
        const userStartBlock = Math.max(currentBlock - blocksToSearch, 0);
        const userEndBlock = currentBlock;

        // Load cache metadata
        const [cacheSnapshotBlock, cacheStartBlock] = await Promise.all([
          getCacheSnapshotBlock(),
          getCacheStartBlock(),
        ]);

        // Determine what needs to be fetched from RPC
        const searchPlan = calculateSearchRanges(
          userStartBlock,
          userEndBlock,
          cacheSnapshotBlock,
          cacheStartBlock
        );

        debug.search("search plan: %s", searchPlan.rangeInfo);

        let cachedProposals: ParsedProposal[] = [];
        let rpcProposals: ParsedProposal[] = [];

        // Load all proposals from cache
        if (cacheSnapshotBlock && cacheStartBlock) {
          setProgress(5);
          const cached = await getCachedProposals();
          if (cached) {
            cachedProposals = cached;
            debug.search("loaded %d proposals from cache", cached.length);
          }
        }

        setProgress(10);
        if (cancelled || abortController.signal.aborted) return;

        // Fetch from RPC for any uncached ranges
        if (searchPlan.rpcRanges.length > 0) {
          const totalRanges =
            searchPlan.rpcRanges.length * ARBITRUM_GOVERNORS.length;
          let completedQueries = 0;

          const updateProgress = () => {
            if (cancelled) return;
            const searchProgress = 10 + (completedQueries / totalRanges) * 60;
            setProgress(searchProgress);
          };

          for (const range of searchPlan.rpcRanges) {
            if (abortController.signal.aborted) break;

            const searchPromises = ARBITRUM_GOVERNORS.map(async (governor) => {
              if (abortController.signal.aborted) return [];

              const rawProposals = await searchGovernor(
                provider,
                governor.address,
                range.start,
                range.end,
                blockRange,
                () => {}
              );

              completedQueries++;
              updateProgress();
              return rawProposals;
            });

            const results = await Promise.all(searchPromises);
            if (cancelled || abortController.signal.aborted) return;

            const rawProposals = results.flat();
            if (rawProposals.length > 0) {
              const parsed = await parseProposals(provider, rawProposals);
              rpcProposals.push(...parsed);
            }
          }
        }

        setProgress(70);
        if (cancelled || abortController.signal.aborted) return;

        // Merge cached and fresh proposals
        let allProposals =
          cachedProposals.length > 0
            ? mergeProposals(cachedProposals, rpcProposals)
            : rpcProposals;

        // Refresh state for pending/active cached proposals
        const proposalsToRefresh = cachedProposals.filter((p) =>
          needsStateRefresh(p.state)
        );
        if (proposalsToRefresh.length > 0) {
          setProgress(80);
          debug.search(
            "refreshing %d active proposals",
            proposalsToRefresh.length
          );
          const refreshed = await refreshProposalStates(
            provider,
            proposalsToRefresh
          );
          const refreshedMap = new Map(refreshed.map((p) => [p.id, p]));
          allProposals = allProposals.map((p) => refreshedMap.get(p.id) ?? p);
        }

        setProgress(90);
        if (cancelled || abortController.signal.aborted) return;

        // Sort: active first, then by startBlock descending
        setProposals(sortProposals(allProposals));
        setCacheInfo({
          loaded: cachedProposals.length > 0,
          snapshotBlock: cacheSnapshotBlock ?? 0,
          cacheStartBlock: cacheStartBlock ?? 0,
          cachedCount: cachedProposals.length,
          freshCount: rpcProposals.length,
          cacheUsed: cachedProposals.length > 0,
          rangeInfo: searchPlan.rangeInfo,
        });
        setProgress(100);
        setIsSearching(false);
      } catch (err) {
        if (!cancelled && !abortController.signal.aborted) {
          setError(err as Error);
          setIsSearching(false);
        }
      }
    };

    search();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [enabled, providerReady, daysToSearch, rpcUrl, blockRange]);

  // Subscribe to vote updates and update proposals when votes change
  useEffect(() => {
    return subscribeToVoteUpdates((update: VoteUpdate) => {
      setProposals((prev) =>
        prev.map((p) => {
          if (
            p.id === update.proposalId &&
            p.contractAddress.toLowerCase() ===
              update.governorAddress.toLowerCase()
          ) {
            debug.search(
              "updating votes for proposal %s: for=%s, against=%s",
              p.id,
              update.forVotes,
              update.againstVotes
            );
            return {
              ...p,
              votes: {
                forVotes: update.forVotes,
                againstVotes: update.againstVotes,
                abstainVotes: update.abstainVotes,
                quorum: p.votes?.quorum || "0",
              },
            };
          }
          return p;
        })
      );
    });
  }, []);

  return {
    proposals,
    progress,
    error,
    isSearching,
    isProviderReady: providerReady,
    cacheInfo,
  };
}
