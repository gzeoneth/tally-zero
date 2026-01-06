/**
 * Calldata decoding module - re-exports from @gzeoneth/gov-tracker
 *
 * This module now delegates to gov-tracker for calldata decoding functionality.
 * Local implementations are kept for backward compatibility but deprecated.
 */

// Import and re-export from gov-tracker
export {
  decodeCalldataArray,
  formatDecodedValue,
  getAddressLabel,
  getChainLabel,
  isLikelyCalldata,
  isRetryableTicketMagic,
  lookupLocalSignature,
  parseParamTypes,
} from "@gzeoneth/gov-tracker";

// Re-export enriched decoder that adds UI-specific fields
export { decodeCalldata } from "./decoder-wrapper";
export type {
  EnrichedDecodedCalldata as DecodedCalldata,
  EnrichedDecodedParameter as DecodedParameter,
} from "./decoder-wrapper";

// Re-export types from gov-tracker type modules
export type {
  ChainContext,
  RetryableTicketData,
} from "@gzeoneth/gov-tracker/dist/types/calldata";

// Keep local utilities for backward compatibility
export { decodeParameters } from "./parameter-decoder";
export { decodeRetryableTicket } from "./retryable-ticket";
export { lookup4byteDirectory } from "./signature-lookup";

// Export local types that are not in gov-tracker
export type { DecodedParameterWithRaw } from "./types";
