/**
 * Build Proposal Cache Script
 *
 * Fetches all proposals from Arbitrum governors and saves them as a JSON cache.
 * This cache is used to give clients a head start when loading the app.
 * Also tracks lifecycle stages for proposals that have progressed past voting.
 *
 * Usage:
 *   yarn cache:build          # Production: from block 70398215
 *   yarn cache:build:dev      # Development: from block 362589350
 *   yarn cache:build:force    # Force full refresh
 *
 * Environment variables:
 *   START_BLOCK - Override the starting block (default depends on mode)
 *   RPC_URL - Override the RPC URL (default: https://arb1.arbitrum.io/rpc)
 *   L1_RPC_URL - Override the L1 RPC URL (default: https://1rpc.io/eth)
 *   SKIP_STAGES - Set to "true" to skip stage tracking (faster builds)
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

import {
  areStagesComplete,
  shouldTrackStages,
  trackProposalStages,
} from "../lib/stage-tracker-core";
import type { ParsedProposal } from "../types/proposal";
import type { ProposalStage } from "../types/proposal-stage";
import type { Address } from "../types/search";

// Configuration
const ARBITRUM_CHAIN_ID = 42161;
const ARBITRUM_RPC_URL = process.env.RPC_URL || "https://arb1.arbitrum.io/rpc";
const ETHEREUM_RPC_URL = process.env.L1_RPC_URL || "https://1rpc.io/eth";
const SKIP_STAGES = process.env.SKIP_STAGES === "true";

// Production start block (first governance proposal era)
const PRODUCTION_START_BLOCK = 70398215;

// Development start block (for faster testing)
const DEV_START_BLOCK = 362589350;

// Governor contracts
const GOVERNORS = [
  {
    id: "core",
    address: "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9",
    name: "Core Governor",
  },
  {
    id: "treasury",
    address: "0x789fC99093B09aD01C34DC7251D0C89ce743e5a4",
    name: "Treasury Governor",
  },
];

// Proposal state names
const PROPOSAL_STATE_NAMES: Record<number, string> = {
  0: "pending",
  1: "active",
  2: "canceled",
  3: "defeated",
  4: "succeeded",
  5: "queued",
  6: "expired",
  7: "executed",
};

// Minimal ABI for Governor contract
const GOVERNOR_ABI = [
  "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 startBlock, uint256 endBlock, string description)",
  "function state(uint256 proposalId) view returns (uint8)",
  "function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)",
  "function quorum(uint256 blockNumber) view returns (uint256)",
];

// Block range for queries (Arbitrum RPC can handle large ranges)
const BLOCK_RANGE = 10_000_000;

// Batch size for parallel queries
const BATCH_SIZE = 3;
const DELAY_BETWEEN_BATCHES = 1000;

interface RawProposal {
  id: string;
  contractAddress: string;
  proposer: string;
  targets: string[];
  values: string[];
  signatures: string[];
  calldatas: string[];
  startBlock: string;
  endBlock: string;
  description: string;
  creationTxHash: string;
}

interface ProposalCache {
  version: number;
  generatedAt: string;
  snapshotBlock: number;
  startBlock: number;
  chainId: number;
  proposals: ParsedProposal[];
  governorStats: {
    [address: string]: {
      name: string;
      proposalCount: number;
    };
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | undefined;
  let delay = 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `  Retry ${attempt + 1}/${maxRetries + 1}: ${lastError.message}`
      );
      if (attempt < maxRetries) {
        await sleep(delay);
        delay = Math.min(delay * 2, 16000);
      }
    }
  }
  throw lastError;
}

async function batchQueryWithRateLimit<T>(
  queries: (() => Promise<T>)[],
  batchSize: number,
  delayBetweenBatches: number
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((query) => queryWithRetry(query))
    );
    results.push(...batchResults);

    if (i + batchSize < queries.length) {
      await sleep(delayBetweenBatches);
    }
  }

  return results;
}

async function fetchProposalsFromGovernor(
  provider: ethers.providers.JsonRpcProvider,
  governor: (typeof GOVERNORS)[number],
  startBlock: number,
  currentBlock: number,
  onProgress: (processed: number, total: number) => void
): Promise<RawProposal[]> {
  const contract = new ethers.Contract(
    governor.address,
    GOVERNOR_ABI,
    provider
  );
  const proposalCreatedFilter = contract.filters.ProposalCreated();

  const queries: (() => Promise<ethers.Event[]>)[] = [];
  const totalBlocks = currentBlock - startBlock;
  let processedBlocks = 0;

  // Create query chunks
  for (
    let fromBlock = startBlock;
    fromBlock <= currentBlock;
    fromBlock += BLOCK_RANGE
  ) {
    const toBlock = Math.min(fromBlock + BLOCK_RANGE - 1, currentBlock);
    const queryFromBlock = fromBlock;
    const queryToBlock = toBlock;

    queries.push(async () => {
      try {
        const events = await contract.queryFilter(
          proposalCreatedFilter,
          queryFromBlock,
          queryToBlock
        );
        processedBlocks += queryToBlock - queryFromBlock;
        onProgress(processedBlocks, totalBlocks);
        return events;
      } catch (error) {
        console.warn(
          `  Query failed for block range ${queryFromBlock}-${queryToBlock}:`,
          error instanceof Error ? error.message : error
        );
        return [];
      }
    });
  }

  console.log(`  Executing ${queries.length} queries for ${governor.name}...`);
  const allEvents = await batchQueryWithRateLimit(
    queries,
    BATCH_SIZE,
    DELAY_BETWEEN_BATCHES
  );

  const proposals: RawProposal[] = [];

  for (const events of allEvents) {
    for (const event of events) {
      const args = event.args!;
      const {
        proposalId,
        proposer,
        targets,
        signatures,
        calldatas,
        startBlock: propStartBlock,
        endBlock: propEndBlock,
        description,
      } = args;
      const values = args[3] as ethers.BigNumber[];

      proposals.push({
        id: proposalId.toString(),
        contractAddress: governor.address,
        proposer,
        targets: Array.from(targets),
        values: Array.isArray(values)
          ? values.map((v: ethers.BigNumber) => v.toString())
          : [],
        signatures: Array.from(signatures),
        calldatas: Array.from(calldatas),
        startBlock: propStartBlock.toString(),
        endBlock: propEndBlock.toString(),
        description,
        creationTxHash: event.transactionHash,
      });
    }
  }

  return proposals;
}

async function parseProposals(
  provider: ethers.providers.JsonRpcProvider,
  proposals: RawProposal[]
): Promise<ParsedProposal[]> {
  const parsed: ParsedProposal[] = [];
  const total = proposals.length;

  console.log(`\nParsing ${total} proposals (fetching state and votes)...`);

  for (let i = 0; i < proposals.length; i++) {
    const proposal = proposals[i];
    try {
      const contract = new ethers.Contract(
        proposal.contractAddress,
        GOVERNOR_ABI,
        provider
      );

      const [proposalState, votes] = await Promise.all([
        contract.state(proposal.id),
        contract.proposalVotes(proposal.id),
      ]);

      let quorum: string | undefined;
      if (proposalState !== 0) {
        try {
          const quorumBN = await contract.quorum(proposal.startBlock);
          quorum = quorumBN.toString();
        } catch {
          // Quorum fetch can fail for some states
        }
      }

      const governor = GOVERNORS.find(
        (g) =>
          g.address.toLowerCase() === proposal.contractAddress.toLowerCase()
      );

      parsed.push({
        ...proposal,
        contractAddress: proposal.contractAddress as Address,
        networkId: String(ARBITRUM_CHAIN_ID),
        state: PROPOSAL_STATE_NAMES[proposalState] || "unknown",
        governorName: governor?.name || "Unknown",
        votes: {
          againstVotes: votes.againstVotes.toString(),
          forVotes: votes.forVotes.toString(),
          abstainVotes: votes.abstainVotes.toString(),
          quorum,
        },
      });

      // Progress update
      if ((i + 1) % 10 === 0 || i === proposals.length - 1) {
        process.stdout.write(`\r  Parsed ${i + 1}/${total} proposals`);
      }

      // Small delay between individual proposal queries
      if (i < proposals.length - 1) {
        await sleep(100);
      }
    } catch (error) {
      console.warn(
        `\n  Failed to parse proposal ${proposal.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(""); // New line after progress
  return parsed;
}

/**
 * Load existing cache if available
 */
function loadExistingCache(outputPath: string): ProposalCache | null {
  try {
    if (fs.existsSync(outputPath)) {
      const data = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
      // Validate basic structure
      if (
        data.version === 1 &&
        data.snapshotBlock &&
        Array.isArray(data.proposals)
      ) {
        return data as ProposalCache;
      }
    }
  } catch (error) {
    console.warn("  Could not load existing cache:", error);
  }
  return null;
}

/**
 * Track lifecycle stages for proposals that have progressed past voting
 */
async function trackStagesForProposals(
  proposals: ParsedProposal[]
): Promise<ParsedProposal[]> {
  // Filter proposals that need stage tracking
  const proposalsToTrack = proposals.filter((p) => {
    // Skip if already has complete stages
    if (p.stages && areStagesComplete(p.stages)) {
      return false;
    }
    // Only track if state indicates progression past voting
    return shouldTrackStages(p.state) && p.creationTxHash;
  });

  if (proposalsToTrack.length === 0) {
    console.log("\nNo proposals need stage tracking");
    return proposals;
  }

  console.log(`\nTracking stages for ${proposalsToTrack.length} proposals...`);

  const proposalMap = new Map(proposals.map((p) => [p.id, p]));
  let completed = 0;
  let failed = 0;

  for (let i = 0; i < proposalsToTrack.length; i++) {
    const proposal = proposalsToTrack[i];
    process.stdout.write(
      `\r  Tracking ${i + 1}/${proposalsToTrack.length}: ${proposal.id.slice(0, 12)}...`
    );

    try {
      const result = await trackProposalStages({
        proposalId: proposal.id,
        creationTxHash: proposal.creationTxHash!,
        governorAddress: proposal.contractAddress,
        l2RpcUrl: ARBITRUM_RPC_URL,
        l1RpcUrl: ETHEREUM_RPC_URL,
        // Use existing stages for incremental tracking
        existingStages: proposal.stages,
        startFromStageIndex: proposal.stages?.length
          ? getResumeStageIndex(proposal.stages)
          : undefined,
      });

      if (result.error) {
        console.warn(`\n  Warning: ${result.error}`);
        failed++;
      } else {
        completed++;
      }

      // Update proposal with tracked stages
      const updatedProposal: ParsedProposal = {
        ...proposal,
        stages: result.stages.length > 0 ? result.stages : proposal.stages,
        stagesTrackedAt: new Date().toISOString(),
      };
      proposalMap.set(proposal.id, updatedProposal);

      // Delay between proposals to avoid rate limiting
      if (i < proposalsToTrack.length - 1) {
        await sleep(500);
      }
    } catch (error) {
      console.warn(
        `\n  Error tracking ${proposal.id}:`,
        error instanceof Error ? error.message : error
      );
      failed++;
    }
  }

  console.log(
    `\n  Stage tracking complete: ${completed} succeeded, ${failed} failed`
  );

  return proposals.map((p) => proposalMap.get(p.id) || p);
}

/**
 * Get the stage index to resume tracking from
 */
function getResumeStageIndex(stages: ProposalStage[]): number {
  // Find the first stage that isn't completed
  for (let i = 0; i < stages.length; i++) {
    if (stages[i].status !== "COMPLETED") {
      return i;
    }
  }
  return stages.length;
}

/**
 * Refresh state for pending/active proposals
 */
async function refreshProposalStates(
  provider: ethers.providers.JsonRpcProvider,
  proposals: ParsedProposal[]
): Promise<ParsedProposal[]> {
  const refreshed: ParsedProposal[] = [];
  const total = proposals.length;

  console.log(`\nRefreshing ${total} pending/active proposals...`);

  for (let i = 0; i < proposals.length; i++) {
    const proposal = proposals[i];
    try {
      const contract = new ethers.Contract(
        proposal.contractAddress,
        GOVERNOR_ABI,
        provider
      );

      const [proposalState, votes] = await Promise.all([
        contract.state(proposal.id),
        contract.proposalVotes(proposal.id),
      ]);

      let quorum: string | undefined;
      if (proposalState !== 0) {
        try {
          const quorumBN = await contract.quorum(proposal.startBlock);
          quorum = quorumBN.toString();
        } catch {
          // Quorum fetch can fail
        }
      }

      refreshed.push({
        ...proposal,
        state: PROPOSAL_STATE_NAMES[proposalState] || "unknown",
        votes: {
          againstVotes: votes.againstVotes.toString(),
          forVotes: votes.forVotes.toString(),
          abstainVotes: votes.abstainVotes.toString(),
          quorum,
        },
      });

      if ((i + 1) % 5 === 0 || i === proposals.length - 1) {
        process.stdout.write(`\r  Refreshed ${i + 1}/${total} proposals`);
      }

      if (i < proposals.length - 1) {
        await sleep(100);
      }
    } catch {
      // Keep existing version if refresh fails
      refreshed.push(proposal);
    }
  }

  console.log("");
  return refreshed;
}

async function main() {
  const isDev = process.argv.includes("--dev");
  const forceRefresh = process.argv.includes("--force");
  const outputPath = path.join(__dirname, "..", "data", "proposal-cache.json");

  console.log("========================================");
  console.log("  Arbitrum Proposal Cache Builder");
  console.log("========================================");
  console.log(`Mode: ${isDev ? "Development" : "Production"}`);
  console.log(`L2 RPC URL: ${ARBITRUM_RPC_URL}`);
  console.log(`L1 RPC URL: ${ETHEREUM_RPC_URL}`);
  console.log(`Force refresh: ${forceRefresh}`);
  console.log(`Skip stages: ${SKIP_STAGES}`);
  console.log("");

  // Check for existing cache
  const existingCache = forceRefresh ? null : loadExistingCache(outputPath);

  // Determine start block
  let startBlock: number;
  let existingProposals: ParsedProposal[] = [];

  if (existingCache && existingCache.proposals.length > 0) {
    // Incremental update: start from existing snapshot + 1
    startBlock = existingCache.snapshotBlock + 1;
    existingProposals = existingCache.proposals;
    console.log(
      `Found existing cache with ${existingCache.proposals.length} proposals`
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
  const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_RPC_URL);
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

  // Fetch new proposals from all governors
  const newRawProposals: RawProposal[] = [];
  const governorStats: ProposalCache["governorStats"] = {};

  for (const governor of GOVERNORS) {
    console.log(`Fetching proposals from ${governor.name}...`);
    console.log(`  Address: ${governor.address}`);

    const proposals = await fetchProposalsFromGovernor(
      provider,
      governor,
      startBlock,
      currentBlock,
      (processed, total) => {
        const percent = Math.round((processed / total) * 100);
        process.stdout.write(`\r  Progress: ${percent}%`);
      }
    );

    console.log(`\n  Found ${proposals.length} new proposals`);
    newRawProposals.push(...proposals);

    // Count total proposals for this governor (existing + new)
    const existingCount = existingProposals.filter(
      (p) => p.contractAddress.toLowerCase() === governor.address.toLowerCase()
    ).length;
    governorStats[governor.address] = {
      name: governor.name,
      proposalCount: existingCount + proposals.length,
    };
  }

  console.log(`\nNew proposals found: ${newRawProposals.length}`);

  // Parse new proposals
  let newParsedProposals: ParsedProposal[] = [];
  if (newRawProposals.length > 0) {
    newParsedProposals = await parseProposals(provider, newRawProposals);
  }

  // Refresh state for pending/active proposals from existing cache
  const proposalsToRefresh = existingProposals.filter(
    (p) => p.state === "pending" || p.state === "active"
  );

  let refreshedProposals: ParsedProposal[] = [];
  if (proposalsToRefresh.length > 0) {
    refreshedProposals = await refreshProposalStates(
      provider,
      proposalsToRefresh
    );
  }

  // Merge all proposals:
  // 1. Finalized existing proposals (unchanged)
  // 2. Refreshed pending/active proposals
  // 3. New proposals
  const finalizedExisting = existingProposals.filter(
    (p) => p.state !== "pending" && p.state !== "active"
  );

  const refreshedMap = new Map(refreshedProposals.map((p) => [p.id, p]));
  const mergedExisting = existingProposals.map((p) => {
    const refreshed = refreshedMap.get(p.id);
    return refreshed ?? p;
  });

  // Add new proposals (avoiding duplicates by ID)
  const existingIds = new Set(mergedExisting.map((p) => p.id));
  const uniqueNewProposals = newParsedProposals.filter(
    (p) => !existingIds.has(p.id)
  );

  let allProposals = [...mergedExisting, ...uniqueNewProposals];

  // Track lifecycle stages for proposals that have progressed past voting
  if (!SKIP_STAGES) {
    allProposals = await trackStagesForProposals(allProposals);
  }

  // Sort: active first, then by startBlock descending
  allProposals.sort((a, b) => {
    if (a.state === "active" && b.state !== "active") return -1;
    if (a.state !== "active" && b.state === "active") return 1;
    return parseInt(b.startBlock) - parseInt(a.startBlock);
  });

  // Update governor stats
  for (const governor of GOVERNORS) {
    governorStats[governor.address] = {
      name: governor.name,
      proposalCount: allProposals.filter(
        (p) =>
          p.contractAddress.toLowerCase() === governor.address.toLowerCase()
      ).length,
    };
  }

  // Create cache object
  const cache: ProposalCache = {
    version: 1,
    generatedAt: new Date().toISOString(),
    snapshotBlock: currentBlock,
    startBlock: existingCache?.startBlock ?? startBlock,
    chainId: ARBITRUM_CHAIN_ID,
    proposals: allProposals,
    governorStats,
  };

  // Write to file
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(cache, null, 2));

  console.log("\n========================================");
  console.log("  Cache Build Complete!");
  console.log("========================================");
  console.log(`Output: ${outputPath}`);
  console.log(`Total proposals: ${allProposals.length}`);
  console.log(`  - Existing (finalized): ${finalizedExisting.length}`);
  console.log(`  - Refreshed (pending/active): ${refreshedProposals.length}`);
  console.log(`  - New: ${uniqueNewProposals.length}`);
  console.log(`Snapshot block: ${currentBlock.toLocaleString()}`);
  console.log(
    `File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`
  );
  console.log("");

  // Summary by state
  const stateCounts: Record<string, number> = {};
  for (const p of allProposals) {
    stateCounts[p.state] = (stateCounts[p.state] || 0) + 1;
  }
  console.log("Proposals by state:");
  for (const [state, count] of Object.entries(stateCounts).sort()) {
    console.log(`  ${state}: ${count}`);
  }

  // Summary of stage tracking
  const proposalsWithStages = allProposals.filter(
    (p) => p.stages && p.stages.length > 0
  );
  const proposalsWithCompleteStages = allProposals.filter(
    (p) => p.stages && areStagesComplete(p.stages)
  );
  console.log("");
  console.log("Stage tracking:");
  console.log(`  Proposals with stages: ${proposalsWithStages.length}`);
  console.log(
    `  Proposals with complete stages: ${proposalsWithCompleteStages.length}`
  );
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
