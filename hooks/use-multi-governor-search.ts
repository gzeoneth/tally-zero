"use client";

import { ethers } from "ethers";
import { useEffect, useState } from "react";

import { batchQueryWithRateLimit } from "@/lib/rpc-utils";
import { ParsedProposal, Proposal } from "@/types/proposal";
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_GOVERNORS,
  ARBITRUM_RPC_URL,
  BLOCKS_PER_DAY,
} from "@config/arbitrum-governance";
import { ProposalState } from "@config/intial-state";
import OZGovernor_ABI from "@data/OzGovernor_ABI.json";

interface UseMultiGovernorSearchOptions {
  daysToSearch: number;
  enabled: boolean;
  customRpcUrl?: string;
  blockRange?: number;
}

interface UseMultiGovernorSearchResult {
  proposals: ParsedProposal[];
  progress: number;
  error: Error | null;
  isSearching: boolean;
  isProviderReady: boolean;
}

const DEFAULT_BLOCK_RANGE = 10000000;

async function searchGovernor(
  provider: ethers.providers.Provider,
  contractAddress: string,
  daysToSearch: number,
  blockRange: number,
  onProgress: (progress: number) => void
): Promise<Proposal[]> {
  const contract = new ethers.Contract(
    contractAddress,
    OZGovernor_ABI,
    provider
  );

  const currentBlock = await provider.getBlockNumber();
  const blocksToSearch = BLOCKS_PER_DAY.arbitrum * daysToSearch;
  const startBlock = Math.max(currentBlock - blocksToSearch, 0);

  const proposalCreatedFilter = contract.filters.ProposalCreated();
  const queries: (() => Promise<ethers.Event[]>)[] = [];
  const totalBlocks = currentBlock - startBlock;
  let processedBlocks = 0;

  for (
    let fromBlock = startBlock;
    fromBlock <= currentBlock;
    fromBlock += blockRange
  ) {
    const toBlock = Math.min(fromBlock + blockRange - 1, currentBlock);
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

  const allEvents = await batchQueryWithRateLimit(queries, 3, 1000);
  const proposals: Proposal[] = [];

  for (const events of allEvents) {
    for (const event of events) {
      const args = event.args!;
      // Access values by index (3) to avoid conflict with Array.prototype.values
      // Event args order: proposalId, proposer, targets, values, signatures, calldatas, startBlock, endBlock, description
      const proposalValues = args[3] as ethers.BigNumber[];

      proposals.push({
        id: args.proposalId.toString(),
        contractAddress: contractAddress,
        proposer: args.proposer,
        targets: args.targets,
        values: Array.isArray(proposalValues)
          ? proposalValues.map((v) => v.toString())
          : [],
        signatures: args.signatures,
        calldatas: args.calldatas,
        startBlock: args.startBlock.toString(),
        endBlock: args.endBlock.toString(),
        description: args.description,
        state: 0,
        creationTxHash: event.transactionHash,
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
        setError(err as Error);
      }
    };
    init();
  }, [rpcUrl]);

  useEffect(() => {
    if (!enabled || !providerReady) return;

    const abortController = new AbortController();
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
          if (abortController.signal.aborted) return [];

          progressMap[governor.id] = 0;

          const rawProposals = await searchGovernor(
            provider,
            governor.address,
            daysToSearch,
            blockRange,
            (p) => {
              progressMap[governor.id] = p;
              updateCombinedProgress();
            }
          );

          return rawProposals;
        });

        const results = await Promise.all(searchPromises);
        if (cancelled || abortController.signal.aborted) return;

        const allRawProposals = results.flat();
        setProgress(95);
        const parsedProposals = await parseProposals(provider, allRawProposals);

        if (cancelled || abortController.signal.aborted) return;

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

  return {
    proposals,
    progress,
    error,
    isSearching,
    isProviderReady: providerReady,
  };
}
