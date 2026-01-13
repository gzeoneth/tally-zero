"use client";

/**
 * Hook for searching proposals across multiple governors
 *
 * Uses gov-tracker bundled cache for instant display of historical proposals,
 * then fetches new proposals from RPC.
 */

import { useEffect, useState } from "react";

import { addressesEqual } from "@/lib/address-utils";
import {
  getBundledCacheMetadata,
  getBundledCacheProposals,
} from "@/lib/bundled-cache-loader";
import { debug } from "@/lib/debug";
import {
  parseProposals,
  refreshProposalStates,
  searchGovernor,
  type CacheHitInfo,
  type UseMultiGovernorSearchOptions,
  type UseMultiGovernorSearchResult,
} from "@/lib/governor-search";
import {
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
    const { signal } = abortController;

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

        // Load proposals from bundled cache
        setProgress(5);
        const [cachedProposals, cacheMetadata] = await Promise.all([
          getBundledCacheProposals(),
          getBundledCacheMetadata(),
        ]);

        const cacheSnapshotBlock = cacheMetadata?.snapshotBlock ?? 0;
        debug.search(
          "Loaded %d proposals from bundled cache (snapshot block: %d)",
          cachedProposals.length,
          cacheSnapshotBlock
        );

        setProgress(10);
        if (signal.aborted) return;

        // Determine what blocks need to be fetched from RPC
        // If we have cached proposals, only fetch from after the cache snapshot
        const rpcStartBlock =
          cacheSnapshotBlock > 0
            ? Math.max(userStartBlock, cacheSnapshotBlock + 1)
            : userStartBlock;

        let rpcProposals: ParsedProposal[] = [];

        // Only fetch from RPC if there's a gap to fill
        if (rpcStartBlock <= userEndBlock) {
          const rangeInfo = `Searching blocks ${rpcStartBlock.toLocaleString()}-${userEndBlock.toLocaleString()}`;
          debug.search("RPC search: %s", rangeInfo);

          const totalGovernors = ARBITRUM_GOVERNORS.length;
          let completedQueries = 0;

          const updateProgress = () => {
            if (signal.aborted) return;
            const searchProgress =
              10 + (completedQueries / totalGovernors) * 60;
            setProgress(searchProgress);
          };

          const searchPromises = ARBITRUM_GOVERNORS.map(async (governor) => {
            if (signal.aborted) return [];

            const rawProposals = await searchGovernor(
              provider,
              governor.address,
              rpcStartBlock,
              userEndBlock,
              blockRange,
              () => {}
            );

            completedQueries++;
            updateProgress();
            return rawProposals;
          });

          const results = await Promise.all(searchPromises);
          if (signal.aborted) return;

          const rawProposals = results.flat();
          if (rawProposals.length > 0) {
            rpcProposals = await parseProposals(provider, rawProposals);
          }
        }

        setProgress(70);
        if (signal.aborted) return;

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
            "Refreshing %d active proposals",
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
        if (signal.aborted) return;

        // Sort: active first, then by startBlock descending
        setProposals(sortProposals(allProposals));
        setCacheInfo({
          loaded: cachedProposals.length > 0,
          snapshotBlock: cacheSnapshotBlock,
          cachedCount: cachedProposals.length,
          freshCount: rpcProposals.length,
          cacheUsed: cachedProposals.length > 0,
          rangeInfo:
            rpcStartBlock <= userEndBlock
              ? `Loaded ${cachedProposals.length} from cache, fetched ${rpcProposals.length} new proposals`
              : `Loaded ${cachedProposals.length} proposals from bundled cache`,
        });
        setProgress(100);
        setIsSearching(false);
      } catch (err) {
        if (!signal.aborted) {
          setError(err as Error);
          setIsSearching(false);
        }
      }
    };

    search();

    return () => {
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
            addressesEqual(p.contractAddress, update.governorAddress)
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
