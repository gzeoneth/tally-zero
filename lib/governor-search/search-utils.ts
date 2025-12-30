import { ethers } from "ethers";

import { findByAddress } from "@/lib/address-utils";
import { batchQueryWithRateLimit } from "@/lib/rpc-utils";
import type { ParsedProposal, Proposal } from "@/types/proposal";
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_GOVERNORS,
  BLOCKS_PER_DAY,
} from "@config/arbitrum-governance";
import { ProposalState } from "@config/initial-state";
import OZGovernor_ABI from "@data/OzGovernor_ABI.json";

/**
 * Search a single governor contract for proposals
 */
export async function searchGovernor(
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

/**
 * Search a governor contract for proposals within a day range
 */
export async function searchGovernorByDays(
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

/**
 * Parse raw proposals into ParsedProposal format with state and votes.
 * Batches RPC calls to reduce rate limiting issues.
 */
export async function parseProposals(
  provider: ethers.providers.Provider,
  proposals: Proposal[]
): Promise<ParsedProposal[]> {
  if (proposals.length === 0) return [];

  // Create contract instances (cached by address)
  const contracts = new Map<string, ethers.Contract>();
  const getContract = (address: string) => {
    if (!contracts.has(address)) {
      contracts.set(
        address,
        new ethers.Contract(address, OZGovernor_ABI, provider)
      );
    }
    return contracts.get(address)!;
  };

  // Build batched queries for all proposals
  const queries = proposals.map((proposal) => async () => {
    const contract = getContract(proposal.contractAddress);
    try {
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

      const governor = findByAddress(
        ARBITRUM_GOVERNORS,
        proposal.contractAddress
      );

      return {
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
      } as ParsedProposal;
    } catch (e) {
      console.debug("[parseProposals] Failed to parse proposal:", e);
      return null;
    }
  });

  // Execute in batches of 5 with 500ms delay to avoid rate limits
  const results = await batchQueryWithRateLimit(queries, 5, 500);
  return results.filter((p): p is ParsedProposal => p !== null);
}

/**
 * Refresh state and votes for existing proposals.
 * Batches RPC calls to reduce rate limiting issues.
 */
export async function refreshProposalStates(
  provider: ethers.providers.Provider,
  proposals: ParsedProposal[]
): Promise<ParsedProposal[]> {
  if (proposals.length === 0) return [];

  // Create contract instances (cached by address)
  const contracts = new Map<string, ethers.Contract>();
  const getContract = (address: string) => {
    if (!contracts.has(address)) {
      contracts.set(
        address,
        new ethers.Contract(address, OZGovernor_ABI, provider)
      );
    }
    return contracts.get(address)!;
  };

  // Build batched queries for all proposals
  const queries = proposals.map((proposal) => async () => {
    const contract = getContract(proposal.contractAddress);
    try {
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

      return {
        ...proposal,
        state: (
          ProposalState[proposalState] as string
        )?.toLowerCase() as ParsedProposal["state"],
        votes: {
          forVotes: votes.forVotes.toString(),
          againstVotes: votes.againstVotes.toString(),
          abstainVotes: votes.abstainVotes.toString(),
          quorum,
        },
      };
    } catch {
      // If refresh fails, keep the cached version
      return proposal;
    }
  });

  // Execute in batches of 5 with 500ms delay to avoid rate limits
  return batchQueryWithRateLimit(queries, 5, 500);
}
