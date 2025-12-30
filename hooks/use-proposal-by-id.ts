"use client";

import { ethers } from "ethers";
import { useCallback, useEffect, useState } from "react";

import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_GOVERNORS,
  ARBITRUM_RPC_URL,
} from "@/config/arbitrum-governance";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { createRpcProvider } from "@/lib/rpc-utils";
import { getStateName } from "@/lib/state-utils";
import type { ParsedProposal, ProposalVotes } from "@/types/proposal";
import OZGovernor_ABI from "@data/OzGovernor_ABI.json";

interface UseProposalByIdOptions {
  proposalId: string | null;
  enabled?: boolean;
  customRpcUrl?: string;
}

interface UseProposalByIdResult {
  proposal: ParsedProposal | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch a single proposal by ID from all governors
 * Used for deep linking when the proposal isn't in the cached/searched results
 */
export function useProposalById({
  proposalId,
  enabled = true,
  customRpcUrl,
}: UseProposalByIdOptions): UseProposalByIdResult {
  const [storedL2Rpc, , l2RpcHydrated] = useLocalStorage(
    STORAGE_KEYS.L2_RPC,
    ""
  );

  const [proposal, setProposal] = useState<ParsedProposal | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const rpcUrl = customRpcUrl || storedL2Rpc || ARBITRUM_RPC_URL;

  const refetch = useCallback(() => {
    setFetchTrigger((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!l2RpcHydrated) return;
    if (!enabled || !proposalId) {
      setProposal(null);
      setError(null);
      return;
    }

    let cancelled = false;

    const fetchProposal = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const provider = await createRpcProvider(rpcUrl);

        // Try each governor until we find the proposal
        for (const governor of ARBITRUM_GOVERNORS) {
          if (cancelled) return;

          try {
            const contract = new ethers.Contract(
              governor.address,
              OZGovernor_ABI,
              provider
            );

            // Try to get the proposal state - this will throw if it doesn't exist
            const proposalState = await contract.state(proposalId);

            // If we get here, the proposal exists in this governor
            const [votes, proposalSnapshot, proposalDeadline] =
              await Promise.all([
                contract.proposalVotes(proposalId),
                contract.proposalSnapshot(proposalId),
                contract.proposalDeadline(proposalId),
              ]);

            // Try to get the proposal details from ProposalCreated events
            // Search from the proposalSnapshot block backwards
            const snapshotBlock = proposalSnapshot.toNumber();
            // Search a reasonable range before the snapshot (proposals are created before voting starts)
            const searchStart = Math.max(snapshotBlock - 100000, 0);

            const proposalCreatedFilter =
              contract.filters.ProposalCreated(proposalId);
            const events = await contract.queryFilter(
              proposalCreatedFilter,
              searchStart,
              snapshotBlock + 1000
            );

            if (events.length === 0) {
              // Proposal exists but we couldn't find the creation event
              // Create a minimal proposal object
              let quorum: string | undefined;
              try {
                const quorumBN = await contract.quorum(snapshotBlock);
                quorum = quorumBN.toString();
              } catch {
                // Quorum fetch can fail
              }

              const parsedProposal: ParsedProposal = {
                id: proposalId,
                contractAddress: governor.address,
                proposer: "Unknown",
                targets: [],
                values: [],
                signatures: [],
                calldatas: [],
                startBlock: snapshotBlock.toString(),
                endBlock: proposalDeadline.toString(),
                description: `Proposal ${proposalId}`,
                networkId: String(ARBITRUM_CHAIN_ID),
                state: getStateName(proposalState),
                governorName: governor.name,
                votes: formatVotes(votes, quorum),
              };

              if (!cancelled) {
                setProposal(parsedProposal);
                setIsLoading(false);
              }
              return;
            }

            // Found the creation event, parse it
            const event = events[0];
            const args = event.args!;
            const {
              proposer,
              targets,
              signatures,
              calldatas,
              startBlock: propStartBlock,
              endBlock: propEndBlock,
              description,
            } = args;
            const proposalValues = args[3] as ethers.BigNumber[];

            let quorum: string | undefined;
            try {
              const quorumBN = await contract.quorum(propStartBlock);
              quorum = quorumBN.toString();
            } catch {
              // Quorum fetch can fail
            }

            const parsedProposal: ParsedProposal = {
              id: proposalId,
              contractAddress: governor.address,
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
              networkId: String(ARBITRUM_CHAIN_ID),
              state: getStateName(proposalState),
              governorName: governor.name,
              creationTxHash: event.transactionHash,
              votes: formatVotes(votes, quorum),
            };

            if (!cancelled) {
              setProposal(parsedProposal);
              setIsLoading(false);
            }
            return;
          } catch {
            // Proposal doesn't exist in this governor, try the next one
            continue;
          }
        }

        // Proposal not found in any governor
        if (!cancelled) {
          setError(
            new Error(`Proposal ${proposalId} not found in any governor`)
          );
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
          setIsLoading(false);
        }
      }
    };

    fetchProposal();

    return () => {
      cancelled = true;
    };
  }, [l2RpcHydrated, proposalId, enabled, rpcUrl, fetchTrigger]);

  return {
    proposal,
    isLoading,
    error,
    refetch,
  };
}

function formatVotes(
  votes: {
    forVotes: ethers.BigNumber;
    againstVotes: ethers.BigNumber;
    abstainVotes: ethers.BigNumber;
  },
  quorum?: string
): ProposalVotes {
  return {
    forVotes: votes.forVotes.toString(),
    againstVotes: votes.againstVotes.toString(),
    abstainVotes: votes.abstainVotes.toString(),
    quorum,
  };
}
