"use client";

/**
 * Hook for accessing user-configured RPC settings
 * Provides L1 and L2 RPC URLs with fallbacks to defaults
 */

import {
  ARBITRUM_RPC_URL,
  DEFAULT_FORM_VALUES,
  ETHEREUM_RPC_URL,
} from "@/config/arbitrum-governance";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { useLocalStorage } from "@/hooks/use-local-storage";

/** RPC settings with hydration state */
export interface RpcSettings {
  l1Rpc: string;
  l2Rpc: string;
  l2ChunkSize: number;
  l1ChunkSize: number;
  isHydrated: boolean;
}

/** Options for configuring RPC settings with custom overrides */
export interface UseRpcSettingsOptions {
  /** Custom L1 RPC URL (overrides stored and default) */
  customL1Rpc?: string;
  /** Custom L2 RPC URL (overrides stored and default) */
  customL2Rpc?: string;
}

/**
 * Hook for accessing RPC settings from localStorage with hydration state.
 * Provides L1 (Ethereum) and L2 (Arbitrum) RPC URLs with sensible defaults.
 *
 * Priority order: custom prop > stored value > default
 *
 * @param options - Optional custom RPC URL overrides
 * @returns RPC settings with effective URLs and hydration state
 */
export function useRpcSettings(options?: UseRpcSettingsOptions): RpcSettings {
  const [storedL1Rpc, , l1RpcHydrated] = useLocalStorage(
    STORAGE_KEYS.L1_RPC,
    ""
  );
  const [storedL2Rpc, , l2RpcHydrated] = useLocalStorage(
    STORAGE_KEYS.L2_RPC,
    ""
  );
  const [storedL2ChunkSize, , l2ChunkHydrated] = useLocalStorage(
    STORAGE_KEYS.BLOCK_RANGE,
    DEFAULT_FORM_VALUES.blockRange
  );
  const [storedL1ChunkSize, , l1ChunkHydrated] = useLocalStorage(
    STORAGE_KEYS.L1_BLOCK_RANGE,
    DEFAULT_FORM_VALUES.l1BlockRange
  );

  return {
    l1Rpc: options?.customL1Rpc || storedL1Rpc || ETHEREUM_RPC_URL,
    l2Rpc: options?.customL2Rpc || storedL2Rpc || ARBITRUM_RPC_URL,
    l2ChunkSize: storedL2ChunkSize,
    l1ChunkSize: storedL1ChunkSize,
    isHydrated:
      l1RpcHydrated && l2RpcHydrated && l2ChunkHydrated && l1ChunkHydrated,
  };
}
