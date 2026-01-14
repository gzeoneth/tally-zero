"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getMemberElectionDetails,
  getNomineeElectionDetails,
  type ElectionProposalStatus,
  type ElectionStatus,
} from "@gzeoneth/gov-tracker";

import { getBundledCacheElections } from "@/lib/bundled-cache-loader";
import { debug } from "@/lib/debug";
import { getCacheAdapter } from "@/lib/gov-tracker-cache";
import { createRpcProvider } from "@/lib/rpc-utils";
import { createTracker, type ProposalStageTracker } from "@/lib/stage-tracker";
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

const MEMBER_DETAIL_PHASES = new Set([
  "MEMBER_ELECTION",
  "PENDING_EXECUTION",
  "COMPLETED",
]);

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
  latestElection: ElectionProposalStatus | null;
  nomineeDetails: NomineeElectionDetails | null;
  memberDetails: MemberElectionDetails | null;
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
  const [status, setStatus] = useState<ElectionStatus | null>(null);
  const [allElections, setAllElections] = useState<ElectionProposalStatus[]>(
    []
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    initialSelectedIndex
  );
  const [nomineeDetailsMap, setNomineeDetailsMap] = useState<
    Record<number, NomineeElectionDetails>
  >({});
  const [memberDetailsMap, setMemberDetailsMap] = useState<
    Record<number, MemberElectionDetails>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const l2Url = l2RpcUrl || ARBITRUM_RPC_URL;
  const l1Url = l1RpcUrl || ETHEREUM_RPC_URL;

  // Create tracker instance with cache - memoized to avoid recreation
  const trackerRef = useRef<ProposalStageTracker | null>(null);
  const tracker = useMemo(() => {
    if (!trackerRef.current) {
      trackerRef.current = createTracker(l2Url, l1Url, {
        cache: getCacheAdapter(),
      });
    }
    return trackerRef.current;
  }, [l2Url, l1Url]);

  const activeElections = useMemo(
    () => allElections.filter((e) => e.phase !== "COMPLETED"),
    [allElections]
  );

  const latestElection = useMemo(() => {
    if (activeElections.length > 0) {
      return activeElections[activeElections.length - 1];
    }
    if (allElections.length > 0) {
      return allElections[allElections.length - 1];
    }
    return null;
  }, [allElections, activeElections]);

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
          setAllElections(bundledElections);
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
      const l2Provider = await createRpcProvider(l2Url);
      debug.app("Fetching SC election status via tracker...");

      // Use tracker.checkElection() to get status and election count
      const checkResult = await tracker.checkElection();
      const electionStatus = checkResult.status;
      setStatus(electionStatus);

      debug.app(
        "Election status: count=%d, canCreate=%s",
        electionStatus.electionCount,
        electionStatus.canCreateElection
      );

      // Track all elections using tracker.trackElection() which auto-caches
      const elections: ElectionProposalStatus[] = [];
      for (let i = 0; i < electionStatus.electionCount; i++) {
        try {
          const electionResult = await tracker.trackElection(i);
          elections.push(electionResult);
        } catch (err) {
          debug.app("Failed to track election %d: %O", i, err);
        }
      }

      // Sort by election index
      elections.sort((a, b) => a.electionIndex - b.electionIndex);
      setAllElections(elections);

      debug.app("Tracked %d elections", elections.length);

      // Fetch nominee and member details for each election
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
    } catch (err) {
      debug.app("Election status error: %O", err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [enabled, tracker, l2Url]);

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const selectElection = useCallback((index: number | null) => {
    setSelectedIndex(index);
  }, []);

  // Only fetch from RPC after bundled cache has been checked
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
    latestElection,
    nomineeDetails,
    memberDetails,
    isLoading,
    error,
    refresh,
    selectElection,
  };
}
