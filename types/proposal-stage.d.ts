/**
 * Types for Arbitrum Governance Proposal Stage Tracking
 */

/**
 * Configuration for block range chunking when searching for events
 */
export interface ChunkingConfig {
  /** Maximum blocks per query for L2 (Arbitrum) */
  l2ChunkSize: number;
  /** Maximum blocks per query for L1 (Ethereum) */
  l1ChunkSize: number;
  /** Delay between chunk queries (ms) to avoid rate limiting */
  delayBetweenChunks: number;
}

/**
 * Status of a proposal stage
 */
export type StageStatus = "NOT_STARTED" | "PENDING" | "COMPLETED" | "FAILED";

/**
 * Types of proposal stages in Arbitrum governance lifecycle
 */
export type StageType =
  | "PROPOSAL_CREATED"
  | "VOTING_DELAY"
  | "VOTING_ACTIVE"
  | "PROPOSAL_QUEUED"
  | "L2_TIMELOCK_EXECUTED"
  | "L2_TO_L1_MESSAGE_SENT"
  | "L2_TO_L1_MESSAGE_CONFIRMED"
  | "L1_TIMELOCK_QUEUED"
  | "L1_TIMELOCK_EXECUTED"
  | "RETRYABLE_CREATED"
  | "RETRYABLE_REDEEMED";

/**
 * Chain identifier
 */
export type ChainType = "L1" | "L2";

/**
 * Represents a transaction associated with a stage
 */
export interface StageTransaction {
  hash: string;
  blockNumber: number;
  timestamp?: number;
  chain: ChainType;
}

/**
 * Represents a single stage in the proposal lifecycle
 */
export interface ProposalStage {
  type: StageType;
  status: StageStatus;
  transactions: StageTransaction[];
  /** Additional stage-specific data */
  data?: Record<string, unknown>;
}

/**
 * Complete proposal tracking result
 */
export interface ProposalTrackingResult {
  proposalId: string;
  creationTxHash: string;
  governorAddress: string;
  stages: ProposalStage[];
  /** Current overall proposal state from governor contract */
  currentState?: string;
}

/**
 * Input parameters for tracking a proposal
 */
export interface TrackProposalParams {
  proposalId: string;
  creationTxHash: string;
  l2RpcUrl?: string;
  l1RpcUrl?: string;
  governorAddress?: string;
  l2TimelockAddress?: string;
  l1TimelockAddress?: string;
  chunkingConfig?: Partial<ChunkingConfig>;
}

/**
 * Proposal state enum from OpenZeppelin Governor
 */
export type ProposalStateNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ProposalStateName =
  | "Pending"
  | "Active"
  | "Canceled"
  | "Defeated"
  | "Succeeded"
  | "Queued"
  | "Expired"
  | "Executed";
