/**
 * Search and contract interaction type definitions
 *
 * Provides types for contract addresses, search parameters,
 * governor state, and proposal data structures.
 */

/** Contract address and network identifier */
export type Contract = {
  /** Contract address */
  address: string;
  /** Network chain ID */
  networkId: string;
};

/** Ethereum address type (0x-prefixed hex string) */
export type Address = `0x${string}`;

/** Parameters for contract search operations */
export interface ContractParams {
  /** Governor contract address */
  contractAddress?: Address;
  /** Network chain ID */
  networkId?: number;
  /** Current application state */
  state?: State;
  /** Number of days back to search */
  daysToSearch?: number;
  /** Custom RPC URL to use */
  rpcUrl?: string;
  /** Block range for event queries */
  blockRange?: number;
}

/** Search progress display properties */
export interface SearchProps {
  /** Search status header text */
  header: string;
  /** Percentage of search completed (0-100) */
  percentageComplete: number;
  /** Current block being processed */
  currentBlock: number | undefined;
}

/** Governor contract state */
export interface GovernorState {
  /** Governor contract address */
  address: Address | undefined;
  /** Ethers contract instance */
  contract: ethers.Contract | null;
  /** Human-readable governor name */
  name: string | undefined;
}

/** Token contract state (for voting power) */
export interface TokenState {
  /** Token contract address */
  address: Address | undefined;
  /** Ethers contract instance */
  contract: ethers.Contract | null;
}

/** Proposal data from governor contract */
export interface Proposal {
  /** Proposal ID */
  id: number;
  /** Index in proposals array */
  index: number;
  /** Address of the proposer */
  proposer: string;
  /** Estimated time of arrival for execution */
  eta: number;
  /** Block number when voting starts */
  startBlock: number;
  /** Block number when voting ends */
  endBlock: number;
  /** Total votes in favor */
  forVotes: number;
  /** Total votes against */
  againstVotes: number;
  /** Whether the proposal was canceled */
  canceled: boolean;
  /** Whether the proposal was executed */
  executed: boolean;
  /** Array of actions to execute */
  actions: Array<{
    /** Target contract address */
    target: string;
    /** ETH value to send */
    value: string;
    /** Function signature */
    signature: string;
    /** Encoded calldata */
    calldata: string;
  }>;
}

/** Array of proposals */
export type ProposalList = Proposal[];

/** Application state containing governor, token, and proposals */
export interface State {
  /** Governor contract state */
  governor: GovernorState;
  /** Token contract state */
  token: TokenState;
  /** List of proposals */
  proposals: ProposalList;
}
