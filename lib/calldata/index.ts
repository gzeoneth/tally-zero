/**
 * Calldata Decoding Module
 *
 * Provides calldata decoding with UI enhancements and simulation extraction.
 * Core decoding is delegated to @gzeoneth/gov-tracker.
 */

// Export local decoder (wraps gov-tracker with UI enhancements)
export { decodeCalldata } from "./decoder";

// Re-export functions from gov-tracker
export {
  decodeCalldataArray,
  decodeRetryableTicket,
  extractFunctionName,
  formatDecodedValue,
  getAddressLabel,
  getChainLabel,
  getRetryableChainName,
  isLikelyCalldata,
  isRetryableTicketMagic,
  lookupLocalSignature,
  lookupSignature,
  parseParamTypes,
  RETRYABLE_TICKET_MAGIC,
} from "@gzeoneth/gov-tracker";

// Re-export simulation functions from gov-tracker
export {
  ADDRESS_ALIAS_OFFSET,
  calculateAddressAlias,
  extractAllSimulationsFromDecoded,
  getL1TimelockAlias,
  L1_TIMELOCK_ADDRESS,
  NETWORK_IDS,
  prepareCallSimulation,
  prepareRetryableSimulation,
  prepareTimelockSimulation,
  TIMELOCK_SELECTORS,
} from "@gzeoneth/gov-tracker";

// Export types from local definitions
export type {
  BaseSimulationData,
  CallSimulationData,
  ChainContext,
  DecodedCalldata,
  DecodedParameter,
  DecodedParameterWithRaw,
  DecodingSource,
  ExtractedSimulation,
  RetryableSimulationData,
  RetryableTicketData,
  SimulationChainType,
  SimulationData,
  SimulationType,
  TimelockSimulationData,
} from "./types";
export { getChainDisplayLabel } from "./types";
