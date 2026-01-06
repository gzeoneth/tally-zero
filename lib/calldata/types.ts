/**
 * Calldata decoding type definitions
 *
 * These types match the shapes from @gzeoneth/gov-tracker with
 * local UI extensions for block explorer links and chain labels.
 */

/**
 * Chain context for address resolution
 */
export type ChainContext = "ethereum" | "arb1" | "nova";

/**
 * Source of function signature decoding
 */
export type DecodingSource = "local" | "api" | "failed";

/**
 * Decoded calldata result
 */
export interface DecodedCalldata {
  /** 4-byte function selector (0x prefix) */
  selector: string;
  /** Decoded function name (null if unknown) */
  functionName: string | null;
  /** Full function signature (null if unknown) */
  signature: string | null;
  /** Decoded parameters (null if decoding failed) */
  parameters: DecodedParameter[] | null;
  /** Raw calldata hex string */
  raw: string;
  /** Source of decoding (local ABI, API lookup, or failed) */
  decodingSource: DecodingSource;
  /** Target contract address (if known during decoding) */
  decodingTarget?: string;
  /** Chain context for this calldata (for simulation extraction) */
  chainContext?: ChainContext;
}

/**
 * Decoded parameter with optional nested calldata
 */
export interface DecodedParameter {
  /** Parameter name from ABI */
  name: string;
  /** Solidity type (e.g., "address", "uint256", "bytes") */
  type: string;
  /** Decoded value as string */
  value: string;
  /** Whether this parameter contains nested calldata */
  isNested: boolean;
  /** Nested decoded calldata for bytes parameters */
  nested?: DecodedCalldata;
  /** Decoded elements for bytes[] arrays */
  nestedArray?: DecodedCalldata[];
  /** Known address label (e.g., "Core Governor", "L1 Timelock") */
  addressLabel?: string;
  /** Block explorer link for address parameters */
  link?: string;
  /** Chain label for display (Arb1, Nova, L1) */
  chainLabel?: string;
}

/**
 * Retryable ticket data extracted from L1 calldata
 */
export interface RetryableTicketData {
  /** Target delayed inbox address on L1 */
  targetInbox: string;
  /** Target contract address on L2 */
  l2Target: string;
  /** ETH value to send on L2 (in wei) */
  l2Value: string;
  /** Gas limit for L2 execution */
  gasLimit: string;
  /** Max fee per gas for L2 execution */
  maxFeePerGas: string;
  /** Calldata to execute on L2 */
  l2Calldata: string;
  /** Target L2 chain (arb1, nova, or unknown) */
  chain: "arb1" | "nova" | "unknown";
}

/**
 * Extended DecodedParameter with internal raw bytes array (for processing)
 */
export interface DecodedParameterWithRaw extends DecodedParameter {
  /** Internal raw bytes array for further processing */
  _rawBytesArray?: string[];
}

/**
 * Map ChainContext to display label
 */
export function getChainDisplayLabel(chain: ChainContext): string {
  switch (chain) {
    case "ethereum":
      return "L1";
    case "arb1":
      return "Arb1";
    case "nova":
      return "Nova";
    default:
      return chain;
  }
}

// ==========================================
// Simulation types (matching gov-tracker)
// ==========================================

/**
 * Type of simulation
 */
export type SimulationType = "retryable" | "timelock" | "call";

/**
 * Chain type for simulation targeting
 */
export type SimulationChainType = "L1" | "Arb1" | "Nova" | "unknown";

/**
 * Base simulation data shared by all simulation types
 */
export interface BaseSimulationData {
  /** Type of simulation */
  type: SimulationType;
  /** Network ID for Tenderly (1, 42161, 42170) */
  networkId: string;
  /** Address initiating the transaction */
  from: string;
  /** Target contract address */
  to: string;
  /** Encoded transaction input data */
  input: string;
  /** Wei value to send (default "0") */
  value: string;
}

/**
 * Retryable ticket simulation data (L1→L2 message)
 */
export interface RetryableSimulationData extends BaseSimulationData {
  type: "retryable";
  /** Target L2 chain */
  l2Chain: ChainContext;
  /** Original L2 target from retryable ticket */
  l2Target: string;
  /** Original L2 calldata */
  l2Calldata: string;
  /** Original L2 value */
  l2Value: string;
}

/**
 * Timelock batch simulation data (schedule→execute conversion)
 */
export interface TimelockSimulationData extends BaseSimulationData {
  type: "timelock";
  /** Timelock contract address */
  timelockAddress: string;
  /** Original scheduleBatch calldata */
  originalCalldata: string;
  /** Converted executeBatch calldata */
  executeCalldata: string;
  /** Computed operation ID (for storage override) */
  operationId: string;
  /** Decoded batch parameters */
  batchParams: {
    targets: string[];
    values: string[];
    calldatas: string[];
    predecessor: string;
    salt: string;
  };
  /** Storage override requirements */
  storageOverride: {
    /** Symbolic storage mapping for Tenderly encoding API */
    symbolic: Record<string, string>;
  };
}

/**
 * Generic call simulation data
 */
export interface CallSimulationData extends BaseSimulationData {
  type: "call";
  /** Target chain */
  chain: SimulationChainType;
  /** Target contract */
  target: string;
  /** Call calldata */
  calldata: string;
}

/**
 * Union of all simulation data types
 */
export type SimulationData =
  | RetryableSimulationData
  | TimelockSimulationData
  | CallSimulationData;

/**
 * Result of extracting simulation data from decoded calldata
 */
export interface ExtractedSimulation {
  /** Simulation data ready for client use */
  simulation: SimulationData;
  /** Human-readable label for this simulation */
  label: string;
  /** Index in batch (if part of a batch operation) */
  batchIndex?: number;
}
