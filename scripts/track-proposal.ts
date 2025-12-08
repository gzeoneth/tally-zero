#!/usr/bin/env npx tsx
/**
 * CLI for tracking Arbitrum governance proposal stages
 *
 * Usage:
 *   npx tsx scripts/track-proposal.ts --proposalId <id> --creationTx <hash> [options]
 *
 * Example:
 *   npx tsx scripts/track-proposal.ts \
 *     --proposalId 51852039695020109312343918128899814224888993575448130385109956762385891284115 \
 *     --creationTx 0x4bf0485d75ff6032dde76dfe98a0e5ff1ca9539cf82a62ff2b9ffb63339a0e8c
 *
 * With custom RPC URLs:
 *   npx tsx scripts/track-proposal.ts \
 *     --proposalId 123... \
 *     --creationTx 0xabc... \
 *     --l1RpcUrl https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY \
 *     --l2RpcUrl https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
 */

import * as dotenv from "dotenv";
dotenv.config();

import { ArbitrumProvider } from "@arbitrum/sdk";
import { ethers } from "ethers";
import {
  ARBITRUM_RPC_URL,
  CORE_GOVERNOR,
  DEFAULT_CHUNKING_CONFIG,
  ETHEREUM_RPC_URL,
  L1_TIMELOCK,
  L2_CORE_TIMELOCK,
} from "../config/arbitrum-governance";
import {
  ProposalStageTracker,
  formatTrackingResult,
} from "../lib/proposal-stage-tracker";
import type { ChunkingConfig } from "../types/proposal-stage";

interface CliOptions {
  proposalId: string;
  creationTx: string;
  l1RpcUrl: string;
  l2RpcUrl: string;
  governorAddress?: string;
  l2TimelockAddress?: string;
  l1TimelockAddress?: string;
  l2ChunkSize?: number;
  l1ChunkSize?: number;
  delayBetweenChunks?: number;
  jsonOutput?: boolean;
  verbose?: boolean;
}

// Global verbose flag for debug logging
let VERBOSE = false;

function debug(...args: unknown[]) {
  if (VERBOSE) {
    console.log("[DEBUG]", ...args);
  }
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: Partial<CliOptions> = {
    l1RpcUrl: process.env.L1_RPC_URL || ETHEREUM_RPC_URL,
    l2RpcUrl: process.env.L2_RPC_URL || ARBITRUM_RPC_URL,
    l2ChunkSize: DEFAULT_CHUNKING_CONFIG.l2ChunkSize,
    l1ChunkSize: DEFAULT_CHUNKING_CONFIG.l1ChunkSize,
    delayBetweenChunks: DEFAULT_CHUNKING_CONFIG.delayBetweenChunks,
    jsonOutput: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--proposalId":
        options.proposalId = nextArg;
        i++;
        break;
      case "--creationTx":
        options.creationTx = nextArg;
        i++;
        break;
      case "--l1RpcUrl":
        options.l1RpcUrl = nextArg;
        i++;
        break;
      case "--l2RpcUrl":
        options.l2RpcUrl = nextArg;
        i++;
        break;
      case "--governorAddress":
        options.governorAddress = nextArg;
        i++;
        break;
      case "--l2TimelockAddress":
        options.l2TimelockAddress = nextArg;
        i++;
        break;
      case "--l1TimelockAddress":
        options.l1TimelockAddress = nextArg;
        i++;
        break;
      case "--l2ChunkSize":
        options.l2ChunkSize = parseInt(nextArg, 10);
        i++;
        break;
      case "--l1ChunkSize":
        options.l1ChunkSize = parseInt(nextArg, 10);
        i++;
        break;
      case "--delayBetweenChunks":
        options.delayBetweenChunks = parseInt(nextArg, 10);
        i++;
        break;
      case "--jsonOutput":
      case "--json":
        options.jsonOutput = true;
        break;
      case "--verbose":
      case "-v":
        options.verbose = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
    }
  }

  // Validate required options
  if (!options.proposalId) {
    console.error("Error: --proposalId is required");
    printUsage();
    process.exit(1);
  }
  if (!options.creationTx) {
    console.error("Error: --creationTx is required");
    printUsage();
    process.exit(1);
  }

  return options as CliOptions;
}

function printUsage(): void {
  console.log(`
Arbitrum Governance Proposal Stage Tracker CLI

Usage:
  npx tsx scripts/track-proposal.ts --proposalId <id> --creationTx <hash> [options]

Required Options:
  --proposalId <id>           The proposal ID to track
  --creationTx <hash>         The transaction hash where the proposal was created

Optional Options:
  --l1RpcUrl <url>            L1 (Ethereum) RPC URL (default: ${ETHEREUM_RPC_URL})
  --l2RpcUrl <url>            L2 (Arbitrum One) RPC URL (default: ${ARBITRUM_RPC_URL})
  --governorAddress <addr>    Governor contract address (default: Core Governor)
  --l2TimelockAddress <addr>  L2 Timelock contract address
  --l1TimelockAddress <addr>  L1 Timelock contract address
  --l2ChunkSize <num>         Max blocks per L2 query (default: ${DEFAULT_CHUNKING_CONFIG.l2ChunkSize})
  --l1ChunkSize <num>         Max blocks per L1 query (default: ${DEFAULT_CHUNKING_CONFIG.l1ChunkSize})
  --delayBetweenChunks <ms>   Delay between chunk queries (default: ${DEFAULT_CHUNKING_CONFIG.delayBetweenChunks})
  --jsonOutput, --json        Output result as JSON
  --verbose, -v               Enable verbose debug output
  --help, -h                  Show this help message

Environment Variables:
  L1_RPC_URL                  L1 RPC URL (overrides default)
  L2_RPC_URL                  L2 RPC URL (overrides default)

Example:
  npx tsx scripts/track-proposal.ts \\
    --proposalId 51852039695020109312343918128899814224888993575448130385109956762385891284115 \\
    --creationTx 0x4bf0485d75ff6032dde76dfe98a0e5ff1ca9539cf82a62ff2b9ffb63339a0e8c
`);
}

async function main(): Promise<void> {
  const options = parseArgs();

  // Set verbose mode
  VERBOSE = options.verbose || false;

  console.log("Arbitrum Governance Proposal Stage Tracker CLI");
  console.log("=".repeat(50));
  console.log("");

  // Create providers
  console.log(`Connecting to L1: ${options.l1RpcUrl}`);
  console.log(`Connecting to L2: ${options.l2RpcUrl}`);
  console.log("");

  const l1Provider = new ethers.providers.JsonRpcProvider(options.l1RpcUrl);
  const baseL2Provider = new ethers.providers.JsonRpcProvider(options.l2RpcUrl);
  // Wrap L2 provider with ArbitrumProvider to get l1BlockNumber in receipts
  const l2Provider = new ArbitrumProvider(baseL2Provider, 42161);

  debug("Created providers:");
  debug("  L1 Provider (plain JsonRpcProvider) for L1 queries");
  debug("  Base L2 Provider (plain JsonRpcProvider) for SDK status() calls");
  debug("  L2 Provider (ArbitrumProvider) for receipts with l1BlockNumber");

  // Verify connections
  try {
    const [l1Network, l2Network] = await Promise.all([
      l1Provider.getNetwork(),
      baseL2Provider.getNetwork(),
    ]);
    console.log(
      `L1 Network: ${l1Network.name} (chainId: ${l1Network.chainId})`
    );
    console.log(
      `L2 Network: ${l2Network.name} (chainId: ${l2Network.chainId})`
    );
    console.log("");
  } catch (error) {
    console.error("Failed to connect to RPC providers:", error);
    process.exit(1);
  }

  // Create chunking config
  const chunkingConfig: ChunkingConfig = {
    l2ChunkSize: options.l2ChunkSize!,
    l1ChunkSize: options.l1ChunkSize!,
    delayBetweenChunks: options.delayBetweenChunks!,
  };

  debug("Chunking config:", JSON.stringify(chunkingConfig));

  // Create tracker
  const governorAddress = options.governorAddress || CORE_GOVERNOR.address;
  const l2TimelockAddress =
    options.l2TimelockAddress || L2_CORE_TIMELOCK.address;
  const l1TimelockAddress = options.l1TimelockAddress || L1_TIMELOCK.address;

  console.log(`Using contract addresses:`);
  console.log(`  Governor: ${governorAddress}`);
  console.log(`  L2 Timelock: ${l2TimelockAddress}`);
  console.log(`  L1 Timelock: ${l1TimelockAddress}`);
  console.log("");

  const tracker = new ProposalStageTracker(
    l2Provider,
    l1Provider,
    governorAddress,
    l2TimelockAddress,
    l1TimelockAddress,
    chunkingConfig,
    baseL2Provider, // Pass base provider for SDK operations
    VERBOSE ? debug : undefined // Pass debug logger if verbose
  );

  debug("ProposalStageTracker created");

  // Normalize proposal ID
  let proposalId = options.proposalId;
  try {
    // Try to parse as BigNumber to normalize
    const bn = ethers.BigNumber.from(proposalId);
    proposalId = bn.toString();
  } catch (error) {
    // Keep as-is if it can't be parsed
  }

  console.log(`Tracking proposal: ${proposalId}`);
  console.log(`Creation TX: ${options.creationTx}`);
  console.log("");
  console.log("Searching for proposal stages...");
  console.log("");

  debug("Starting trackProposal() call");

  try {
    const startTime = Date.now();
    const result = await tracker.trackProposal(proposalId, options.creationTx);
    debug(`trackProposal() completed in ${Date.now() - startTime}ms`);
    debug(`Found ${result.stages.length} stages`);

    if (options.jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatTrackingResult(result));
    }
  } catch (error) {
    console.error("Error tracking proposal:", error);
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Unexpected error:", error);
    process.exit(1);
  });
