/**
 * Stage tracker type definitions
 *
 * Provides type-safe interfaces for proposal tracking context,
 * event arguments, and cross-chain tracking details.
 */

import type {
  ChunkingConfig,
  ProposalStage,
  StageTransaction,
} from "@/types/proposal-stage";
import { ethers } from "ethers";

/**
 * Type-safe representation of ProposalCreated event arguments
 * Maps to the ProposalCreated event in the OpenZeppelin Governor contract
 */
export interface ProposalCreatedEventArgs {
  proposalId: ethers.BigNumber;
  proposer: string;
  targets: string[];
  values: ethers.BigNumber[];
  signatures: string[];
  calldatas: string[];
  startBlock: ethers.BigNumber;
  endBlock: ethers.BigNumber;
  description: string;
}

/**
 * Callback invoked as stages are tracked
 *
 * @param stage - The stage that was tracked
 * @param stageIndex - The 0-indexed position of the stage
 * @param isComplete - Whether tracking is complete
 */
export type StageProgressCallback = (
  stage: ProposalStage,
  stageIndex: number,
  isComplete: boolean
) => void;

/**
 * Context passed between stage tracking methods
 *
 * Contains all necessary providers, addresses, and accumulated
 * state data as tracking progresses through stages.
 */
export interface TrackingContext {
  /** Arbitrum One provider */
  l2Provider: ethers.providers.Provider;
  /** Ethereum mainnet provider */
  l1Provider: ethers.providers.Provider;
  /** Base L2 provider (for non-ArbitrumProvider queries) */
  baseL2Provider: ethers.providers.Provider;
  /** Governor contract address */
  governorAddress: string;
  /** L2 timelock contract address */
  l2TimelockAddress: string;
  /** L1 timelock contract address */
  l1TimelockAddress: string;
  /** Block chunking configuration */
  chunkingConfig: ChunkingConfig;
  /** Governor contract interface */
  governorInterface: ethers.utils.Interface;
  /** Timelock contract interface */
  timelockInterface: ethers.utils.Interface;
  /** Proposal ID being tracked */
  proposalId: string;
  /** Transaction hash that created the proposal */
  creationTxHash: string;
  /** Transaction receipt for proposal creation */
  creationReceipt?: ethers.providers.TransactionReceipt;
  /** L1 block number at proposal creation */
  creationL1BlockNumber?: number;
  /** Decoded proposal data */
  proposalData?: {
    targets: string[];
    values: ethers.BigNumber[];
    calldatas: string[];
    description: string;
  };
  /** L2 timelock execution tx hash */
  l2TimelockTxHash?: string;
  /** L1 timelock operation ID */
  l1TimelockOperationId?: string;
  /** L1 timelock execution tx hash */
  l1ExecutionTxHash?: string;
}

/**
 * Result of tracking multiple stages (e.g., L2→L1 messages)
 */
export interface MultiStageResult {
  stages: ProposalStage[];
}

/**
 * Chain information for retryable tracking
 */
export interface ChainInfo {
  name: "Arb1" | "Nova";
  provider: ethers.providers.Provider;
  chainId: number;
}

/**
 * Details about a retryable ticket creation
 */
export interface RetryableCreationDetail {
  index: number;
  targetChain: "Arb1" | "Nova";
  l2TxHash: string | null;
  l2Block: number | null;
}

/**
 * Details about a retryable ticket redemption
 */
export interface RetryableRedemptionDetail {
  index: number;
  targetChain: "Arb1" | "Nova";
  status: string;
  l2TxHash: string | null;
}

export type { StageTransaction };
