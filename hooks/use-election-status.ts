"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  checkElectionStatus,
  getMemberElectionDetails,
  getNomineeElectionDetails,
  trackAllElections,
  type ElectionProposalStatus,
  type ElectionStatus,
} from "@gzeoneth/gov-tracker";

import { STORAGE_KEYS } from "@/config/storage-keys";
import { getBundledCacheElections } from "@/lib/bundled-cache-loader";
import { debug, isBrowser } from "@/lib/debug";
import { createRpcProvider } from "@/lib/rpc-utils";
import {
  ARBITRUM_RPC_URL,
  ETHEREUM_RPC_URL,
} from "@config/arbitrum-governance";

type NomineeElectionDetails = Awaited<
  ReturnType<typeof getNomineeElectionDetails>
>;
type MemberElectionDetails = Awaited<
  ReturnType<typeof getMemberElectionDetails>
>;

interface ElectionCacheData {
  version: number;
  timestamp: number;
  status: ElectionStatus | null;
  elections: ElectionProposalStatus[];
  nomineeDetails: Record<number, NomineeElectionDetails>;
  memberDetails: Record<number, MemberElectionDetails>;
}

const ELECTION_CACHE_VERSION = 1;
const ELECTION_CACHE_TTL_MS = 5 * 60 * 1000;
const MEMBER_DETAIL_PHASES = new Set([
  "MEMBER_ELECTION",
  "PENDING_EXECUTION",
  "COMPLETED",
]);

/**
 * Merge elections by index, keeping current over bundled for same index
 */
function mergeElectionsByIndex(
  current: ElectionProposalStatus[],
  bundled: ElectionProposalStatus[]
): ElectionProposalStatus[] {
  if (current.length === 0) return bundled;

  const currentIndices = new Set(current.map((e) => e.electionIndex));
  const merged = [
    ...current,
    ...bundled.filter((e) => !currentIndices.has(e.electionIndex)),
  ];
  return merged.sort((a, b) => a.electionIndex - b.electionIndex);
}

function loadElectionCache(): ElectionCacheData | null {
  if (!isBrowser) return null;

  try {
    const data = localStorage.getItem(STORAGE_KEYS.ELECTION_CACHE);
    if (!data) return null;

    const cache = JSON.parse(data) as ElectionCacheData;
    if (cache.version !== ELECTION_CACHE_VERSION) {
      localStorage.removeItem(STORAGE_KEYS.ELECTION_CACHE);
      return null;
    }

    if (Date.now() - cache.timestamp > ELECTION_CACHE_TTL_MS) {
      return null;
    }

    return cache;
  } catch (err) {
    debug.cache("Failed to load election cache: %O", err);
    return null;
  }
}

function saveElectionCache(
  data: Omit<ElectionCacheData, "version" | "timestamp">
): void {
  if (!isBrowser) return;

  try {
    const cache: ElectionCacheData = {
      ...data,
      version: ELECTION_CACHE_VERSION,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEYS.ELECTION_CACHE, JSON.stringify(cache));
  } catch (err) {
    debug.cache("Failed to save election cache: %O", err);
  }
}

export interface UseElectionStatusOptions {
  enabled?: boolean;
  l2RpcUrl?: string;
  l1RpcUrl?: string;
  refreshInterval?: number;
  selectedElectionIndex?: number | null;
}

export interface UseElectionStatusResult {
  status: ElectionStatus | null;
  allElections: ElectionProposalStatus[];
  activeElections: ElectionProposalStatus[];
  selectedElection: ElectionProposalStatus | null;
  nomineeDetails: NomineeElectionDetails;
  memberDetails: MemberElectionDetails;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
  selectElection: (index: number | null) => void;
}

export function useElectionStatus({
  enabled = true,
  l2RpcUrl,
  l1RpcUrl,
  refreshInterval = 60000,
  selectedElectionIndex: initialSelectedIndex = null,
}: UseElectionStatusOptions = {}): UseElectionStatusResult {
  const initialCache = useMemo(() => loadElectionCache(), []);

  const [status, setStatus] = useState<ElectionStatus | null>(
    initialCache?.status ?? null
  );
  const [allElections, setAllElections] = useState<ElectionProposalStatus[]>(
    initialCache?.elections ?? []
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    initialSelectedIndex
  );
  const [nomineeDetailsMap, setNomineeDetailsMap] = useState<
    Record<number, NomineeElectionDetails>
  >(initialCache?.nomineeDetails ?? {});
  const [memberDetailsMap, setMemberDetailsMap] = useState<
    Record<number, MemberElectionDetails>
  >(initialCache?.memberDetails ?? {});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const l2Url = l2RpcUrl || ARBITRUM_RPC_URL;
  const l1Url = l1RpcUrl || ETHEREUM_RPC_URL;

  const activeElections = useMemo(
    () => allElections.filter((e) => e.phase !== "COMPLETED"),
    [allElections]
  );

  const selectedElection = useMemo(() => {
    if (selectedIndex === null) {
      return activeElections[0] ?? null;
    }
    return allElections.find((e) => e.electionIndex === selectedIndex) ?? null;
  }, [allElections, activeElections, selectedIndex]);

  const nomineeDetails = selectedElection
    ? nomineeDetailsMap[selectedElection.electionIndex] ?? null
    : null;
  const memberDetails = selectedElection
    ? memberDetailsMap[selectedElection.electionIndex] ?? null
    : null;

  // Load bundled cache elections on first render (before RPC fetch)
  const [bundledLoaded, setBundledLoaded] = useState(false);
  useEffect(() => {
    getBundledCacheElections()
      .then((bundledElections) => {
        if (bundledElections.length > 0) {
          debug.app(
            "Loaded %d elections from bundled cache",
            bundledElections.length
          );
          setAllElections((current) =>
            mergeElectionsByIndex(current, bundledElections)
          );
        }
      })
      .catch((err) => {
        debug.app("Failed to load bundled elections: %O", err);
      })
      .finally(() => {
        setBundledLoaded(true);
      });
  }, []);

  const fetchElectionData = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const [l2Provider, l1Provider] = await Promise.all([
        createRpcProvider(l2Url),
        createRpcProvider(l1Url),
      ]);

      debug.app("Fetching SC election status...");

      // Fetch status and all elections in parallel
      const [electionStatus, elections] = await Promise.all([
        checkElectionStatus(l2Provider, l1Provider),
        trackAllElections(l2Provider, l1Provider),
      ]);

      setStatus(electionStatus);
      setAllElections(elections);

      debug.app(
        "Election status: count=%d, canCreate=%s, elections=%d",
        electionStatus.electionCount,
        electionStatus.canCreateElection,
        elections.length
      );

      const newNomineeDetails: Record<number, NomineeElectionDetails> = {};
      const newMemberDetails: Record<number, MemberElectionDetails> = {};

      await Promise.all(
        elections.map(async (election) => {
          try {
            const nominee = await getNomineeElectionDetails(
              election.electionIndex,
              l2Provider
            );
            newNomineeDetails[election.electionIndex] = nominee;

            if (MEMBER_DETAIL_PHASES.has(election.phase)) {
              const member = await getMemberElectionDetails(
                election.electionIndex,
                l2Provider
              );
              newMemberDetails[election.electionIndex] = member;
            }
          } catch (err) {
            debug.app(
              "Failed to fetch details for election %d: %O",
              election.electionIndex,
              err
            );
          }
        })
      );

      setNomineeDetailsMap(newNomineeDetails);
      setMemberDetailsMap(newMemberDetails);

      // Save to cache
      saveElectionCache({
        status: electionStatus,
        elections,
        nomineeDetails: newNomineeDetails,
        memberDetails: newMemberDetails,
      });
    } catch (err) {
      debug.app("Election status error: %O", err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [enabled, l2Url, l1Url]);

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const selectElection = useCallback((index: number | null) => {
    setSelectedIndex(index);
  }, []);

  // Only fetch from RPC after bundled cache has been checked
  // This ensures bundled data shows immediately while fresh data loads
  useEffect(() => {
    if (!bundledLoaded) return;
    fetchElectionData();
  }, [bundledLoaded, fetchElectionData, refreshTrigger]);

  useEffect(() => {
    if (!enabled || refreshInterval <= 0) return;

    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [enabled, refreshInterval, refresh]);

  return {
    status,
    allElections,
    activeElections,
    selectedElection,
    nomineeDetails,
    memberDetails,
    isLoading,
    error,
    refresh,
    selectElection,
  };
}
