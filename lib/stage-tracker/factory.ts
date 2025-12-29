import {
  ARBITRUM_RPC_URL,
  CORE_GOVERNOR,
  DEFAULT_CHUNKING_CONFIG,
  ETHEREUM_RPC_URL,
  L1_TIMELOCK,
  L2_CORE_TIMELOCK,
  L2_TREASURY_TIMELOCK,
  TREASURY_GOVERNOR,
} from "@/config/arbitrum-governance";
import type { ChunkingConfig } from "@/types/proposal-stage";
import { ArbitrumProvider } from "@arbitrum/sdk";
import { ethers } from "ethers";
import { IncrementalStageTracker } from "./incremental-tracker";

export function createCoreGovernorTracker(
  l2RpcUrl: string = ARBITRUM_RPC_URL,
  l1RpcUrl: string = ETHEREUM_RPC_URL,
  chunkingConfig?: Partial<ChunkingConfig>
): IncrementalStageTracker {
  const baseL2Provider = new ethers.providers.JsonRpcProvider(l2RpcUrl);
  const l2Provider = new ArbitrumProvider(baseL2Provider, 42161);
  const l1Provider = new ethers.providers.JsonRpcProvider(l1RpcUrl);

  return new IncrementalStageTracker(
    l2Provider,
    l1Provider,
    CORE_GOVERNOR.address,
    L2_CORE_TIMELOCK.address,
    L1_TIMELOCK.address,
    { ...DEFAULT_CHUNKING_CONFIG, ...chunkingConfig },
    baseL2Provider
  );
}

export function createTreasuryGovernorTracker(
  l2RpcUrl: string = ARBITRUM_RPC_URL,
  l1RpcUrl: string = ETHEREUM_RPC_URL,
  chunkingConfig?: Partial<ChunkingConfig>
): IncrementalStageTracker {
  const baseL2Provider = new ethers.providers.JsonRpcProvider(l2RpcUrl);
  const l2Provider = new ArbitrumProvider(baseL2Provider, 42161);
  const l1Provider = new ethers.providers.JsonRpcProvider(l1RpcUrl);

  return new IncrementalStageTracker(
    l2Provider,
    l1Provider,
    TREASURY_GOVERNOR.address,
    L2_TREASURY_TIMELOCK.address,
    L1_TIMELOCK.address,
    { ...DEFAULT_CHUNKING_CONFIG, ...chunkingConfig },
    baseL2Provider
  );
}
