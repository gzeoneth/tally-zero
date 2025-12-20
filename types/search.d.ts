export type Contract = {
  address: string;
  networkId: string;
};

export type Address = `0x${string}`;

export interface ContractParams {
  contractAddress?: Address;
  networkId?: number;
  state?: State;
  daysToSearch?: number;
  rpcUrl?: string;
  blockRange?: number;
}

export interface SearchProps {
  header: string;
  percentageComplete: number;
  currentBlock: number | undefined;
}

export interface GovernorState {
  address: Address | undefined;
  contract: ethers.Contract | null;
  name: string | undefined;
}

export interface TokenState {
  address: Address | undefined;
  contract: ethers.Contract | null;
}

export interface Proposal {
  id: number;
  index: number;
  proposer: string;
  eta: number;
  startBlock: number;
  endBlock: number;
  forVotes: number;
  againstVotes: number;
  canceled: boolean;
  executed: boolean;
  actions: Array<{
    target: string;
    value: string;
    signature: string;
    calldata: string;
  }>;
}

export type ProposalList = Proposal[];

export interface State {
  governor: GovernorState;
  token: TokenState;
  proposals: ProposalList;
}
