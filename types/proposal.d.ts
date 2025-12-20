import type { FinalizedState, PendingState } from "@/types/proposal-cache";
import type { ProposalStage } from "@/types/proposal-stage";
import type { Address } from "@/types/search";

export type ProposalStateName = FinalizedState | PendingState;

export type Proposal = {
  id: string;
  contractAddress: Address;
  proposer: string;
  targets: string[];
  values: ethers.BigNumber[];
  signatures: string[];
  calldatas: string[];
  startBlock: ethers.BigNumber;
  endBlock: ethers.BigNumber;
  description: string;
  state: number;
  creationTxHash?: string;
};

export type ProposalVotes = {
  againstVotes: string;
  forVotes: string;
  abstainVotes: string;
  quorum: string | undefined;
};

export type ParsedProposal = {
  id: string;
  contractAddress: Address;
  proposer: string;
  targets: string[];
  values: string[];
  signatures: string[];
  calldatas: string[];
  startBlock: string;
  endBlock: string;
  description: string;
  networkId: string;
  state: ProposalStateName;
  votes?: ProposalVotes;
  governorName?: string;
  creationTxHash?: string;
  stages?: ProposalStage[];
  stagesTrackedAt?: string;
};

export type UseTotalProposalsReturn = {
  totalProposals: number | null;
  isLoadingTotal: boolean;
  error: Error | null;
};
