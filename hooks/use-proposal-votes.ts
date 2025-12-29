"use client";

import { ethers } from "ethers";
import { useCallback, useEffect, useState } from "react";

import { CORE_GOVERNOR, TREASURY_GOVERNOR } from "@/config/arbitrum-governance";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { delay } from "@/lib/delay-utils";
import { getDelegateLabel } from "@/lib/delegate-cache";
import OzGovernor_ABI from "@data/OzGovernor_ABI.json";

// Governance start block on Arbitrum One
const GOVERNANCE_START_BLOCK = 70398215;

// L2 block range per query (smaller chunks to avoid RPC limits)
const L2_CHUNK_SIZE = 500_000;
const DELAY_BETWEEN_CHUNKS = 200;

export type VoteSupport = "for" | "against" | "abstain";

export interface ProposalVote {
  voter: string;
  voterLabel?: string;
  support: VoteSupport;
  weight: string;
  reason?: string;
  txHash: string;
  blockNumber: number;
}

export interface ProposalVotesResult {
  proposalId: string;
  governorName: string;
  governorAddress: string;
  votes: ProposalVote[];
  totalVotes: number;
  forVotes: string;
  againstVotes: string;
  abstainVotes: string;
  forCount: number;
  againstCount: number;
  abstainCount: number;
}

export interface UseProposalVotesOptions {
  proposalId: string;
  enabled?: boolean;
  customRpcUrl?: string;
}

export interface UseProposalVotesReturn {
  result: ProposalVotesResult | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

// VoteCast event signature
const VOTE_CAST_TOPIC = ethers.utils.id(
  "VoteCast(address,uint256,uint8,uint256,string)"
);

function supportToString(support: number): VoteSupport {
  switch (support) {
    case 0:
      return "against";
    case 1:
      return "for";
    case 2:
      return "abstain";
    default:
      return "abstain";
  }
}

export function useProposalVotes({
  proposalId,
  enabled = true,
  customRpcUrl,
}: UseProposalVotesOptions): UseProposalVotesReturn {
  const { l2Rpc, isHydrated } = useRpcSettings();

  const [result, setResult] = useState<ProposalVotesResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rpcUrl = customRpcUrl || l2Rpc;

  const fetchProposalVotes = useCallback(async () => {
    if (!proposalId || !enabled) return;

    // Basic proposal ID validation
    try {
      BigInt(proposalId);
    } catch {
      setError("Invalid proposal ID");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      await provider.ready;

      const governors = [
        { address: CORE_GOVERNOR.address, name: "Core Governor" },
        { address: TREASURY_GOVERNOR.address, name: "Treasury Governor" },
      ];

      const iface = new ethers.utils.Interface(OzGovernor_ABI);

      // Try each governor to find the proposal
      for (const gov of governors) {
        const contract = new ethers.Contract(
          gov.address,
          OzGovernor_ABI,
          provider
        );

        try {
          // Check if proposal exists by getting its state
          await contract.state(proposalId);

          // Proposal exists in this governor - fetch VoteCast events in chunks
          const currentBlock = await provider.getBlockNumber();
          const allLogs: ethers.providers.Log[] = [];

          // Search in chunks from governance start to current block
          for (
            let fromBlock = GOVERNANCE_START_BLOCK;
            fromBlock <= currentBlock;
            fromBlock += L2_CHUNK_SIZE
          ) {
            const toBlock = Math.min(
              fromBlock + L2_CHUNK_SIZE - 1,
              currentBlock
            );

            const chunkLogs = await provider.getLogs({
              address: gov.address,
              topics: [VOTE_CAST_TOPIC],
              fromBlock,
              toBlock,
            });

            allLogs.push(...chunkLogs);

            // Add delay between chunks to avoid rate limiting
            if (toBlock < currentBlock) {
              await delay(DELAY_BETWEEN_CHUNKS);
            }
          }

          const logs = allLogs;

          const votes: ProposalVote[] = [];
          let forTotal = BigInt(0);
          let againstTotal = BigInt(0);
          let abstainTotal = BigInt(0);

          for (const log of logs) {
            try {
              const parsed = iface.parseLog(log);
              // Filter for this specific proposal
              if (parsed.args.proposalId.toString() === proposalId) {
                const support = supportToString(parsed.args.support);
                const weight = parsed.args.weight.toString();

                if (support === "for") forTotal += BigInt(weight);
                else if (support === "against") againstTotal += BigInt(weight);
                else abstainTotal += BigInt(weight);

                votes.push({
                  voter: parsed.args.voter,
                  voterLabel: getDelegateLabel(parsed.args.voter),
                  support,
                  weight,
                  reason: parsed.args.reason || undefined,
                  txHash: log.transactionHash,
                  blockNumber: log.blockNumber,
                });
              }
            } catch {
              // Skip unparseable logs
            }
          }

          // Sort by weight descending (largest votes first)
          votes.sort((a, b) => {
            const weightA = BigInt(a.weight);
            const weightB = BigInt(b.weight);
            if (weightB > weightA) return 1;
            if (weightB < weightA) return -1;
            return 0;
          });

          const forCount = votes.filter((v) => v.support === "for").length;
          const againstCount = votes.filter(
            (v) => v.support === "against"
          ).length;
          const abstainCount = votes.filter(
            (v) => v.support === "abstain"
          ).length;

          setResult({
            proposalId,
            governorName: gov.name,
            governorAddress: gov.address,
            votes,
            totalVotes: votes.length,
            forVotes: forTotal.toString(),
            againstVotes: againstTotal.toString(),
            abstainVotes: abstainTotal.toString(),
            forCount,
            againstCount,
            abstainCount,
          });
          return;
        } catch (err) {
          // Proposal not in this governor, try next
          console.debug(`Proposal not found in ${gov.name}:`, err);
        }
      }

      // Not found in either governor
      setError("Proposal not found in Core or Treasury Governor");
      setResult(null);
    } catch (err) {
      console.error("[useProposalVotes] Error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch proposal votes"
      );
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }, [proposalId, enabled, rpcUrl]);

  useEffect(() => {
    if (!isHydrated) return;
    if (proposalId && enabled) {
      fetchProposalVotes();
    } else {
      setResult(null);
      setError(null);
    }
  }, [isHydrated, proposalId, enabled, fetchProposalVotes]);

  return {
    result,
    isLoading,
    error,
    refetch: fetchProposalVotes,
  };
}
