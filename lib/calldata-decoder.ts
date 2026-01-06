/**
 * Calldata Decoder Module
 *
 * Re-exports from the modular calldata library.
 * For new code, prefer importing directly from @lib/calldata.
 */

export {
  decodeCalldata,
  decodeCalldataArray,
  decodeRetryableTicket,
  extractAllSimulationsFromDecoded,
  formatDecodedValue,
  getAddressLabel,
  getChainLabel,
  getChainDisplayLabel,
  isLikelyCalldata,
  isRetryableTicketMagic,
  lookupLocalSignature,
  lookupSignature,
  parseParamTypes,
  prepareCallSimulation,
  prepareRetryableSimulation,
  prepareTimelockSimulation,
  NETWORK_IDS,
} from "./calldata";

export type {
  ChainContext,
  DecodedCalldata,
  DecodedParameter,
  DecodedParameterWithRaw,
  ExtractedSimulation,
  RetryableTicketData,
  SimulationData,
  SimulationType,
} from "./calldata";
