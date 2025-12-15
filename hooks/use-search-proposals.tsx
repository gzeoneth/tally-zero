import { Contract, ethers } from "ethers";
import { useEffect, useRef, useState } from "react";

import { getBlocksPerDay } from "@/config/block-times";
import { Proposal } from "@/types/proposal";
import OZGovernor_ABI from "@data/OzGovernor_ABI.json";
import { batchQueryWithRateLimit } from "../lib/rpc-utils";

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
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!enabled || !provider || !contractAddress) return;

    const contract = new Contract(contractAddress, OZGovernor_ABI, provider);

    cancelledRef.current = false;

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
              if (!cancelledRef.current) {
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

        if (cancelledRef.current) return;

        // Process all events
        const allProposals: Proposal[] = [];

        for (const events of allEvents) {
          const newProposals = events.map((event) => {
            const args = event.args!;
            // Destructure event args to avoid Array.prototype.values collision
            const {
              proposalId,
              proposer,
              targets,
              signatures,
              calldatas,
              startBlock,
              endBlock,
              description,
            } = args;
            const proposalValues = args[3] as ethers.BigNumber[];

            return {
              id: proposalId.toString(),
              contractAddress: contractAddress,
              proposer,
              targets,
              values: Array.isArray(proposalValues)
                ? proposalValues.map((value) => value.toString())
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

        if (!cancelledRef.current) {
          setProposals(allProposals);
          setSearchProgress(100);
          setIsSearching(false);
        }
      } catch (error) {
        console.error("Error fetching proposals:", error);
        if (!cancelledRef.current) {
          setError(error as Error);
          setIsSearching(false);
        }
      }
    };

    fetchProposals();

    return () => {
      cancelledRef.current = true;
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
