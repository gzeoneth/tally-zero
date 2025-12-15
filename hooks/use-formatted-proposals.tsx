import { EnrichedProposal, ParsedProposal } from "@/types/proposal";
import { ProposalState } from "@config/intial-state";
import { useMemo } from "react";

export function useFormattedProposals(
  proposals: EnrichedProposal[],
  networkId: string
): ParsedProposal[] {
  return useMemo(() => {
    const formattedProposals = proposals.map(
      (proposal: EnrichedProposal): ParsedProposal => ({
        id: proposal.id,
        contractAddress: proposal.contractAddress,
        proposer: proposal.proposer,
        targets: proposal.targets,
        values: proposal.values,
        signatures: proposal.signatures,
        calldatas: proposal.calldatas,
        startBlock: proposal.startBlock,
        endBlock: proposal.endBlock,
        description: proposal.description,
        networkId: networkId,
        state: (ProposalState[proposal.state] as string).toLowerCase(),
        creationTxHash: proposal.creationTxHash,
        votes: proposal.votes,
      })
    );

    return formattedProposals.sort((a, b) => {
      if (a.state === "active" && b.state !== "active") {
        return -1;
      } else if (a.state !== "active" && b.state === "active") {
        return 1;
      }

      if (a.startBlock !== b.startBlock) {
        return parseInt(b.startBlock) - parseInt(a.startBlock);
      }

      return parseInt(b.id) - parseInt(a.id);
    });
  }, [networkId, proposals]);
}
