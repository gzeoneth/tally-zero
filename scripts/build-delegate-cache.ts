/**
 * Build Delegate Cache Script
 *
 * Fetches all DelegateVotesChanged events from ARB token contract and saves them as a JSON cache.
 * This cache provides a snapshot of all delegates with their current voting power.
 *
 * Usage:
 *   yarn cache:build:delegates      # Production: from block 70398215
 *   yarn cache:build:delegates:dev  # Development: from block 362589350
 *   yarn cache:build:delegates:force # Force full refresh
 *
 * Environment variables:
 *   START_BLOCK - Override the starting block (default depends on mode)
 *   RPC_URL - Override the RPC URL (default: https://arb1.arbitrum.io/rpc)
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

import { addressesEqual } from "../lib/address-utils";
import { delay } from "../lib/delay-utils";
import type { DelegateCache, DelegateInfo } from "../types/delegate";
import type { Address } from "../types/search";

// Configuration
const ARBITRUM_CHAIN_ID = 42161;
const ARBITRUM_RPC_URL = process.env.RPC_URL || "https://arb1.arbitrum.io/rpc";

// Production start block (first governance proposal era)
const PRODUCTION_START_BLOCK = 70398215;

// Development start block (for faster testing)
const DEV_START_BLOCK = 362589350;

// ARB token contract
const ARB_TOKEN_ADDRESS = "0x912CE59144191C1204E64559FE8253a0e49E6548";

// Excluded address (system address to filter out)
const EXCLUDED_ADDRESS = "0x00000000000000000000000000000000000A4B86";

// Minimum voting power threshold (10 ARB = 10^19 wei)
// Delegates with less than this are excluded to reduce cache size
const MIN_VOTING_POWER = BigInt("10000000000000000000");

// Minimal ABI for ARB token
const ARB_TOKEN_ABI = [
  "event DelegateVotesChanged(address indexed delegate, uint256 previousBalance, uint256 newBalance)",
  "function totalSupply() view returns (uint256)",
];

// Block range for queries (ARB token has many delegate events, use smaller chunks)
// Note: 1M blocks can timeout on public RPC during high-activity periods
const BLOCK_RANGE = 1_000_000;

// Minimum block range when response size is exceeded
// During ARB airdrop period, even 5K blocks can exceed 10K logs
const MIN_BLOCK_RANGE = 1_000;

// Delay between queries to avoid rate limiting
const QUERY_DELAY_MS = 100;

function isLogResponseSizeError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message;
    return (
      msg.includes("Log response size exceeded") ||
      msg.includes("logs matched by query exceeds limit")
    );
  }
  return false;
}

interface BlockRange {
  from: number;
  to: number;
  chunkSize: number;
}

const CONSECUTIVE_SUCCESS_TO_INCREASE = 3;

async function fetchEventsForRange(
  contract: ethers.Contract,
  filter: ethers.EventFilter,
  fromBlock: number,
  toBlock: number,
  initialChunkSize: number,
  onEvents: (events: ethers.Event[]) => void
): Promise<void> {
  const pending: BlockRange[] = [
    { from: fromBlock, to: toBlock, chunkSize: initialChunkSize },
  ];
  let consecutiveSuccesses = 0;
  let currentChunkSize = initialChunkSize;

  while (pending.length > 0) {
    const range = pending.shift()!;

    try {
      await delay(QUERY_DELAY_MS);
      const chunkEvents = await contract.queryFilter(
        filter,
        range.from,
        range.to
      );

      // Process immediately, don't accumulate
      onEvents(chunkEvents);

      // Track consecutive successes for chunk size recovery
      if (range.chunkSize < initialChunkSize) {
        consecutiveSuccesses++;
        if (consecutiveSuccesses >= CONSECUTIVE_SUCCESS_TO_INCREASE) {
          const newChunkSize = Math.min(initialChunkSize, range.chunkSize * 2);
          if (newChunkSize > currentChunkSize) {
            console.log(
              `\n  ${consecutiveSuccesses} consecutive successes, increasing chunk to ${newChunkSize} blocks`
            );
            currentChunkSize = newChunkSize;
          }
          consecutiveSuccesses = 0;
        }
      }

      // Update pending ranges to use recovered chunk size
      for (const p of pending) {
        if (p.chunkSize < currentChunkSize) {
          p.chunkSize = currentChunkSize;
        }
      }
    } catch (error) {
      if (isLogResponseSizeError(error) && range.chunkSize > MIN_BLOCK_RANGE) {
        const newChunkSize = Math.max(
          MIN_BLOCK_RANGE,
          Math.floor(range.chunkSize / 2)
        );
        console.log(
          `\n  Response size exceeded for ${range.from}-${range.to}, reducing chunk to ${newChunkSize} blocks`
        );

        currentChunkSize = newChunkSize;
        consecutiveSuccesses = 0;

        // Split into smaller ranges and add to front of queue (process in order)
        const subRanges: BlockRange[] = [];
        for (let start = range.from; start <= range.to; start += newChunkSize) {
          const end = Math.min(start + newChunkSize - 1, range.to);
          subRanges.push({ from: start, to: end, chunkSize: newChunkSize });
        }
        pending.unshift(...subRanges);
      } else {
        throw new Error(
          `Failed to fetch events for block range ${range.from}-${range.to}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }
}

async function fetchDelegateEvents(
  provider: ethers.providers.JsonRpcProvider,
  startBlock: number,
  currentBlock: number,
  onProgress: (processed: number, total: number) => void
): Promise<Map<string, DelegateInfo>> {
  const contract = new ethers.Contract(
    ARB_TOKEN_ADDRESS,
    ARB_TOKEN_ABI,
    provider
  );
  const delegateVotesChangedFilter = contract.filters.DelegateVotesChanged();

  const totalBlocks = currentBlock - startBlock;
  let processedBlocks = 0;
  let eventsProcessed = 0;

  // Build delegate map directly instead of accumulating events
  const delegateMap = new Map<string, DelegateInfo>();

  // Process chunks sequentially with adaptive sizing
  for (
    let fromBlock = startBlock;
    fromBlock <= currentBlock;
    fromBlock += BLOCK_RANGE
  ) {
    const toBlock = Math.min(fromBlock + BLOCK_RANGE - 1, currentBlock);

    await fetchEventsForRange(
      contract,
      delegateVotesChangedFilter,
      fromBlock,
      toBlock,
      BLOCK_RANGE,
      (chunkEvents) => {
        for (const event of chunkEvents) {
          const args = event.args!;
          const { delegate, newBalance } = args;

          // Skip excluded address
          if (addressesEqual(delegate, EXCLUDED_ADDRESS)) {
            continue;
          }

          eventsProcessed++;

          // Update delegate map directly (keeps only latest state per delegate)
          delegateMap.set(delegate.toLowerCase(), {
            address: delegate as Address,
            votingPower: newBalance.toString(),
            lastChangeBlock: event.blockNumber,
            lastChangeTxHash: event.transactionHash,
          });
        }
      }
    );

    processedBlocks += toBlock - fromBlock + 1;
    onProgress(processedBlocks, totalBlocks);
  }

  console.log(`\n  Processed ${eventsProcessed.toLocaleString()} events`);
  return delegateMap;
}

/**
 * Load existing cache if available
 */
function loadExistingCache(outputPath: string): DelegateCache | null {
  try {
    if (fs.existsSync(outputPath)) {
      const data = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
      // Validate basic structure
      if (
        data.version === 1 &&
        data.snapshotBlock &&
        Array.isArray(data.delegates)
      ) {
        return data as DelegateCache;
      }
    }
  } catch (error) {
    console.warn("  Could not load existing cache:", error);
  }
  return null;
}

/**
 * Filter out delegates below minimum voting power and sort by voting power descending
 */
function processDelegates(
  delegateMap: Map<string, DelegateInfo>
): DelegateInfo[] {
  const delegates: DelegateInfo[] = [];

  for (const delegate of delegateMap.values()) {
    // Filter out delegates below minimum threshold
    if (BigInt(delegate.votingPower) >= MIN_VOTING_POWER) {
      delegates.push(delegate);
    }
  }

  // Sort by voting power descending (BigInt subtraction for comparison)
  delegates.sort((a, b) => {
    const diff = BigInt(b.votingPower) - BigInt(a.votingPower);
    return diff > BigInt(0) ? 1 : diff < BigInt(0) ? -1 : 0;
  });

  return delegates;
}

/**
 * Calculate total voting power from delegates
 */
function calculateTotalVotingPower(delegates: DelegateInfo[]): string {
  let total = BigInt(0);

  for (const delegate of delegates) {
    total = total + BigInt(delegate.votingPower);
  }

  return total.toString();
}

/**
 * Merge existing cache with new delegate map
 */
function mergeWithExistingCache(
  existingCache: DelegateCache | null,
  newDelegateMap: Map<string, DelegateInfo>
): Map<string, DelegateInfo> {
  const delegateMap = new Map<string, DelegateInfo>();

  // Start with existing delegates if available
  if (existingCache) {
    for (const delegate of existingCache.delegates) {
      delegateMap.set(delegate.address.toLowerCase(), delegate);
    }
  }

  // Apply new delegates (overwrites existing)
  for (const [address, delegate] of newDelegateMap.entries()) {
    delegateMap.set(address, delegate);
  }

  return delegateMap;
}

async function main() {
  const isDev = process.argv.includes("--dev");
  const forceRefresh = process.argv.includes("--force");
  const outputPath = path.join(__dirname, "..", "data", "delegate-cache.json");

  console.log("========================================");
  console.log("  Arbitrum Delegate Cache Builder");
  console.log("========================================");
  console.log(`Mode: ${isDev ? "Development" : "Production"}`);
  console.log(`RPC URL: ${ARBITRUM_RPC_URL}`);
  console.log(`Force refresh: ${forceRefresh}`);
  console.log("");

  // Check for existing cache
  const existingCache = forceRefresh ? null : loadExistingCache(outputPath);

  // Determine start block
  let startBlock: number;

  if (existingCache) {
    // Incremental update: start from existing snapshot + 1
    startBlock = existingCache.snapshotBlock + 1;
    console.log(
      `Found existing cache with ${existingCache.delegates.length} delegates`
    );
    console.log(
      `Last snapshot block: ${existingCache.snapshotBlock.toLocaleString()}`
    );
    console.log(
      `Updating incrementally from block ${startBlock.toLocaleString()}`
    );
  } else {
    // Fresh build: use configured start block
    startBlock = process.env.START_BLOCK
      ? parseInt(process.env.START_BLOCK, 10)
      : isDev
        ? DEV_START_BLOCK
        : PRODUCTION_START_BLOCK;
    console.log(
      `Building fresh cache from block ${startBlock.toLocaleString()}`
    );
  }
  console.log("");

  // Connect to provider
  console.log("Connecting to Arbitrum...");
  const provider = new ethers.providers.StaticJsonRpcProvider(ARBITRUM_RPC_URL);
  await provider.ready;
  const currentBlock = await provider.getBlockNumber();
  console.log(`Current block: ${currentBlock.toLocaleString()}`);

  const blocksToScan = currentBlock - startBlock;
  if (blocksToScan <= 0) {
    console.log("\nCache is already up to date!");
    return;
  }

  console.log(`Blocks to scan: ${blocksToScan.toLocaleString()}`);
  console.log("");

  // Fetch delegate events
  console.log("Fetching DelegateVotesChanged events...");
  console.log(`  Token: ${ARB_TOKEN_ADDRESS}`);
  console.log(`  Excluded address: ${EXCLUDED_ADDRESS}`);

  const newDelegateMap = await fetchDelegateEvents(
    provider,
    startBlock,
    currentBlock,
    (processed, total) => {
      const percent = Math.round((processed / total) * 100);
      process.stdout.write(`\r  Progress: ${percent}%`);
    }
  );

  console.log(`  Found ${newDelegateMap.size} unique delegates in range`);

  // Merge with existing cache
  console.log("\nProcessing delegates...");
  const delegateMap = mergeWithExistingCache(existingCache, newDelegateMap);

  // Filter and sort delegates
  const delegates = processDelegates(delegateMap);
  console.log(`  Delegates with voting power: ${delegates.length}`);

  // Calculate totals
  const totalVotingPower = calculateTotalVotingPower(delegates);

  // Fetch total supply
  console.log("\nFetching ARB token total supply...");
  const contract = new ethers.Contract(
    ARB_TOKEN_ADDRESS,
    ARB_TOKEN_ABI,
    provider
  );
  const totalSupply = await contract.totalSupply();
  console.log(`  Total supply: ${ethers.utils.formatEther(totalSupply)} ARB`);

  // Create cache object
  const cache: DelegateCache = {
    version: 1,
    generatedAt: new Date().toISOString(),
    snapshotBlock: currentBlock,
    startBlock: existingCache?.startBlock ?? startBlock,
    chainId: ARBITRUM_CHAIN_ID,
    totalVotingPower: totalVotingPower,
    totalSupply: totalSupply.toString(),
    delegates,
    stats: {
      totalDelegates: delegates.length,
    },
  };

  // Write to file
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(cache, null, 2));

  console.log("\n========================================");
  console.log("  Cache Build Complete!");
  console.log("========================================");
  console.log(`Output: ${outputPath}`);
  console.log(`Total delegates: ${delegates.length}`);
  console.log(`Snapshot block: ${currentBlock.toLocaleString()}`);
  console.log(
    `File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`
  );
  console.log("");

  // Summary statistics
  const topDelegates = delegates.slice(0, 10);
  console.log("Top 10 delegates by voting power:");
  for (let i = 0; i < topDelegates.length; i++) {
    const delegate = topDelegates[i];
    const votingPowerETH = ethers.utils.formatEther(delegate.votingPower);
    const percentage = (
      (parseFloat(votingPowerETH) /
        parseFloat(ethers.utils.formatEther(totalSupply))) *
      100
    ).toFixed(4);
    console.log(
      `  ${i + 1}. ${delegate.address} - ${parseFloat(votingPowerETH).toLocaleString()} ARB (${percentage}%)`
    );
  }

  console.log("");
  console.log("Distribution summary:");
  const totalVotingPowerETH = parseFloat(
    ethers.utils.formatEther(totalVotingPower)
  );
  const totalSupplyETH = parseFloat(ethers.utils.formatEther(totalSupply));
  const delegatedPercentage = (
    (totalVotingPowerETH / totalSupplyETH) *
    100
  ).toFixed(2);
  console.log(
    `  Total voting power: ${totalVotingPowerETH.toLocaleString()} ARB`
  );
  console.log(`  Percentage delegated: ${delegatedPercentage}%`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
