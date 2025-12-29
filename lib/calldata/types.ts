import type { ChainId } from "@/lib/explorer-utils";

/**
 * Decoded calldata result
 */
export interface DecodedCalldata {
  selector: string;
  functionName: string | null;
  signature: string | null;
  parameters: DecodedParameter[] | null;
  raw: string;
  decodingSource: "local" | "api" | "failed";
}

/**
 * Chain context for address resolution
 */
export type ChainContext = ChainId;

/**
 * Decoded parameter with optional nested calldata
 */
export interface DecodedParameter {
  name: string;
  type: string;
  value: string;
  isNested: boolean;
  nested?: DecodedCalldata;
  // For bytes[] arrays - each element decoded
  nestedArray?: DecodedCalldata[];
  // For addresses - link to block explorer
  link?: string;
  // Chain context for display (Arb1, Nova, L1)
  chainLabel?: string;
  // Known address label (e.g., "Core Governor", "L1 Timelock")
  addressLabel?: string;
}

/**
 * Retryable ticket data extracted from L1 calldata
 */
export interface RetryableTicketData {
  targetInbox: string;
  l2Target: string;
  l2Value: string;
  gasLimit: string;
  maxFeePerGas: string;
  l2Calldata: string;
  chain: "arb1" | "nova" | "unknown";
}

/**
 * Extended DecodedParameter with internal raw bytes array
 */
export interface DecodedParameterWithRaw extends DecodedParameter {
  _rawBytesArray?: string[];
}
