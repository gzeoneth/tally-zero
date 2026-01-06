/**
 * Wrapper around gov-tracker's decodeCalldata that adds UI-specific fields
 *
 * This wrapper enriches the decoded calldata with explorer links and chain labels
 * that are used by the UI components but not provided by gov-tracker.
 */

import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { decodeCalldata as govTrackerDecodeCalldata } from "@gzeoneth/gov-tracker";
// Import types from gov-tracker's type modules
import { getChainLabel } from "@gzeoneth/gov-tracker";
import type {
  ChainContext,
  DecodedCalldata as GovTrackerDecodedCalldata,
  DecodedParameter as GovTrackerDecodedParameter,
} from "@gzeoneth/gov-tracker/dist/types/calldata";

/**
 * Extended DecodedParameter with UI-specific fields
 */
export interface EnrichedDecodedParameter extends GovTrackerDecodedParameter {
  /** Block explorer link for address parameters */
  link?: string;
  /** Chain label for display (Arb1, Nova, L1) */
  chainLabel?: string;
}

/**
 * Extended DecodedCalldata with enriched parameters
 */
export interface EnrichedDecodedCalldata
  extends Omit<GovTrackerDecodedCalldata, "parameters"> {
  parameters: EnrichedDecodedParameter[] | null;
}

/**
 * Enrich a single parameter with explorer links and chain labels
 */
function enrichParameter(
  param: GovTrackerDecodedParameter,
  chainContext: ChainContext
): EnrichedDecodedParameter {
  const enriched: EnrichedDecodedParameter = { ...param };

  // Add explorer link and chain label for addresses
  if (param.type === "address") {
    enriched.link = getAddressExplorerUrl(param.value, chainContext);
    enriched.chainLabel = getChainLabel(chainContext);
  }

  // Recursively enrich nested calldata
  if (param.nested) {
    enriched.nested = enrichDecodedCalldata(param.nested, chainContext);
  }

  // Recursively enrich nested array
  if (param.nestedArray) {
    enriched.nestedArray = param.nestedArray.map((nested) =>
      enrichDecodedCalldata(nested, chainContext)
    );
  }

  return enriched;
}

/**
 * Enrich decoded calldata with UI-specific fields
 */
function enrichDecodedCalldata(
  decoded: GovTrackerDecodedCalldata,
  chainContext: ChainContext
): EnrichedDecodedCalldata {
  return {
    ...decoded,
    parameters: decoded.parameters
      ? decoded.parameters.map((p) => enrichParameter(p, chainContext))
      : null,
  };
}

/**
 * Decode calldata and enrich with UI-specific fields
 *
 * This is a drop-in replacement for the old decodeCalldata function that
 * adds explorer links and chain labels to the decoded result.
 */
export async function decodeCalldata(
  calldata: string,
  targetAddress?: string,
  depth = 0,
  chainContext: ChainContext = "arb1"
): Promise<EnrichedDecodedCalldata> {
  const decoded = await govTrackerDecodeCalldata(
    calldata,
    targetAddress,
    depth,
    chainContext
  );
  return enrichDecodedCalldata(decoded, chainContext);
}
