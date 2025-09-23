import { ethers } from "ethers";
import { useEffect, useState } from "react";

import OzGovernor_ABI from "@data/OzGovernor_ABI.json";

import { ParsedProposal, Proposal } from "@/types/proposal";
import { Address } from "@/types/search";

export function useParseProposals(
  provider: ethers.providers.Provider,
  contractAddress: Address | undefined,
  proposals: Proposal[],
  enabled: boolean
): ParsedProposal[] {
  const [parsedProposals, setParsedProposals] = useState<ParsedProposal[]>([]);

  useEffect(() => {
    if (!enabled || !contractAddress) return;

    const parseProposals = async () => {
      // console.log(
      //   `[ParseProposals] Provider:`,
      //   provider.connection?.url || "wagmi provider"
      // );
      const governorContract = new ethers.Contract(
        contractAddress,
        OzGovernor_ABI,
        provider
      );

      const proposalPromises = proposals.map(async (proposal) => {
        try {
          // Debug log
          console.log(
            `[ParseProposals] Processing proposal ${proposal.id.slice(0, 10)}...`
          );

          // Fetch state and votes in parallel
          const [proposalState, votes, quorum] = await Promise.all([
            governorContract.state(proposal.id),
            governorContract.proposalVotes(proposal.id),
            governorContract.quorum(proposal.startBlock),
          ]);

          return {
            ...proposal,
            values:
              proposal.values.length > 0
                ? proposal.values.map((value) => value.toString())
                : [],
            startBlock: proposal.startBlock.toString(),
            endBlock: proposal.endBlock.toString(),
            state: proposalState,
            contractAddress: contractAddress,
            votes:
              votes && votes.againstVotes !== undefined
                ? {
                    againstVotes: votes.againstVotes.toString(),
                    forVotes: votes.forVotes.toString(),
                    abstainVotes: votes.abstainVotes.toString(),
                    quorum: quorum ? quorum.toString() : undefined,
                  }
                : undefined,
          };
        } catch (error) {
          console.error(
            `Error fetching data for proposal ID ${proposal.id}:`,
            error
          );
          return null;
        }
      });

      const resolvedProposals = (await Promise.all(proposalPromises)).filter(
        Boolean
      );
      setParsedProposals(resolvedProposals.filter(Boolean) as ParsedProposal[]);
    };

    parseProposals();
  }, [proposals, provider, contractAddress, enabled]);

  return parsedProposals;
}
