"use client";

import {
  ADDRESSES,
  MAINNET_ELECTION_CONFIG,
  type ElectionConfig,
} from "@gzeoneth/gov-tracker";

import { STORAGE_KEYS } from "@/config/storage-keys";
import { useMemo } from "react";
import { useChainId } from "wagmi";
import { useLocalStorage } from "./use-local-storage";

export interface ElectionContractOverrides {
  nomineeGovernor?: string;
  memberGovernor?: string;
  arbToken?: string;
}

export interface ElectionContractsResult extends ElectionConfig {
  arbToken: string;
}

const EMPTY_OVERRIDES: ElectionContractOverrides = {};

const SEPOLIA_CONFIG: ElectionConfig = {
  nomineeGovernorAddress:
    "0xE1DFF2B940940e743675496C91Ab589018282EA0" as `0x${string}`,
  memberGovernorAddress:
    "0x3D110E6045BC7990f6A2eFfd211852cE5f556736" as `0x${string}`,
  chainId: 421614,
};

const CONFIGS: Record<number, ElectionConfig> = {
  [MAINNET_ELECTION_CONFIG.chainId]: MAINNET_ELECTION_CONFIG,
  [SEPOLIA_CONFIG.chainId]: SEPOLIA_CONFIG,
};

const ARB_TOKENS: Record<number, string> = {
  [MAINNET_ELECTION_CONFIG.chainId]: ADDRESSES.ARB_TOKEN,
  [SEPOLIA_CONFIG.chainId]: "0x8e3A45b777F35Aa95829529e33b15815140Ba546",
};

export function useElectionContracts(): ElectionContractsResult {
  const chainId = useChainId();
  const [overrides] = useLocalStorage<ElectionContractOverrides>(
    STORAGE_KEYS.ELECTION_CONTRACT_OVERRIDES,
    EMPTY_OVERRIDES
  );

  return useMemo(() => {
    const base = CONFIGS[chainId] ?? MAINNET_ELECTION_CONFIG;
    const arbToken = ARB_TOKENS[chainId] ?? ADDRESSES.ARB_TOKEN;

    return {
      ...base,
      arbToken,
      ...(overrides?.nomineeGovernor && {
        nomineeGovernorAddress: overrides.nomineeGovernor as `0x${string}`,
      }),
      ...(overrides?.memberGovernor && {
        memberGovernorAddress: overrides.memberGovernor as `0x${string}`,
      }),
      ...(overrides?.arbToken && { arbToken: overrides.arbToken }),
    };
  }, [chainId, overrides]);
}
