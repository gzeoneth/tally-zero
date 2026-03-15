"use client";

import {
  DEFAULT_ELECTION_NETWORK,
  ELECTION_NETWORKS,
  type ElectionContracts,
} from "@/config/election-networks";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { useMemo } from "react";
import { useChainId } from "wagmi";
import { useLocalStorage } from "./use-local-storage";

export interface ElectionContractOverrides {
  nomineeGovernor?: string;
  memberGovernor?: string;
  securityCouncilManager?: string;
  arbToken?: string;
}

const EMPTY_OVERRIDES: ElectionContractOverrides = {};

export function useElectionContracts(): ElectionContracts {
  const chainId = useChainId();
  const [overrides] = useLocalStorage<ElectionContractOverrides>(
    STORAGE_KEYS.ELECTION_CONTRACT_OVERRIDES,
    EMPTY_OVERRIDES
  );

  return useMemo(() => {
    const base = ELECTION_NETWORKS[chainId] ?? DEFAULT_ELECTION_NETWORK;
    if (!overrides || Object.values(overrides).every((v) => !v)) return base;
    return {
      ...base,
      ...(overrides.nomineeGovernor && {
        nomineeGovernor: overrides.nomineeGovernor,
      }),
      ...(overrides.memberGovernor && {
        memberGovernor: overrides.memberGovernor,
      }),
      ...(overrides.securityCouncilManager && {
        securityCouncilManager: overrides.securityCouncilManager,
      }),
      ...(overrides.arbToken && { arbToken: overrides.arbToken }),
    };
  }, [chainId, overrides]);
}
