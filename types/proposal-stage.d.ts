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
  /** Target L2 chain for retryable tickets (Arb1 or Nova) */
  targetChain?: "Arb1" | "Nova";
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
 * Link from proposal cache to timelock operation cache
 *
 * When a proposal is queued in the L2 timelock, we extract the timelock
 * operation info and store it as a link. Stages 4-10 are then stored in
 * the timelock cache and resolved at read time.
 */
export interface TimelockLink {
  /** The L2 queue transaction hash (contains CallScheduled/ProposalQueued) */
  txHash: string;
  /** The operation ID (keccak256 of proposal parameters) */
  operationId: string;
  /** The L2 timelock address */
  timelockAddress: string;
  /** Block number where the operation was queued */
  queueBlockNumber: number;
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
  /** Link to timelock cache for stages 4-10 (present after PROPOSAL_QUEUED completes) */
  timelockLink?: TimelockLink;
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
