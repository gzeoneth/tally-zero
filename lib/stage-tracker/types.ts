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

export type StageProgressCallback = (
  stage: ProposalStage,
  stageIndex: number,
  isComplete: boolean
) => void;

/**
 * Context passed between stage tracking methods
 */
export interface TrackingContext {
  l2Provider: ethers.providers.Provider;
  l1Provider: ethers.providers.Provider;
  baseL2Provider: ethers.providers.Provider;
  governorAddress: string;
  l2TimelockAddress: string;
  l1TimelockAddress: string;
  chunkingConfig: ChunkingConfig;
  governorInterface: ethers.utils.Interface;
  timelockInterface: ethers.utils.Interface;
  proposalId: string;
  creationTxHash: string;
  creationReceipt?: ethers.providers.TransactionReceipt;
  creationL1BlockNumber?: number;
  proposalData?: {
    targets: string[];
    values: ethers.BigNumber[];
    calldatas: string[];
    description: string;
  };
  l2TimelockTxHash?: string;
  l1TimelockOperationId?: string;
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
