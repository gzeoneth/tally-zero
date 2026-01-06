/**
 * Calldata decoder with UI metadata enhancement
 *
 * Uses @gzeoneth/gov-tracker for core decoding, then enhances
 * results with local UI-specific metadata (explorer links, chain labels).
 */

import {
  decodeCalldata as govTrackerDecodeCalldata,
  getAddressExplorerUrl,
  getAddressLabel,
  getChainLabel,
} from "@gzeoneth/gov-tracker";

import type { ChainContext, DecodedCalldata, DecodedParameter } from "./types";

// Internal type for gov-tracker decoded results
type GovTrackerParam = {
  name: string;
  type: string;
  value: string;
  isNested?: boolean;
  addressLabel?: string;
  nested?: GovTrackerDecoded;
  nestedArray?: GovTrackerDecoded[];
};

type GovTrackerDecoded = {
  selector: string;
  functionName: string | null;
  signature: string | null;
  raw: string;
  decodingSource: "local" | "api" | "failed";
  decodingTarget?: string;
  chainContext?: ChainContext;
  parameters: GovTrackerParam[] | null;
};

/**
 * Enhance a parameter with UI-specific metadata
 */
function enhanceParameter(
  param: GovTrackerParam,
  chainContext: ChainContext
): DecodedParameter {
  const enhanced: DecodedParameter = {
    name: param.name,
    type: param.type,
    value: param.value,
    isNested: param.isNested || false,
    // Add explorer link for address types
    link:
      param.type === "address"
        ? getAddressExplorerUrl(param.value, chainContext)
        : undefined,
    // Add chain label for address types
    chainLabel:
      param.type === "address" ? getChainLabel(chainContext) : undefined,
    // Keep addressLabel from gov-tracker if present
    addressLabel:
      param.addressLabel || getAddressLabel(param.value, chainContext),
  };

  // Recursively enhance nested calldata
  if (param.nested) {
    enhanced.nested = enhanceDecodedCalldata(
      param.nested,
      param.nested.chainContext || chainContext
    );
  }

  // Recursively enhance nested array
  if (param.nestedArray && param.nestedArray.length > 0) {
    enhanced.nestedArray = param.nestedArray.map((nested) =>
      enhanceDecodedCalldata(nested, nested.chainContext || chainContext)
    );
  }

  return enhanced;
}

/**
 * Enhance decoded calldata with UI-specific metadata
 */
function enhanceDecodedCalldata(
  decoded: GovTrackerDecoded,
  chainContext: ChainContext
): DecodedCalldata {
  // Determine the chain context for parameters
  // For retryable tickets, the chain context is stored on the decoded result
  const effectiveContext: ChainContext = decoded.chainContext || chainContext;

  return {
    selector: decoded.selector,
    functionName: decoded.functionName,
    signature: decoded.signature,
    raw: decoded.raw,
    decodingSource: decoded.decodingSource,
    decodingTarget: decoded.decodingTarget,
    chainContext: decoded.chainContext,
    parameters: decoded.parameters
      ? decoded.parameters.map((param) =>
          enhanceParameter(param, effectiveContext)
        )
      : null,
  };
}

/**
 * Decode calldata with recursive nested decoding and UI enhancements
 *
 * Uses gov-tracker for core decoding, then adds local UI metadata
 * like explorer links and chain labels.
 *
 * @param calldata - The hex-encoded calldata string
 * @param targetAddress - Optional target contract address for context
 * @param depth - Current recursion depth (default: 0)
 * @param chainContext - Chain context for address resolution (default: "arb1")
 * @returns Decoded calldata with function name, parameters, and nested calls
 */
export async function decodeCalldata(
  calldata: string,
  targetAddress?: string,
  depth = 0,
  chainContext: ChainContext = "arb1"
): Promise<DecodedCalldata> {
  // Use gov-tracker for core decoding
  const decoded = (await govTrackerDecodeCalldata(
    calldata,
    targetAddress,
    depth,
    chainContext
  )) as GovTrackerDecoded;

  // Enhance with UI metadata
  return enhanceDecodedCalldata(decoded, chainContext);
}
