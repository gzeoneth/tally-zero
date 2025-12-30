import localSignatures from "@data/function-signatures.json";

import { STORAGE_PREFIX } from "@/config/storage-keys";
import { MS_PER_DAY } from "@/lib/date-utils";
import { debug } from "@/lib/debug";
import { getStoredValue, setStoredValue } from "@/lib/storage-utils";

const FOURBYTE_API = "https://www.4byte.directory/api/v1/signatures/";
const CACHE_KEY_PREFIX = `${STORAGE_PREFIX}-4byte-`;
const CACHE_TTL_MS = MS_PER_DAY; // 24 hours

// In-memory cache for session
const sessionCache = new Map<
  string,
  { signature: string | null; timestamp: number }
>();

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
  const stored = getStoredValue<{
    signature: string | null;
    timestamp: number;
  } | null>(CACHE_KEY_PREFIX + normalizedSelector, null);
  if (stored && Date.now() - stored.timestamp < CACHE_TTL_MS) {
    sessionCache.set(normalizedSelector, stored);
    return stored.signature;
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
    setStoredValue(CACHE_KEY_PREFIX + normalizedSelector, cacheEntry);

    return signature;
  } catch (error) {
    debug.calldata("4byte.directory lookup failed: %O", error);
    return null;
  }
}
