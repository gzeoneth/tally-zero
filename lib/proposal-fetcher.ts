/**
 * Core Proposal Fetching Logic
 *
 * Shared between the build script and runtime hook.
 * This module provides the core functions for:
 * - Fetching ProposalCreated events from governor contracts
 * - Parsing proposals (fetching state, votes, quorum)
 * - Batch querying with rate limiting
 */

import { ethers } from "ethers";

import type { ParsedProposal } from "@/types/proposal";
import type { Address } from "@/types/search";
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_GOVERNORS,
} from "@config/arbitrum-governance";
import { ProposalState } from "@config/initial-state";
import OZGovernor_ABI from "@data/OzGovernor_ABI.json";

/**
 * Raw proposal data from ProposalCreated events
 */
export interface RawProposal {
  id: string;
  contractAddress: string;
  proposer: string;
  targets: string[];
  values: string[];
  signatures: string[];
  calldatas: string[];
  startBlock: string;
  endBlock: string;
  description: string;
  creationTxHash: string;
}

/**
 * Options for searching proposals
 */
export interface SearchOptions {
  /** Starting block for the search */
  startBlock: number;
  /** Ending block (defaults to current block) */
  endBlock?: number;
  /** Block range per query (default: 10,000,000) */
  blockRange?: number;
  /** Batch size for parallel queries (default: 3) */
  batchSize?: number;
  /** Delay between batches in ms (default: 1000) */
  delayBetweenBatches?: number;
  /** Progress callback */
  onProgress?: (progress: number) => void;
}

const DEFAULT_BLOCK_RANGE = 10_000_000;
const DEFAULT_BATCH_SIZE = 3;
const DEFAULT_DELAY_BETWEEN_BATCHES = 1000;

/**
 * Sleep utility
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Query with retry and exponential backoff
 */
export async function queryWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | undefined;
  let delay = 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a rate limit error
      const errorObj = error as { code?: number; message?: string };
      if (
        errorObj.code === 429 ||
        errorObj.message?.includes("rate limit") ||
        errorObj.message?.includes("too many requests")
      ) {
        console.warn(
          `Rate limit hit, attempt ${attempt + 1}/${maxRetries + 1}`
        );
      }

      if (attempt < maxRetries) {
        await sleep(delay);
        delay = Math.min(delay * 2, 16000);
      }
    }
  }
  throw lastError;
}

/**
 * Execute queries in batches with rate limiting
 */
export async function batchQueryWithRateLimit<T>(
  queries: (() => Promise<T>)[],
  batchSize: number = DEFAULT_BATCH_SIZE,
  delayBetweenBatches: number = DEFAULT_DELAY_BETWEEN_BATCHES
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((query) => queryWithRetry(query))
    );
    results.push(...batchResults);

    if (i + batchSize < queries.length) {
      await sleep(delayBetweenBatches);
    }
  }

  return results;
}

/**
 * Fetch ProposalCreated events from a governor contract
 */
export async function fetchProposalsFromGovernor(
  provider: ethers.providers.Provider,
  governorAddress: string,
  options: SearchOptions
): Promise<RawProposal[]> {
  const {
    startBlock,
    endBlock,
    blockRange = DEFAULT_BLOCK_RANGE,
    batchSize = DEFAULT_BATCH_SIZE,
    delayBetweenBatches = DEFAULT_DELAY_BETWEEN_BATCHES,
    onProgress,
  } = options;

  const contract = new ethers.Contract(
    governorAddress,
    OZGovernor_ABI,
    provider
  );
  const currentBlock = endBlock ?? (await provider.getBlockNumber());

  const proposalCreatedFilter = contract.filters.ProposalCreated();
  const queries: (() => Promise<ethers.Event[]>)[] = [];
  const totalBlocks = currentBlock - startBlock;
  let processedBlocks = 0;

  // Create query chunks
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
        onProgress?.(Math.min((processedBlocks / totalBlocks) * 100, 100));
        return events;
      } catch (error) {
        console.warn(
          `[fetchProposals] Query failed for block range ${queryFromBlock}-${queryToBlock}:`,
          error instanceof Error ? error.message : error
        );
        return [];
      }
    });
  }

  const allEvents = await batchQueryWithRateLimit(
    queries,
    batchSize,
    delayBetweenBatches
  );

  const proposals: RawProposal[] = [];

  for (const events of allEvents) {
    for (const event of events) {
      const args = event.args!;
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
      const values = args[3] as ethers.BigNumber[];

      proposals.push({
        id: proposalId.toString(),
        contractAddress: governorAddress,
        proposer,
        targets: Array.from(targets),
        values: Array.isArray(values)
          ? values.map((v: ethers.BigNumber) => v.toString())
          : [],
        signatures: Array.from(signatures),
        calldatas: Array.from(calldatas),
        startBlock: propStartBlock.toString(),
        endBlock: propEndBlock.toString(),
        description,
        creationTxHash: event.transactionHash,
      });
    }
  }

  return proposals;
}

/**
 * Parse raw proposals by fetching state, votes, and quorum
 */
export async function parseProposals(
  provider: ethers.providers.Provider,
  proposals: RawProposal[],
  options?: {
    onProgress?: (current: number, total: number) => void;
    delayBetweenProposals?: number;
  }
): Promise<ParsedProposal[]> {
  const { onProgress, delayBetweenProposals = 100 } = options ?? {};
  const parsed: ParsedProposal[] = [];

  for (let i = 0; i < proposals.length; i++) {
    const proposal = proposals[i];
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
          // Quorum fetch can fail for some states
        }
      }

      const governor = ARBITRUM_GOVERNORS.find(
        (g) =>
          g.address.toLowerCase() === proposal.contractAddress.toLowerCase()
      );

      parsed.push({
        ...proposal,
        contractAddress: proposal.contractAddress as Address,
        networkId: String(ARBITRUM_CHAIN_ID),
        state: (ProposalState[proposalState] as string)?.toLowerCase(),
        governorName: governor?.name || "Unknown",
        votes: {
          againstVotes: votes.againstVotes.toString(),
          forVotes: votes.forVotes.toString(),
          abstainVotes: votes.abstainVotes.toString(),
          quorum,
        },
      });

      onProgress?.(i + 1, proposals.length);

      // Small delay between individual proposal queries
      if (i < proposals.length - 1 && delayBetweenProposals > 0) {
        await sleep(delayBetweenProposals);
      }
    } catch (error) {
      console.warn(
        `[parseProposals] Failed to parse proposal ${proposal.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return parsed;
}

/**
 * Refresh state and votes for specific proposals
 * Used to update pending/active proposals from cache
 */
export async function refreshProposalStates(
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
        state: (ProposalState[proposalState] as string)?.toLowerCase(),
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

/**
 * Fetch all proposals from all governors
 */
export async function fetchAllProposals(
  provider: ethers.providers.Provider,
  options: SearchOptions & {
    onGovernorProgress?: (governorId: string, progress: number) => void;
  }
): Promise<RawProposal[]> {
  const allProposals: RawProposal[] = [];

  for (const governor of ARBITRUM_GOVERNORS) {
    const proposals = await fetchProposalsFromGovernor(
      provider,
      governor.address,
      {
        ...options,
        onProgress: (p) => options.onGovernorProgress?.(governor.id, p),
      }
    );
    allProposals.push(...proposals);
  }

  return allProposals;
}

/**
 * Sort proposals: active first, then by startBlock descending
 */
export function sortProposals(proposals: ParsedProposal[]): ParsedProposal[] {
  return [...proposals].sort((a, b) => {
    if (a.state === "active" && b.state !== "active") return -1;
    if (a.state !== "active" && b.state === "active") return 1;
    return parseInt(b.startBlock) - parseInt(a.startBlock);
  });
}
