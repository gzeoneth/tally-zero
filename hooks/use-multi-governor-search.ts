"use client";

import { ethers } from "ethers";
import { useEffect, useState } from "react";

import { batchQueryWithRateLimit } from "@/lib/rpc-utils";
import { ParsedProposal, Proposal } from "@/types/proposal";
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_GOVERNORS,
  ARBITRUM_RPC_URL,
} from "@config/arbitrum-governors";
import { ProposalState } from "@config/intial-state";
import OZGovernor_ABI from "@data/OzGovernor_ABI.json";

interface GovernorSearchResult {
  proposals: Proposal[];
  progress: number;
  error: Error | null;
}

interface UseMultiGovernorSearchOptions {
  daysToSearch: number;
  enabled: boolean;
  customRpcUrl?: string;
}

// Arbitrum produces ~345600 blocks per day (0.25s block time)
const ARBITRUM_BLOCKS_PER_DAY = 345600;
const BLOCK_RANGE = 10000000;

async function searchGovernor(
  provider: ethers.providers.Provider,
  contractAddress: string,
  daysToSearch: number,
  onProgress: (progress: number) => void
): Promise<Proposal[]> {
  const contract = new ethers.Contract(
    contractAddress,
    OZGovernor_ABI,
    provider
  );

  const currentBlock = await provider.getBlockNumber();
  const blocksToSearch = ARBITRUM_BLOCKS_PER_DAY * daysToSearch;
  const startBlock = Math.max(currentBlock - blocksToSearch, 0);

  const proposalCreatedFilter = contract.filters.ProposalCreated();
  const queries: (() => Promise<ethers.Event[]>)[] = [];
  const totalBlocks = currentBlock - startBlock;
  let processedBlocks = 0;

  for (
    let fromBlock = startBlock;
    fromBlock <= currentBlock;
    fromBlock += BLOCK_RANGE
  ) {
    const toBlock = Math.min(fromBlock + BLOCK_RANGE - 1, currentBlock);
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
        console.error(
          `Error querying blocks ${queryFromBlock}-${queryToBlock}:`,
          error
        );
        return [];
      }
    });
  }

  const allEvents = await batchQueryWithRateLimit(queries, 3, 1000);
  const proposals: Proposal[] = [];

  for (const events of allEvents) {
    for (const event of events) {
      const {
        proposalId,
        proposer,
        targets,
        values,
        signatures,
        calldatas,
        startBlock,
        endBlock,
        description,
      } = event.args as ethers.utils.Result;

      proposals.push({
        id: proposalId.toString(),
        contractAddress: contractAddress,
        proposer,
        targets,
        values: Array.isArray(values) ? values.map((v) => v.toString()) : [],
        signatures,
        calldatas,
        startBlock: startBlock.toString(),
        endBlock: endBlock.toString(),
        description,
        state: 0,
      } as Proposal);
    }
  }

  return proposals;
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
        } catch {
          // Quorum fetch can fail for some states
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
        votes: votes
          ? {
              againstVotes: votes.againstVotes.toString(),
              forVotes: votes.forVotes.toString(),
              abstainVotes: votes.abstainVotes.toString(),
              quorum: quorum?.toString(),
            }
          : undefined,
      } as ParsedProposal);
    } catch (error) {
      console.error(`Error parsing proposal ${proposal.id}:`, error);
    }
  }

  return parsed;
}

export function useMultiGovernorSearch({
  daysToSearch,
  enabled,
  customRpcUrl,
}: UseMultiGovernorSearchOptions) {
  const [progress, setProgress] = useState(0);
  const [proposals, setProposals] = useState<ParsedProposal[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [providerReady, setProviderReady] = useState(false);

  const rpcUrl = customRpcUrl || ARBITRUM_RPC_URL;

  useEffect(() => {
    setProviderReady(false);
    const init = async () => {
      try {
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        await provider.ready;
        await provider.getBlockNumber();
        setProviderReady(true);
      } catch (err) {
        console.error("Failed to initialize provider:", err);
        setError(err as Error);
      }
    };
    init();
  }, [rpcUrl]);

  useEffect(() => {
    if (!enabled || !providerReady) return;

    let cancelled = false;
    const progressMap: Record<string, number> = {};

    const updateCombinedProgress = () => {
      if (cancelled) return;
      const values = Object.values(progressMap);
      if (values.length === 0) return;
      const avg = values.reduce((a, b) => a + b, 0) / ARBITRUM_GOVERNORS.length;
      setProgress(avg);
    };

    const search = async () => {
      setIsSearching(true);
      setError(null);
      setProgress(0);
      setProposals([]);

      try {
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        await provider.ready;

        const searchPromises = ARBITRUM_GOVERNORS.map(async (governor) => {
          progressMap[governor.id] = 0;

          const rawProposals = await searchGovernor(
            provider,
            governor.address,
            daysToSearch,
            (p) => {
              progressMap[governor.id] = p;
              updateCombinedProgress();
            }
          );

          return rawProposals;
        });

        const results = await Promise.all(searchPromises);
        if (cancelled) return;

        const allRawProposals = results.flat();
        setProgress(95);
        const parsedProposals = await parseProposals(provider, allRawProposals);

        if (cancelled) return;

        // Sort: active first, then by startBlock descending
        const sorted = parsedProposals.sort((a, b) => {
          if (a.state === "active" && b.state !== "active") return -1;
          if (a.state !== "active" && b.state === "active") return 1;
          return parseInt(b.startBlock) - parseInt(a.startBlock);
        });

        setProposals(sorted);
        setProgress(100);
        setIsSearching(false);
      } catch (err) {
        if (!cancelled) {
          console.error("Search error:", err);
          setError(err as Error);
          setIsSearching(false);
        }
      }
    };

    search();

    return () => {
      cancelled = true;
    };
  }, [enabled, providerReady, daysToSearch, rpcUrl]);

  return {
    proposals,
    progress,
    error,
    isSearching,
    isProviderReady: providerReady,
  };
}
