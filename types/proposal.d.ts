import type { FinalizedState, PendingState } from "@/types/proposal-cache";
import type { ProposalStage, TimelockLink } from "@/types/proposal-stage";
import type { Address } from "@/types/search";

export type ProposalStateName = FinalizedState | PendingState;

/**
 * Raw proposal data extracted from ProposalCreated events.
 * Values are stored as strings for serialization compatibility.
 */
export type Proposal = {
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
  timelockLink?: TimelockLink;
};

export type UseTotalProposalsReturn = {
  totalProposals: number | null;
  isLoadingTotal: boolean;
  error: Error | null;
};
