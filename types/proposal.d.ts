import { Address } from "@/types/search";

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

export type EnrichedProposal = {
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
  votes?: ProposalVotes;
  creationTxHash?: string;
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
  state: string;
  votes?: ProposalVotes;
  governorName?: string;
  creationTxHash?: string;
};

export type UseTotalProposalsReturn = {
  totalProposals: number | null;
  isLoadingTotal: boolean;
  error: Error | null;
};
