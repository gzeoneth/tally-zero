import { BigNumber } from "ethers";

/**
 * Format voting power from wei (18 decimals) to human-readable format with K/M/B suffixes
 *
 * @param weiValue - Voting power in wei as string
 * @returns Formatted string with appropriate suffix (K, M, B)
 *
 * @example
 * formatVotingPower("1234567890000000000000000") // "1.23M"
 * formatVotingPower("5000000000000000000000") // "5K"
 * formatVotingPower("1500000000000000000000000000") // "1.5B"
 * formatVotingPower("0") // "0"
 */
export function formatVotingPower(weiValue: string): string {
  try {
    // Handle empty or invalid input
    if (!weiValue || weiValue === "0") {
      return "0";
    }

    // Parse wei value to BigNumber
    const bn = BigNumber.from(weiValue);

    // Convert from wei to token units (18 decimals)
    const value = parseFloat(bn.toString()) / Math.pow(10, 18);

    // Format with appropriate suffix
    const billion = 1_000_000_000;
    const million = 1_000_000;
    const thousand = 1_000;

    if (value >= billion) {
      const formatted = (value / billion).toFixed(2);
      // Remove unnecessary trailing zeros
      return `${parseFloat(formatted)}B`;
    } else if (value >= million) {
      const formatted = (value / million).toFixed(2);
      return `${parseFloat(formatted)}M`;
    } else if (value >= thousand) {
      const formatted = (value / thousand).toFixed(2);
      return `${parseFloat(formatted)}K`;
    } else {
      // For values less than 1000, show up to 2 decimal places
      const formatted = value.toFixed(2);
      return parseFloat(formatted).toString();
    }
  } catch (error) {
    // If parsing fails, return "0" as fallback
    console.error("Error formatting voting power:", error);
    return "0";
  }
}

/**
 * Shorten an Ethereum address to format: 0x1234...5678
 *
 * @param address - Full Ethereum address
 * @param chars - Number of characters to show on each side (default: 4)
 * @returns Shortened address string
 *
 * @example
 * shortenAddress("0x1234567890abcdef1234567890abcdef12345678") // "0x1234...5678"
 * shortenAddress("0x1234567890abcdef1234567890abcdef12345678", 6) // "0x123456...345678"
 */
export function shortenAddress(address: string, chars: number = 4): string {
  try {
    // Validate address format
    if (!address || !address.startsWith("0x") || address.length !== 42) {
      return address; // Return as-is if invalid
    }

    // Ensure chars is positive and not too large
    const safeChars = Math.max(1, Math.min(chars, 20));

    // Extract prefix (0x + chars) and suffix (chars)
    const prefix = address.slice(0, 2 + safeChars);
    const suffix = address.slice(-safeChars);

    return `${prefix}...${suffix}`;
  } catch (error) {
    console.error("Error shortening address:", error);
    return address;
  }
}

/**
 * Format a number with K/M/B suffixes for compact display
 *
 * @param value - Number to format (already in display units, not wei)
 * @param options - Formatting options
 * @param options.decimals - Number of decimal places (default: 2)
 * @param options.trimTrailingZeros - Whether to remove trailing zeros (default: true)
 * @returns Formatted string with appropriate suffix
 *
 * @example
 * formatCompactNumber(1234) // "1.23K"
 * formatCompactNumber(1500000) // "1.5M"
 * formatCompactNumber(1500000000) // "1.5B"
 * formatCompactNumber(500) // "500"
 */
export function formatCompactNumber(
  value: number | string,
  options: { decimals?: number; trimTrailingZeros?: boolean } = {}
): string {
  const { decimals = 2, trimTrailingZeros = true } = options;

  const num = typeof value === "string" ? parseFloat(value) : value;

  if (isNaN(num)) return "0";
  if (num === 0) return "0";

  const billion = 1_000_000_000;
  const million = 1_000_000;
  const thousand = 1_000;

  let result: string;

  if (Math.abs(num) >= billion) {
    result = (num / billion).toFixed(decimals) + "B";
  } else if (Math.abs(num) >= million) {
    result = (num / million).toFixed(decimals) + "M";
  } else if (Math.abs(num) >= thousand) {
    result = (num / thousand).toFixed(decimals) + "K";
  } else {
    result = num.toLocaleString(undefined, { maximumFractionDigits: decimals });
    return result; // Don't trim for small numbers
  }

  // Trim trailing zeros if requested (e.g., "1.50M" -> "1.5M")
  if (trimTrailingZeros) {
    result = result.replace(/\.?0+([KMB])$/, "$1");
  }

  return result;
}

/**
 * Format cache age from a timestamp to human-readable format
 *
 * @param generatedAt - Date string or Date object of when cache was generated
 * @returns Human-readable age string (e.g., "2d 5h", "3h", "< 1h")
 */
export function formatCacheAge(generatedAt: string | Date): string {
  const generatedDate =
    typeof generatedAt === "string" ? new Date(generatedAt) : generatedAt;
  const ageMs = Date.now() - generatedDate.getTime();
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
  const ageDays = Math.floor(ageHours / 24);

  if (ageDays > 0) {
    return `${ageDays}d ${ageHours % 24}h`;
  } else if (ageHours > 0) {
    return `${ageHours}h`;
  }
  return "< 1h";
}
