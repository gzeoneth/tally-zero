"use client";

import { ethers } from "ethers";
import { useCallback, useEffect, useState } from "react";

import {
  loadProposalCache,
  mergeProposals,
  needsStateRefresh,
  sortProposals,
  type ProposalCache,
} from "@/lib/proposal-cache";
import {
  subscribeToVoteUpdates,
  type VoteUpdate,
} from "@/lib/proposal-tracker-manager";
import { batchQueryWithRateLimit } from "@/lib/rpc-utils";
import { ParsedProposal, Proposal } from "@/types/proposal";
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_GOVERNORS,
  ARBITRUM_RPC_URL,
  BLOCKS_PER_DAY,
} from "@config/arbitrum-governance";
import { ProposalState } from "@config/initial-state";
import OZGovernor_ABI from "@data/OzGovernor_ABI.json";

interface UseMultiGovernorSearchOptions {
  daysToSearch: number;
  enabled: boolean;
  customRpcUrl?: string;
  blockRange?: number;
  skipCache?: boolean;
}

interface CacheHitInfo {
  loaded: boolean;
  snapshotBlock: number;
  cacheStartBlock: number;
  cachedCount: number;
  freshCount: number;
  cacheUsed: boolean;
  rangeInfo?: string;
}

interface UseMultiGovernorSearchResult {
  proposals: ParsedProposal[];
  progress: number;
  error: Error | null;
  isSearching: boolean;
  isProviderReady: boolean;
  cacheInfo?: CacheHitInfo;
}

const DEFAULT_BLOCK_RANGE = 10000000;

async function searchGovernor(
  provider: ethers.providers.Provider,
  contractAddress: string,
  startBlock: number,
  endBlock: number,
  blockRange: number,
  onProgress: (progress: number) => void
): Promise<Proposal[]> {
  const contract = new ethers.Contract(
    contractAddress,
    OZGovernor_ABI,
    provider
  );

  const proposalCreatedFilter = contract.filters.ProposalCreated();
  const queries: (() => Promise<ethers.Event[]>)[] = [];
  const totalBlocks = endBlock - startBlock;
  let processedBlocks = 0;

  for (
    let fromBlock = startBlock;
    fromBlock <= endBlock;
    fromBlock += blockRange
  ) {
    const toBlock = Math.min(fromBlock + blockRange - 1, endBlock);
    const queryFromBlock = fromBlock;
    const queryToBlock = toBlock;

    queries.push(async () => {
      try {
        const events = await contract.queryFilter(
          proposalCreatedFilter,
          queryFromBlock,
          queryToBlock
        );
        processedBlocks += queryToBlock - queryFromBlock;
        onProgress(Math.min((processedBlocks / totalBlocks) * 100, 100));
        return events;
      } catch (error) {
        console.warn(
          `[searchGovernor] Query failed for block range ${queryFromBlock}-${queryToBlock}:`,
          error
        );
        return [];
      }
    });
  }

  // If no blocks to search, return empty
  if (queries.length === 0) {
    return [];
  }

  const allEvents = await batchQueryWithRateLimit(queries, 3, 1000);
  const proposals: Proposal[] = [];

  for (const events of allEvents) {
    for (const event of events) {
      const args = event.args!;
      // Destructure event args to avoid Array.prototype.values collision
      const {
        proposalId,
        proposer,
        targets,
        signatures,
        calldatas,
        startBlock: propStartBlock,
        endBlock: propEndBlock,
        description,
      } = args;
      const proposalValues = args[3] as ethers.BigNumber[];

      proposals.push({
        id: proposalId.toString(),
        contractAddress: contractAddress,
        proposer,
        targets,
        values: Array.isArray(proposalValues)
          ? proposalValues.map((v) => v.toString())
          : [],
        signatures,
        calldatas,
        startBlock: propStartBlock.toString(),
        endBlock: propEndBlock.toString(),
        description,
        state: 0,
        creationTxHash: event.transactionHash,
      } as Proposal);
    }
  }

  return proposals;
}

async function searchGovernorByDays(
  provider: ethers.providers.Provider,
  contractAddress: string,
  daysToSearch: number,
  blockRange: number,
  onProgress: (progress: number) => void
): Promise<Proposal[]> {
  const currentBlock = await provider.getBlockNumber();
  const blocksToSearch = BLOCKS_PER_DAY.arbitrum * daysToSearch;
  const startBlock = Math.max(currentBlock - blocksToSearch, 0);

  return searchGovernor(
    provider,
    contractAddress,
    startBlock,
    currentBlock,
    blockRange,
    onProgress
  );
}

async function parseProposals(
  provider: ethers.providers.Provider,
  proposals: Proposal[]
): Promise<ParsedProposal[]> {
  const parsed: ParsedProposal[] = [];

  for (const proposal of proposals) {
    try {
      const contract = new ethers.Contract(
        proposal.contractAddress,
        OZGovernor_ABI,
        provider
      );

      const [proposalState, votes] = await Promise.all([
        contract.state(proposal.id),
        contract.proposalVotes(proposal.id),
      ]);

      let quorum;
      if (proposalState !== 0) {
        try {
          quorum = await contract.quorum(proposal.startBlock);
        } catch (e) {
          // Quorum fetch can fail for some states
          console.debug("[useMultiGovernorSearch] Failed to fetch quorum:", e);
        }
      }

      const governor = ARBITRUM_GOVERNORS.find(
        (g) =>
          g.address.toLowerCase() === proposal.contractAddress.toLowerCase()
      );

      parsed.push({
        ...proposal,
        networkId: String(ARBITRUM_CHAIN_ID),
        state: (ProposalState[proposalState] as string)?.toLowerCase(),
        governorName: governor?.name || "Unknown",
        creationTxHash: proposal.creationTxHash,
        votes: votes
          ? {
              againstVotes: votes.againstVotes.toString(),
              forVotes: votes.forVotes.toString(),
              abstainVotes: votes.abstainVotes.toString(),
              quorum: quorum?.toString(),
            }
          : undefined,
      } as ParsedProposal);
    } catch (e) {
      // Skip proposals that fail to parse
      console.debug("[useMultiGovernorSearch] Failed to parse proposal:", e);
    }
  }

  return parsed;
}

async function refreshProposalStates(
  provider: ethers.providers.Provider,
  proposals: ParsedProposal[]
): Promise<ParsedProposal[]> {
  const refreshed: ParsedProposal[] = [];

  for (const proposal of proposals) {
    try {
      const contract = new ethers.Contract(
        proposal.contractAddress,
        OZGovernor_ABI,
        provider
      );

      const [proposalState, votes] = await Promise.all([
        contract.state(proposal.id),
        contract.proposalVotes(proposal.id),
      ]);

      let quorum: string | undefined;
      if (proposalState !== 0) {
        try {
          const quorumBN = await contract.quorum(proposal.startBlock);
          quorum = quorumBN.toString();
        } catch {
          // Quorum fetch can fail
        }
      }

      refreshed.push({
        ...proposal,
        state: (
          ProposalState[proposalState] as string
        )?.toLowerCase() as ParsedProposal["state"],
        votes: {
          againstVotes: votes.againstVotes.toString(),
          forVotes: votes.forVotes.toString(),
          abstainVotes: votes.abstainVotes.toString(),
          quorum,
        },
      });
    } catch {
      // If refresh fails, keep the cached version
      refreshed.push(proposal);
    }
  }

  return refreshed;
}

function calculateSearchRanges(
  userStartBlock: number,
  userEndBlock: number,
  cache: ProposalCache | null,
  skipCache: boolean
): {
  rpcRanges: Array<{ start: number; end: number }>;
  useCache: boolean;
  cacheFilter?: { minBlock: number; maxBlock: number };
  rangeInfo: string;
} {
  // If no cache or skipping cache, fetch everything from RPC
  if (!cache || skipCache) {
    return {
      rpcRanges: [{ start: userStartBlock, end: userEndBlock }],
      useCache: false,
      rangeInfo: skipCache
        ? "Cache skipped, fetching all from RPC"
        : "No cache available, fetching all from RPC",
    };
  }

  const cacheStart = cache.startBlock;
  const cacheEnd = cache.snapshotBlock;

  // Case 1: User range is entirely after cache (most common - looking for new proposals)
  if (userStartBlock > cacheEnd) {
    return {
      rpcRanges: [{ start: userStartBlock, end: userEndBlock }],
      useCache: false,
      rangeInfo: `Searching new blocks ${userStartBlock.toLocaleString()}-${userEndBlock.toLocaleString()}`,
    };
  }

  // Case 2: User range is entirely within cache (full cache hit!)
  if (userStartBlock >= cacheStart && userEndBlock <= cacheEnd) {
    return {
      rpcRanges: [],
      useCache: true,
      cacheFilter: { minBlock: userStartBlock, maxBlock: userEndBlock },
      rangeInfo: `Full cache hit: blocks ${userStartBlock.toLocaleString()}-${userEndBlock.toLocaleString()}`,
    };
  }

  // Case 3: User range overlaps with cache (partial cache hit)
  const rpcRanges: Array<{ start: number; end: number }> = [];

  if (userStartBlock < cacheStart) {
    rpcRanges.push({ start: userStartBlock, end: cacheStart - 1 });
  }

  if (userEndBlock > cacheEnd) {
    rpcRanges.push({ start: cacheEnd + 1, end: userEndBlock });
  }

  const cacheFilterMin = Math.max(userStartBlock, cacheStart);
  const cacheFilterMax = Math.min(userEndBlock, cacheEnd);

  const rangeDescriptions: string[] = [];
  if (cacheFilterMin <= cacheFilterMax) {
    rangeDescriptions.push(
      `cache: ${cacheFilterMin.toLocaleString()}-${cacheFilterMax.toLocaleString()}`
    );
  }
  for (const range of rpcRanges) {
    rangeDescriptions.push(
      `RPC: ${range.start.toLocaleString()}-${range.end.toLocaleString()}`
    );
  }

  return {
    rpcRanges,
    useCache: true,
    cacheFilter: { minBlock: cacheFilterMin, maxBlock: cacheFilterMax },
    rangeInfo: `Partial cache hit - ${rangeDescriptions.join(", ")}`,
  };
}

export function useMultiGovernorSearch({
  daysToSearch,
  enabled,
  customRpcUrl,
  blockRange = DEFAULT_BLOCK_RANGE,
  skipCache = false,
}: UseMultiGovernorSearchOptions): UseMultiGovernorSearchResult {
  const [progress, setProgress] = useState(0);
  const [proposals, setProposals] = useState<ParsedProposal[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [providerReady, setProviderReady] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<CacheHitInfo>();
  const [cache, setCache] = useState<ProposalCache | null>(null);

  const rpcUrl = customRpcUrl || ARBITRUM_RPC_URL;

  // Load cache on mount (unless skipping)
  useEffect(() => {
    if (skipCache) {
      setCache(null);
      return;
    }

    loadProposalCache().then((loaded) => {
      if (loaded) {
        setCache(loaded);
        // Show cached proposals immediately (sorted)
        setProposals(sortProposals(loaded.proposals));
        setCacheInfo({
          loaded: true,
          snapshotBlock: loaded.snapshotBlock,
          cacheStartBlock: loaded.startBlock,
          cachedCount: loaded.proposals.length,
          freshCount: 0,
          cacheUsed: true,
          rangeInfo: `Cache loaded: blocks ${loaded.startBlock.toLocaleString()}-${loaded.snapshotBlock.toLocaleString()}`,
        });
        console.debug(
          `[useMultiGovernorSearch] Cache loaded: ${loaded.proposals.length} proposals (blocks ${loaded.startBlock}-${loaded.snapshotBlock})`
        );
      }
    });
  }, [skipCache]);

  // Initialize provider
  useEffect(() => {
    setProviderReady(false);
    const init = async () => {
      try {
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        await provider.ready;
        await provider.getBlockNumber();
        setProviderReady(true);
      } catch (err) {
        setError(err as Error);
      }
    };
    init();
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
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        await provider.ready;
        const currentBlock = await provider.getBlockNumber();

        // Calculate user's desired search range
        const blocksToSearch = BLOCKS_PER_DAY.arbitrum * daysToSearch;
        const userStartBlock = Math.max(currentBlock - blocksToSearch, 0);
        const userEndBlock = currentBlock;

        // Determine what needs to be fetched from RPC vs cache
        const searchPlan = calculateSearchRanges(
          userStartBlock,
          userEndBlock,
          cache,
          skipCache
        );

        console.debug(`[useMultiGovernorSearch] ${searchPlan.rangeInfo}`);

        let rpcProposals: ParsedProposal[] = [];
        let cachedProposals: ParsedProposal[] = [];

        // Fetch from RPC if needed
        if (searchPlan.rpcRanges.length > 0) {
          const totalRanges =
            searchPlan.rpcRanges.length * ARBITRUM_GOVERNORS.length;
          let completedQueries = 0;

          const updateProgress = () => {
            if (cancelled) return;
            const searchProgress = (completedQueries / totalRanges) * 70;
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
                () => {
                  // Individual query progress
                }
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

        if (searchPlan.useCache && cache) {
          cachedProposals = cache.proposals;
          console.debug(
            `[useMultiGovernorSearch] Using ${cachedProposals.length} cached proposals`
          );
        }

        // Refresh state for pending/active cached proposals
        setProgress(80);
        const proposalsToRefresh = cachedProposals.filter((p) =>
          needsStateRefresh(p.state)
        );

        if (proposalsToRefresh.length > 0) {
          console.debug(
            `[useMultiGovernorSearch] Refreshing ${proposalsToRefresh.length} pending/active proposals`
          );
          const refreshed = await refreshProposalStates(
            provider,
            proposalsToRefresh
          );

          // Replace with refreshed versions
          cachedProposals = cachedProposals.map((p) => {
            const updated = refreshed.find((r) => r.id === p.id);
            return updated ?? p;
          });
        }

        setProgress(90);
        if (cancelled || abortController.signal.aborted) return;

        // Merge cached and fresh proposals
        const allProposals = mergeProposals(cachedProposals, rpcProposals);

        // Sort: active first, then by startBlock descending
        setProposals(sortProposals(allProposals));
        setCacheInfo({
          loaded: cache !== null,
          snapshotBlock: cache?.snapshotBlock ?? 0,
          cacheStartBlock: cache?.startBlock ?? 0,
          cachedCount: cachedProposals.length,
          freshCount: rpcProposals.length,
          cacheUsed: searchPlan.useCache,
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
  }, [
    enabled,
    providerReady,
    daysToSearch,
    rpcUrl,
    blockRange,
    skipCache,
    cache,
  ]);

  // Handle vote updates from lifecycle tracking
  const handleVoteUpdate = useCallback((update: VoteUpdate) => {
    setProposals((currentProposals) => {
      const proposalIndex = currentProposals.findIndex(
        (p) =>
          p.id === update.proposalId &&
          p.contractAddress.toLowerCase() ===
            update.governorAddress.toLowerCase()
      );

      if (proposalIndex === -1) return currentProposals;

      const updatedProposals = [...currentProposals];
      const proposal = updatedProposals[proposalIndex];

      updatedProposals[proposalIndex] = {
        ...proposal,
        votes: {
          forVotes: update.forVotes,
          againstVotes: update.againstVotes,
          abstainVotes: update.abstainVotes,
          quorum: proposal.votes?.quorum,
        },
      };

      return updatedProposals;
    });
  }, []);

  // Subscribe to vote updates from lifecycle tracking
  useEffect(() => {
    const unsubscribe = subscribeToVoteUpdates(handleVoteUpdate);
    return () => unsubscribe();
  }, [handleVoteUpdate]);

  return {
    proposals,
    progress,
    error,
    isSearching,
    isProviderReady: providerReady,
    cacheInfo,
  };
}
