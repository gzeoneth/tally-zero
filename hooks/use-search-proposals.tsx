import { Contract, ethers } from "ethers";
import { useEffect, useState } from "react";

import { Proposal } from "@/types/proposal";
import OZGovernor_ABI from "@data/OzGovernor_ABI.json";
import { batchQueryWithRateLimit } from "../lib/rpc-utils";

// Block times for different chains (in seconds)
const BLOCK_TIMES: Record<number, number> = {
  1: 12, // Ethereum
  10: 2, // Optimism
  137: 2, // Polygon
  42161: 0.25, // Arbitrum
  43114: 2, // Avalanche
  // Add more chains as needed
};

const getBlocksPerDay = (chainId: number): number => {
  const blockTime = BLOCK_TIMES[chainId] || 12; // Default to Ethereum block time
  return Math.floor(86400 / blockTime);
};

export interface UseSearchProposalsOptions {
  provider: ethers.providers.Provider | undefined;
  contractAddress: string | undefined;
  blockRange: number;
  enabled: boolean;
  daysToSearch?: number;
  parallelQueries?: number;
}

export const useSearchProposals = ({
  provider,
  contractAddress,
  blockRange,
  enabled,
  daysToSearch = 30,
  parallelQueries = 3,
}: UseSearchProposalsOptions) => {
  const [searchProgress, setSearchProgress] = useState(0);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const cancelSearch = () => {
    setSearchProgress(0);
    setProposals([]);
  };

  useEffect(() => {
    if (!enabled || !provider || !contractAddress) return;

    const contract = new Contract(contractAddress, OZGovernor_ABI, provider);

    let cancelled = false;

    const fetchProposals = async () => {
      try {
        setIsSearching(true);
        setError(null);

        const currentBlock = await provider.getBlockNumber();
        const network = await provider.getNetwork();
        const chainId = network.chainId;

        // Calculate blocks to search based on days
        const blocksPerDay = getBlocksPerDay(chainId);
        const blocksToSearch = blocksPerDay * daysToSearch;

        // Calculate start block based on time range
        const startBlock = Math.max(currentBlock - blocksToSearch, 0);

        const proposalCreatedFilter = contract.filters.ProposalCreated();

        // Prepare queries
        const queries: (() => Promise<ethers.Event[]>)[] = [];
        let totalBlocks = currentBlock - startBlock;
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

              // Update progress
              if (!cancelled) {
                processedBlocks += queryToBlock - queryFromBlock;
                const progress = Math.min(
                  (processedBlocks / totalBlocks) * 100,
                  100
                );
                setSearchProgress(progress);
              }

              return events;
            } catch (error) {
              console.error(
                `Error querying blocks ${queryFromBlock}-${queryToBlock}:`,
                error
              );
              // Return empty array on error to continue processing other blocks
              return [];
            }
          });
        }

        // Execute queries with rate limiting
        const allEvents = await batchQueryWithRateLimit(
          queries,
          parallelQueries,
          1000 // 1 second delay between batches
        );

        if (cancelled) return;

        // Process all events
        const allProposals: Proposal[] = [];

        for (const events of allEvents) {
          const newProposals = events.map((event) => {
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
            return {
              id: proposalId.toString(),
              contractAddress: contractAddress,
              proposer,
              targets,
              values: Array.isArray(values)
                ? values.map((value) => value.toString())
                : [],
              signatures,
              calldatas,
              startBlock: startBlock.toString(),
              endBlock: endBlock.toString(),
              description,
              state: 0,
              creationTxHash: event.transactionHash,
            } as Proposal;
          });

          allProposals.push(...newProposals);
        }

        if (!cancelled) {
          setProposals(allProposals);
          setSearchProgress(100);
          setIsSearching(false);
        }
      } catch (error) {
        console.error("Error fetching proposals:", error);
        if (!cancelled) {
          setError(error as Error);
          setIsSearching(false);
        }
      }
    };

    fetchProposals();

    return () => {
      cancelled = true;
    };
  }, [
    provider,
    contractAddress,
    enabled,
    blockRange,
    daysToSearch,
    parallelQueries,
  ]);

  return { proposals, searchProgress, error, isSearching };
};
