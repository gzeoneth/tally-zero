/**
 * Calldata decoding module - direct exports from @gzeoneth/gov-tracker
 *
 * This module uses gov-tracker as the primary calldata decoding implementation.
 */

// Direct exports from gov-tracker
export {
  decodeCalldata,
  decodeCalldataArray,
  formatDecodedValue,
  getAddressLabel,
  getChainLabel,
  isLikelyCalldata,
  isRetryableTicketMagic,
  lookupLocalSignature,
  parseParamTypes,
} from "@gzeoneth/gov-tracker";

// Re-export types from gov-tracker
export type {
  ChainContext,
  DecodedCalldata,
  DecodedParameter,
  RetryableTicketData,
} from "@gzeoneth/gov-tracker/dist/types/calldata";

// Keep local utilities for backward compatibility where needed
export { decodeParameters } from "./parameter-decoder";
export { decodeRetryableTicket } from "./retryable-ticket";
export { lookup4byteDirectory } from "./signature-lookup";

// Export local types
export type { DecodedParameterWithRaw } from "./types";
