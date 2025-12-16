import localSignatures from "@data/function-signatures.json";
import { ethers } from "ethers";

const FOURBYTE_API = "https://www.4byte.directory/api/v1/signatures/";
const CACHE_KEY_PREFIX = "tally-zero-4byte-";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory cache for session
const sessionCache = new Map<
  string,
  { signature: string | null; timestamp: number }
>();

export interface DecodedCalldata {
  selector: string;
  functionName: string | null;
  signature: string | null;
  parameters: DecodedParameter[] | null;
  raw: string;
  decodingSource: "local" | "api" | "failed";
}

export interface DecodedParameter {
  name: string;
  type: string;
  value: string;
  isNested: boolean;
  nested?: DecodedCalldata;
  // For bytes[] arrays - each element decoded
  nestedArray?: DecodedCalldata[];
}

/**
 * Look up function signature in local registry
 */
export function lookupLocalSignature(selector: string): string | null {
  const normalizedSelector = selector.toLowerCase();
  const signatures = localSignatures.signatures as Record<string, string>;
  return signatures[normalizedSelector] || null;
}

/**
 * Query 4byte.directory API with caching
 */
export async function lookup4byteDirectory(
  selector: string
): Promise<string | null> {
  const normalizedSelector = selector.toLowerCase();

  // Check session cache
  const cached = sessionCache.get(normalizedSelector);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.signature;
  }

  // Check localStorage cache
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(
        CACHE_KEY_PREFIX + normalizedSelector
      );
      if (stored) {
        const parsed = JSON.parse(stored) as {
          signature: string | null;
          timestamp: number;
        };
        if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          sessionCache.set(normalizedSelector, parsed);
          return parsed.signature;
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  // Fetch from API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `${FOURBYTE_API}?hex_signature=${normalizedSelector}`,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      results?: { text_signature: string }[];
    };

    const signature = data.results?.[0]?.text_signature ?? null;

    // Cache the result
    const cacheEntry = { signature, timestamp: Date.now() };
    sessionCache.set(normalizedSelector, cacheEntry);

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          CACHE_KEY_PREFIX + normalizedSelector,
          JSON.stringify(cacheEntry)
        );
      } catch {
        // Ignore localStorage errors
      }
    }

    return signature;
  } catch (error) {
    console.warn("4byte.directory lookup failed:", error);
    return null;
  }
}

/**
 * Parse complex parameter types from signature
 */
function parseParamTypes(typesStr: string): string[] {
  if (!typesStr.trim()) return [];

  const types: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of typesStr) {
    if (char === "(" || char === "[") depth++;
    if (char === ")" || char === "]") depth--;

    if (char === "," && depth === 0) {
      if (current.trim()) types.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) types.push(current.trim());
  return types;
}

/**
 * Check if a value looks like calldata (for nested decoding)
 */
export function isLikelyCalldata(value: string): boolean {
  if (!value.startsWith("0x")) return false;
  if (value.length < 10) return false;
  // Must have at least 4-byte selector
  return /^0x[a-f0-9]{8,}$/i.test(value);
}

/**
 * Format decoded value for display
 */
export function formatDecodedValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return "null";

  // Handle BigNumber
  if (ethers.BigNumber.isBigNumber(value)) {
    // Check if likely an ETH value (> 0.001 ETH and type is uint256)
    if (
      type.includes("uint256") &&
      value.gt(ethers.utils.parseEther("0.001"))
    ) {
      try {
        const ethValue = ethers.utils.formatEther(value);
        if (parseFloat(ethValue) < 1000000) {
          return `${value.toString()} (${ethValue} ETH)`;
        }
      } catch {
        // Fall through to default
      }
    }
    return value.toString();
  }

  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const formatted = value.map((v) =>
      formatDecodedValue(v, type.replace("[]", ""))
    );
    return `[${formatted.join(", ")}]`;
  }

  // Handle bytes and hex strings
  if (type === "bytes" || type.startsWith("bytes")) {
    const str = String(value);
    // Truncate long bytes for display
    if (str.length > 66) {
      return str.slice(0, 34) + "..." + str.slice(-32);
    }
    return str;
  }

  return String(value);
}

/**
 * Decode parameters using ethers.js AbiCoder
 */
export function decodeParameters(
  calldata: string,
  signature: string
): DecodedParameter[] | null {
  try {
    // Extract parameter types from signature
    const match = signature.match(/\(([^)]*)\)/);
    if (!match) return null;

    const paramTypesStr = match[1];
    if (!paramTypesStr) return [];

    const paramTypes = parseParamTypes(paramTypesStr);
    if (paramTypes.length === 0) return [];

    const encodedParams = "0x" + calldata.slice(10);

    const abiCoder = new ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(paramTypes, encodedParams);

    return paramTypes.map((type, index) => {
      const value = decoded[index];
      const formattedValue = formatDecodedValue(value, type);
      const rawValue = type === "bytes" ? String(value) : formattedValue;
      const isNested = type === "bytes" && isLikelyCalldata(rawValue);
      // Check for bytes[] array type
      const isBytesArray = type === "bytes[]" && Array.isArray(value);

      return {
        name: `arg${index}`,
        type,
        value: formattedValue,
        isNested: isNested || isBytesArray,
        // Store raw bytes array for later decoding
        _rawBytesArray: isBytesArray ? value.map(String) : undefined,
      } as DecodedParameter & { _rawBytesArray?: string[] };
    });
  } catch (error) {
    console.warn("Failed to decode parameters:", error);
    return null;
  }
}

/**
 * Main entry point - decode calldata
 */
export async function decodeCalldata(
  calldata: string,
  _targetAddress?: string,
  depth = 0
): Promise<DecodedCalldata> {
  const MAX_DEPTH = 3;

  // Handle empty or invalid calldata
  if (!calldata || calldata === "0x" || calldata.length < 10) {
    return {
      selector: "",
      functionName: null,
      signature: null,
      parameters: null,
      raw: calldata,
      decodingSource: "failed",
    };
  }

  const selector = calldata.slice(0, 10).toLowerCase();

  // Helper to process nested calldata in params
  async function processNestedParams(
    params: (DecodedParameter & { _rawBytesArray?: string[] })[] | null,
    signature: string
  ): Promise<void> {
    if (!params || depth >= MAX_DEPTH) return;

    const match = signature.match(/\(([^)]*)\)/);
    if (!match) return;

    const paramTypes = parseParamTypes(match[1]);
    const abiCoder = new ethers.utils.AbiCoder();

    for (const param of params) {
      if (!param.isNested) continue;

      const paramIndex = params.indexOf(param);
      const paramType = paramTypes[paramIndex];

      try {
        const decoded = abiCoder.decode(paramTypes, "0x" + calldata.slice(10));

        // Handle bytes[] array - decode each element
        if (paramType === "bytes[]" && param._rawBytesArray) {
          const nestedArray: DecodedCalldata[] = [];
          for (const bytesItem of param._rawBytesArray) {
            if (isLikelyCalldata(bytesItem)) {
              const decodedItem = await decodeCalldata(
                bytesItem,
                undefined,
                depth + 1
              );
              nestedArray.push(decodedItem);
            }
          }
          if (nestedArray.length > 0) {
            param.nestedArray = nestedArray;
          }
          // Clean up temp property
          delete param._rawBytesArray;
        }
        // Handle single bytes - decode nested
        else if (paramType === "bytes") {
          const rawBytes = String(decoded[paramIndex]);
          if (isLikelyCalldata(rawBytes)) {
            param.nested = await decodeCalldata(rawBytes, undefined, depth + 1);
            param.value = rawBytes;
          }
        }
      } catch {
        // Ignore nested decoding errors
      }
    }
  }

  // 1. Try local registry first
  const localSignature = lookupLocalSignature(selector);
  if (localSignature) {
    const params = decodeParameters(calldata, localSignature);
    const functionName = localSignature.split("(")[0];

    // Recursively decode nested calldata
    await processNestedParams(params, localSignature);

    return {
      selector,
      functionName,
      signature: localSignature,
      parameters: params,
      raw: calldata,
      decodingSource: "local",
    };
  }

  // 2. Try 4byte.directory API
  const apiSignature = await lookup4byteDirectory(selector);
  if (apiSignature) {
    const params = decodeParameters(calldata, apiSignature);
    const functionName = apiSignature.split("(")[0];

    // Recursively decode nested calldata
    await processNestedParams(params, apiSignature);

    return {
      selector,
      functionName,
      signature: apiSignature,
      parameters: params,
      raw: calldata,
      decodingSource: "api",
    };
  }

  // 3. Return undecoded result
  return {
    selector,
    functionName: null,
    signature: null,
    parameters: null,
    raw: calldata,
    decodingSource: "failed",
  };
}
