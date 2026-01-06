/**
 * Types for Arbitrum Governance Proposal Stage Tracking
 *
 * These types are aligned with @gzeoneth/gov-tracker package.
 * The stage types are consolidated:
 * - L2_TIMELOCK: consolidated L2 timelock stage
 * - L2_TO_L1_MESSAGE: consolidated cross-chain message stage
 * - L1_TIMELOCK: consolidated L1 timelock stage
 * - RETRYABLE_EXECUTED: consolidated retryable ticket stage
 */

// Re-export types from @gzeoneth/gov-tracker for consistency
export type {
  ChunkingConfig,
  StageStatus,
  StageType,
  ChainType,
  TrackedStage as ProposalStage,
  StageTransaction,
  StageTiming,
  TrackedStageData as StageData,
  TimelockLink,
  TrackingResult,
  TrackingCheckpoint,
  TrackerOptions,
  OnProgressCallback,
} from "@gzeoneth/gov-tracker";

/**
 * Target chain for retryable tickets
 */
export type TargetChainType = "Arb1" | "Nova";

/**
 * Complete proposal tracking result
 * Extended from gov-tracker TrackingResult for UI compatibility
 */
export interface ProposalTrackingResult {
  proposalId: string;
  creationTxHash: string;
  governorAddress: string;
  stages: import("@gzeoneth/gov-tracker").TrackedStage[];
  /** Current overall proposal state from governor contract */
  currentState?: string;
  /** Link to timelock cache for stages 4-7 (present after PROPOSAL_QUEUED completes) */
  timelockLink?: import("@gzeoneth/gov-tracker").TimelockLink;
  /** Whether tracking is complete */
  isComplete?: boolean;
  /** Proposal type (constitutional, non-constitutional, election) */
  proposalType?: import("@gzeoneth/gov-tracker").ProposalType;
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
  chunkingConfig?: Partial<import("@gzeoneth/gov-tracker").ChunkingConfig>;
}
