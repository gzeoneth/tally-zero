import localSignatures from "@data/function-signatures.json";
import knownAddresses from "@data/known-addresses.json";
import { ethers } from "ethers";

const FOURBYTE_API = "https://www.4byte.directory/api/v1/signatures/";
const CACHE_KEY_PREFIX = "tally-zero-4byte-";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Retryable ticket magic address - bytes are ABI encoded tuple, not calldata
const RETRYABLE_TICKET_MAGIC = "0xa723c008e76e379c55599d2e4d93879beafda79c";

// Inbox addresses to identify chain
const ARB1_INBOX = "0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f";
const NOVA_INBOX = "0xc4448b71118c9071bcb9734a0eac55d18a153949";

// Block explorer URLs
const EXPLORERS = {
  ethereum: "https://etherscan.io",
  arb1: "https://arbiscan.io",
  nova: "https://nova.arbiscan.io",
} as const;

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

export type ChainContext = "arb1" | "nova" | "ethereum";

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
 * Get explorer URL for an address based on chain
 */
export function getExplorerUrl(address: string, chain: ChainContext): string {
  return `${EXPLORERS[chain]}/address/${address}`;
}

/**
 * Get chain label for display
 */
export function getChainLabel(chain: ChainContext): string {
  switch (chain) {
    case "arb1":
      return "Arb1";
    case "nova":
      return "Nova";
    case "ethereum":
      return "L1";
  }
}

/**
 * Look up known address label
 */
export function getAddressLabel(
  address: string,
  chain: ChainContext
): string | undefined {
  const chainAddresses = knownAddresses.addresses[chain] as
    | Record<string, string>
    | undefined;
  if (!chainAddresses) return undefined;

  // Try exact match first
  if (chainAddresses[address]) {
    return chainAddresses[address];
  }

  // Try case-insensitive match
  const lowerAddress = address.toLowerCase();
  for (const [addr, label] of Object.entries(chainAddresses)) {
    if (addr.toLowerCase() === lowerAddress) {
      return label;
    }
  }

  return undefined;
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
 * Check if target is the retryable ticket magic address
 */
export function isRetryableTicketMagic(target: string): boolean {
  return target.toLowerCase() === RETRYABLE_TICKET_MAGIC;
}

/**
 * Decode retryable ticket data from bytes (not calldata - raw ABI encoded tuple)
 */
export function decodeRetryableTicket(
  bytes: string
): RetryableTicketData | null {
  try {
    const abiCoder = new ethers.utils.AbiCoder();
    // Decode as tuple: (address, address, uint256, uint256, uint256, bytes)
    const decoded = abiCoder.decode(
      ["address", "address", "uint256", "uint256", "uint256", "bytes"],
      bytes
    );

    const targetInbox = decoded[0].toLowerCase();
    let chain: "arb1" | "nova" | "unknown" = "unknown";
    if (targetInbox === ARB1_INBOX) {
      chain = "arb1";
    } else if (targetInbox === NOVA_INBOX) {
      chain = "nova";
    }

    return {
      targetInbox: decoded[0],
      l2Target: decoded[1],
      l2Value: decoded[2].toString(),
      gasLimit: decoded[3].toString(),
      maxFeePerGas: decoded[4].toString(),
      l2Calldata: decoded[5],
      chain,
    };
  } catch (error) {
    console.warn("Failed to decode retryable ticket:", error);
    return null;
  }
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
  signature: string,
  chainContext: ChainContext = "arb1"
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

      let link: string | undefined;
      let chainLabel: string | undefined;
      let addressLabel: string | undefined;
      if (type === "address") {
        link = getExplorerUrl(String(value), chainContext);
        chainLabel = getChainLabel(chainContext);
        addressLabel = getAddressLabel(String(value), chainContext);
      }

      return {
        name: `arg${index}`,
        type,
        value: formattedValue,
        isNested: isNested || isBytesArray,
        link,
        chainLabel,
        addressLabel,
        // Store raw bytes array for later decoding
        _rawBytesArray: isBytesArray ? value.map(String) : undefined,
      } as DecodedParameter & { _rawBytesArray?: string[] };
    });
  } catch (error) {
    console.warn("Failed to decode parameters:", error);
    return null;
  }
}

export async function decodeCalldata(
  calldata: string,
  _targetAddress?: string,
  depth = 0,
  chainContext: ChainContext = "arb1"
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

  // Determine context for nested calls based on function
  // sendTxToL1 means nested content is on L1 (ethereum)
  const isSendTxToL1 = selector === "0x928c169a";
  const nestedContext: ChainContext = isSendTxToL1 ? "ethereum" : chainContext;

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

    // For scheduleBatch, get the targets array to check for retryable ticket magic
    let targets: string[] = [];
    const addressArrayIndex = paramTypes.indexOf("address[]");
    if (addressArrayIndex !== -1) {
      try {
        const decoded = abiCoder.decode(paramTypes, "0x" + calldata.slice(10));
        targets = decoded[addressArrayIndex].map((a: string) =>
          a.toLowerCase()
        );
      } catch {
        // Ignore
      }
    }

    for (const param of params) {
      if (!param.isNested) continue;

      const paramIndex = params.indexOf(param);
      const paramType = paramTypes[paramIndex];

      try {
        const decoded = abiCoder.decode(paramTypes, "0x" + calldata.slice(10));

        // Handle bytes[] array - decode each element
        if (paramType === "bytes[]" && param._rawBytesArray) {
          const nestedArray: DecodedCalldata[] = [];
          for (let i = 0; i < param._rawBytesArray.length; i++) {
            const bytesItem = param._rawBytesArray[i];
            const target = targets[i];

            // Check if this is a retryable ticket (target is magic address)
            if (target && isRetryableTicketMagic(target)) {
              const retryable = decodeRetryableTicket(bytesItem);
              if (retryable) {
                // Determine the L2 chain for this retryable
                const l2Chain: ChainContext =
                  retryable.chain === "arb1"
                    ? "arb1"
                    : retryable.chain === "nova"
                      ? "nova"
                      : "arb1";
                const chainLabel =
                  retryable.chain === "arb1"
                    ? "Arbitrum One"
                    : retryable.chain === "nova"
                      ? "Nova"
                      : "Unknown L2";

                // Decode the l2Calldata if it looks like calldata (on the L2 chain)
                let nestedL2Call: DecodedCalldata | undefined;
                if (isLikelyCalldata(retryable.l2Calldata)) {
                  nestedL2Call = await decodeCalldata(
                    retryable.l2Calldata,
                    retryable.l2Target,
                    depth + 1,
                    l2Chain // L2 calldata is on the target chain
                  );
                }

                const retryableDecoded: DecodedCalldata = {
                  selector: "",
                  functionName: `Retryable Ticket → ${chainLabel}`,
                  signature: null,
                  parameters: [
                    {
                      name: "inbox",
                      type: "address",
                      value: retryable.targetInbox,
                      isNested: false,
                      link: getExplorerUrl(retryable.targetInbox, "ethereum"),
                      chainLabel: "L1",
                      addressLabel: getAddressLabel(
                        retryable.targetInbox,
                        "ethereum"
                      ),
                    },
                    {
                      name: "l2Target",
                      type: "address",
                      value: retryable.l2Target,
                      isNested: false,
                      link: getExplorerUrl(retryable.l2Target, l2Chain),
                      chainLabel: getChainLabel(l2Chain),
                      addressLabel: getAddressLabel(
                        retryable.l2Target,
                        l2Chain
                      ),
                    },
                    {
                      name: "l2Value",
                      type: "uint256",
                      value: formatDecodedValue(
                        ethers.BigNumber.from(retryable.l2Value),
                        "uint256"
                      ),
                      isNested: false,
                    },
                    {
                      name: "gasLimit",
                      type: "uint256",
                      value: retryable.gasLimit,
                      isNested: false,
                    },
                    {
                      name: "maxFeePerGas",
                      type: "uint256",
                      value: retryable.maxFeePerGas,
                      isNested: false,
                    },
                    {
                      name: "l2Calldata",
                      type: "bytes",
                      value: retryable.l2Calldata,
                      isNested: !!nestedL2Call,
                      nested: nestedL2Call,
                    },
                  ],
                  raw: bytesItem,
                  decodingSource: "local",
                };
                nestedArray.push(retryableDecoded);
                continue;
              }
            }

            // Normal calldata decoding (use nestedContext for chain)
            if (isLikelyCalldata(bytesItem)) {
              const decodedItem = await decodeCalldata(
                bytesItem,
                target,
                depth + 1,
                nestedContext
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
            param.nested = await decodeCalldata(
              rawBytes,
              undefined,
              depth + 1,
              nestedContext
            );
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
    const params = decodeParameters(calldata, localSignature, chainContext);
    const functionName = localSignature.split("(")[0];

    // For sendTxToL1, fix the first parameter (address) to use ethereum context
    if (isSendTxToL1 && params && params[0]?.type === "address") {
      const addr = params[0].value;
      params[0].link = getExplorerUrl(addr, "ethereum");
      params[0].chainLabel = getChainLabel("ethereum");
      params[0].addressLabel = getAddressLabel(addr, "ethereum");
    }

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
    const params = decodeParameters(calldata, apiSignature, chainContext);
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
