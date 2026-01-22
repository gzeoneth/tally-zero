/**
 * Hook for managing settings form state
 * Handles synchronization between localStorage and local form state
 */

import { useCallback, useState } from "react";

import { DEFAULT_FORM_VALUES } from "@/config/arbitrum-governance";
import {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_TENDERLY_ORG,
  DEFAULT_TENDERLY_PROJECT,
  STORAGE_KEYS,
} from "@/config/storage-keys";
import { useLocalStorage } from "@/hooks/use-local-storage";

import {
  getDefaultFormState,
  type SettingsFormState,
  type StoredSettings,
} from "@/components/container/settings/types";

export interface UseSettingsFormReturn {
  /** Form input state */
  formState: SettingsFormState;
  /** Update form input state */
  setFormState: {
    setL2RpcInput: (value: string) => void;
    setL1RpcInput: (value: string) => void;
    setBlockRangeInput: (value: string) => void;
    setL1BlockRangeInput: (value: string) => void;
    setDaysInput: (value: string) => void;
    setTtlInput: (value: number) => void;
    setTtlCustomInput: (value: string) => void;
    setTenderlyOrgInput: (value: string) => void;
    setTenderlyProjectInput: (value: string) => void;
    setTenderlyAccessTokenInput: (value: string) => void;
  };
  /** Stored settings from localStorage */
  storedSettings: StoredSettings;
  /** Store setters for direct localStorage updates */
  storeSetters: {
    setStoredL2Rpc: (value: string) => void;
    setStoredL1Rpc: (value: string) => void;
    setBlockRange: (value: number) => void;
    setL1BlockRange: (value: number) => void;
    setDaysToSearch: (value: number) => void;
    setCacheTtl: (value: number) => void;
    setSkipBundledCache: (value: boolean) => void;
    setTenderlyOrg: (value: string) => void;
    setTenderlyProject: (value: string) => void;
    setTenderlyAccessToken: (value: string) => void;
  };
  /** Sync form state from localStorage (call when sheet opens) */
  syncFromStorage: () => void;
  /** Reset form to default values */
  resetToDefaults: () => void;
  /** Save form state to localStorage */
  saveToStorage: () => void;
}

/**
 * Hook that manages settings form state and synchronization with localStorage.
 * Reduces boilerplate in SettingsSheet by encapsulating all state management.
 */
export function useSettingsForm(): UseSettingsFormReturn {
  // LocalStorage settings
  const [storedL2Rpc, setStoredL2Rpc] = useLocalStorage(
    STORAGE_KEYS.L2_RPC,
    ""
  );
  const [storedL1Rpc, setStoredL1Rpc] = useLocalStorage(
    STORAGE_KEYS.L1_RPC,
    ""
  );
  const [blockRange, setBlockRange] = useLocalStorage<number>(
    STORAGE_KEYS.BLOCK_RANGE,
    DEFAULT_FORM_VALUES.blockRange
  );
  const [l1BlockRange, setL1BlockRange] = useLocalStorage<number>(
    STORAGE_KEYS.L1_BLOCK_RANGE,
    DEFAULT_FORM_VALUES.l1BlockRange
  );
  const [daysToSearch, setDaysToSearch] = useLocalStorage<number>(
    STORAGE_KEYS.DAYS_TO_SEARCH,
    DEFAULT_FORM_VALUES.daysToSearch
  );
  const [cacheTtl, setCacheTtl] = useLocalStorage<number>(
    STORAGE_KEYS.CACHE_TTL,
    DEFAULT_CACHE_TTL_MS / 1000
  );
  const [skipBundledCache, setSkipBundledCache] = useLocalStorage<boolean>(
    STORAGE_KEYS.SKIP_BUNDLED_CACHE,
    false
  );
  const [tenderlyOrg, setTenderlyOrg] = useLocalStorage<string>(
    STORAGE_KEYS.TENDERLY_ORG,
    DEFAULT_TENDERLY_ORG
  );
  const [tenderlyProject, setTenderlyProject] = useLocalStorage<string>(
    STORAGE_KEYS.TENDERLY_PROJECT,
    DEFAULT_TENDERLY_PROJECT
  );
  const [tenderlyAccessToken, setTenderlyAccessToken] = useLocalStorage<string>(
    STORAGE_KEYS.TENDERLY_ACCESS_TOKEN,
    ""
  );

  // Local form state
  const [l2RpcInput, setL2RpcInput] = useState(storedL2Rpc);
  const [l1RpcInput, setL1RpcInput] = useState(storedL1Rpc);
  const [blockRangeInput, setBlockRangeInput] = useState(String(blockRange));
  const [l1BlockRangeInput, setL1BlockRangeInput] = useState(
    String(l1BlockRange)
  );
  const [daysInput, setDaysInput] = useState(String(daysToSearch));
  const [ttlInput, setTtlInput] = useState(cacheTtl);
  const [ttlCustomInput, setTtlCustomInput] = useState(String(cacheTtl));
  const [tenderlyOrgInput, setTenderlyOrgInput] = useState(tenderlyOrg);
  const [tenderlyProjectInput, setTenderlyProjectInput] =
    useState(tenderlyProject);
  const [tenderlyAccessTokenInput, setTenderlyAccessTokenInput] =
    useState(tenderlyAccessToken);

  // Sync form state from localStorage
  const syncFromStorage = useCallback(() => {
    setL2RpcInput(storedL2Rpc);
    setL1RpcInput(storedL1Rpc);
    setBlockRangeInput(String(blockRange));
    setL1BlockRangeInput(String(l1BlockRange));
    setDaysInput(String(daysToSearch));
    setTtlInput(cacheTtl);
    setTtlCustomInput(String(cacheTtl));
    setTenderlyOrgInput(tenderlyOrg);
    setTenderlyProjectInput(tenderlyProject);
    setTenderlyAccessTokenInput(tenderlyAccessToken);
  }, [
    storedL2Rpc,
    storedL1Rpc,
    blockRange,
    l1BlockRange,
    daysToSearch,
    cacheTtl,
    tenderlyOrg,
    tenderlyProject,
    tenderlyAccessToken,
  ]);

  // Reset form to defaults
  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultFormState();
    setL2RpcInput(defaults.l2RpcInput);
    setL1RpcInput(defaults.l1RpcInput);
    setBlockRangeInput(defaults.blockRangeInput);
    setL1BlockRangeInput(defaults.l1BlockRangeInput);
    setDaysInput(defaults.daysInput);
    setTtlInput(defaults.ttlInput);
    setTtlCustomInput(defaults.ttlCustomInput);
    setTenderlyOrgInput(defaults.tenderlyOrgInput);
    setTenderlyProjectInput(defaults.tenderlyProjectInput);
    setTenderlyAccessTokenInput(defaults.tenderlyAccessTokenInput);
  }, []);

  // Save form state to localStorage
  const saveToStorage = useCallback(() => {
    setStoredL2Rpc(l2RpcInput);
    setStoredL1Rpc(l1RpcInput);
    setBlockRange(parseInt(blockRangeInput) || DEFAULT_FORM_VALUES.blockRange);
    setL1BlockRange(
      parseInt(l1BlockRangeInput) || DEFAULT_FORM_VALUES.l1BlockRange
    );
    setDaysToSearch(parseInt(daysInput) || DEFAULT_FORM_VALUES.daysToSearch);
    setCacheTtl(ttlInput);
    setTenderlyOrg(tenderlyOrgInput || DEFAULT_TENDERLY_ORG);
    setTenderlyProject(tenderlyProjectInput || DEFAULT_TENDERLY_PROJECT);
    setTenderlyAccessToken(tenderlyAccessTokenInput);
  }, [
    l2RpcInput,
    l1RpcInput,
    blockRangeInput,
    l1BlockRangeInput,
    daysInput,
    ttlInput,
    tenderlyOrgInput,
    tenderlyProjectInput,
    tenderlyAccessTokenInput,
    setStoredL2Rpc,
    setStoredL1Rpc,
    setBlockRange,
    setL1BlockRange,
    setDaysToSearch,
    setCacheTtl,
    setTenderlyOrg,
    setTenderlyProject,
    setTenderlyAccessToken,
  ]);

  return {
    formState: {
      l2RpcInput,
      l1RpcInput,
      blockRangeInput,
      l1BlockRangeInput,
      daysInput,
      ttlInput,
      ttlCustomInput,
      tenderlyOrgInput,
      tenderlyProjectInput,
      tenderlyAccessTokenInput,
    },
    setFormState: {
      setL2RpcInput,
      setL1RpcInput,
      setBlockRangeInput,
      setL1BlockRangeInput,
      setDaysInput,
      setTtlInput,
      setTtlCustomInput,
      setTenderlyOrgInput,
      setTenderlyProjectInput,
      setTenderlyAccessTokenInput,
    },
    storedSettings: {
      storedL2Rpc,
      storedL1Rpc,
      blockRange,
      l1BlockRange,
      daysToSearch,
      cacheTtl,
      skipBundledCache,
      tenderlyOrg,
      tenderlyProject,
      tenderlyAccessToken,
    },
    storeSetters: {
      setStoredL2Rpc,
      setStoredL1Rpc,
      setBlockRange,
      setL1BlockRange,
      setDaysToSearch,
      setCacheTtl,
      setSkipBundledCache,
      setTenderlyOrg,
      setTenderlyProject,
      setTenderlyAccessToken,
    },
    syncFromStorage,
    resetToDefaults,
    saveToStorage,
  };
}
