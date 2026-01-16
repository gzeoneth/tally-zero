"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  checkElectionStatus,
  createTracker,
  getElectionCount,
  getMemberElectionDetails,
  getNomineeElectionDetails,
  serializeMemberDetails,
  serializeNomineeDetails,
  trackElectionProposal,
  type ElectionProposalStatus,
  type ElectionStatus,
  type ChunkingConfig as GovTrackerChunkingConfig,
  type ProposalStageTracker,
  type SerializableMemberDetails,
  type SerializableNomineeDetails,
} from "@gzeoneth/gov-tracker";
import { ethers } from "ethers";
import { toast } from "sonner";

import { initializeBundledCache } from "@/lib/bundled-cache-loader";
import { debug } from "@/lib/debug";
import { getCacheAdapter } from "@/lib/gov-tracker-cache";
import {
  ARBITRUM_RPC_URL,
  ETHEREUM_RPC_URL,
} from "@config/arbitrum-governance";

type NomineeElectionDetails = SerializableNomineeDetails | null;
type MemberElectionDetails = SerializableMemberDetails | null;

function isCorsOrNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("cors") ||
    msg.includes("access-control-allow-origin") ||
    msg.includes("blocked by cors")
  );
}

export interface UseElectionStatusOptions {
  enabled?: boolean;
  l2RpcUrl?: string;
  l1RpcUrl?: string;
  l1ChunkSize?: number;
  l2ChunkSize?: number;
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

interface TrackerWithProviders {
  tracker: ProposalStageTracker;
  l2Provider: ethers.providers.StaticJsonRpcProvider;
  l1Provider: ethers.providers.StaticJsonRpcProvider;
}

interface ChunkSizes {
  l1ChunkSize?: number;
  l2ChunkSize?: number;
}

let cachedTracker: TrackerWithProviders | null = null;
let cachedRpcUrls: { l2: string; l1: string } | null = null;
let cachedChunkSizes: ChunkSizes | null = null;
let bundledCacheInitialized = false;

function buildChunkingConfig(
  chunkSizes?: ChunkSizes
): GovTrackerChunkingConfig | undefined {
  if (!chunkSizes?.l1ChunkSize && !chunkSizes?.l2ChunkSize) {
    return undefined;
  }
  return {
    l1ChunkSize: chunkSizes.l1ChunkSize ?? 10000,
    l2ChunkSize: chunkSizes.l2ChunkSize ?? 10000000,
    delayBetweenChunks: 100,
  };
}

async function getTrackerWithProviders(
  l2RpcUrl: string,
  l1RpcUrl: string,
  chunkSizes?: ChunkSizes
): Promise<TrackerWithProviders> {
  const cache = getCacheAdapter();

  if (!bundledCacheInitialized) {
    await initializeBundledCache(cache);
    bundledCacheInitialized = true;
  }

  // Check if we need to recreate the tracker (RPC or chunk config changed)
  const chunkConfigChanged =
    chunkSizes?.l1ChunkSize !== cachedChunkSizes?.l1ChunkSize ||
    chunkSizes?.l2ChunkSize !== cachedChunkSizes?.l2ChunkSize;

  if (
    !cachedTracker ||
    !cachedRpcUrls ||
    cachedRpcUrls.l2 !== l2RpcUrl ||
    cachedRpcUrls.l1 !== l1RpcUrl ||
    chunkConfigChanged
  ) {
    const l2Provider = new ethers.providers.StaticJsonRpcProvider(l2RpcUrl);
    const l1Provider = new ethers.providers.StaticJsonRpcProvider(l1RpcUrl);

    const chunkingConfig = buildChunkingConfig(chunkSizes);
    const tracker = createTracker({
      l2Provider,
      l1Provider,
      cache,
      chunkingConfig,
    });

    cachedTracker = { tracker, l2Provider, l1Provider };
    cachedRpcUrls = { l2: l2RpcUrl, l1: l1RpcUrl };
    cachedChunkSizes = chunkSizes ?? null;
  }

  return cachedTracker;
}

export function useElectionStatus({
  enabled = true,
  l2RpcUrl,
  l1RpcUrl,
  l1ChunkSize,
  l2ChunkSize,
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
  const [trackingIndices, setTrackingIndices] = useState<Set<number>>(
    new Set()
  );
  const shownErrorToastRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

  const l2Url = l2RpcUrl || ARBITRUM_RPC_URL;
  const l1Url = l1RpcUrl || ETHEREUM_RPC_URL;
  const chunkSizes = useMemo<ChunkSizes | undefined>(
    () =>
      l1ChunkSize || l2ChunkSize ? { l1ChunkSize, l2ChunkSize } : undefined,
    [l1ChunkSize, l2ChunkSize]
  );

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

  // Lightweight initial load - only gets election count and cached data
  // Does NOT track uncached elections (that happens on-demand when selected)
  const fetchElectionData = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const { tracker, l2Provider, l1Provider } = await getTrackerWithProviders(
        l2Url,
        l1Url,
        chunkSizes
      );

      debug.app("Fetching SC election status (lightweight)...");

      // Get election count first (lightweight, L2-only call)
      const electionCount = await getElectionCount(l2Provider);
      debug.app("Election count: %d", electionCount);

      const cachedElections: ElectionProposalStatus[] = [];
      const cachedNomineeDetails: Record<number, NomineeElectionDetails> = {};
      const cachedMemberDetails: Record<number, MemberElectionDetails> = {};
      const uncachedIndices: number[] = [];

      // Check cache for each election (including next potential election)
      for (let i = 0; i <= electionCount; i++) {
        const checkpoint = await tracker.getElectionCheckpoint(i);
        if (checkpoint) {
          debug.cache("Election %d loaded from cache", i);
          cachedElections.push(checkpoint.status);
          if (checkpoint.nomineeDetails) {
            cachedNomineeDetails[i] = checkpoint.nomineeDetails;
          }
          if (checkpoint.memberDetails) {
            cachedMemberDetails[i] = checkpoint.memberDetails;
          }
        } else {
          uncachedIndices.push(i);
        }
      }

      // Set cached elections immediately
      setAllElections(cachedElections);
      setNomineeDetailsMap((prev) => ({ ...prev, ...cachedNomineeDetails }));
      setMemberDetailsMap((prev) => ({ ...prev, ...cachedMemberDetails }));

      if (uncachedIndices.length > 0) {
        debug.app(
          "Found %d uncached elections: %O (will track on-demand when selected)",
          uncachedIndices.length,
          uncachedIndices
        );
      } else {
        debug.app("All %d elections loaded from cache", cachedElections.length);
      }

      initialLoadDoneRef.current = true;

      // Fetch full election status (includes nextElectionTimestamp, canCreateElection)
      const electionStatus = await checkElectionStatus(l2Provider, l1Provider);
      setStatus(electionStatus);

      debug.app(
        "Election status: count=%d, canCreate=%s, cached=%d",
        electionStatus.electionCount,
        electionStatus.canCreateElection,
        cachedElections.length
      );
    } catch (err) {
      debug.app("Election status error: %O", err);
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);

      if (isCorsOrNetworkError(error) && !shownErrorToastRef.current) {
        shownErrorToastRef.current = true;
        toast.error("Failed to load elections", {
          description:
            "The RPC endpoint may have CORS issues. Try configuring a different RPC URL in Settings.",
          duration: 10000,
          action: {
            label: "Settings",
            onClick: () => {
              document
                .querySelector<HTMLButtonElement>('[aria-label="Settings"]')
                ?.click();
            },
          },
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [enabled, l2Url, l1Url, chunkSizes]);

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const selectElection = useCallback((index: number | null) => {
    setSelectedIndex(index);
  }, []);

  useEffect(() => {
    fetchElectionData();
  }, [fetchElectionData, refreshTrigger]);

  useEffect(() => {
    if (!enabled || refreshInterval <= 0) return;

    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [enabled, refreshInterval, refresh]);

  // Track selected election on-demand if not already cached
  useEffect(() => {
    if (!enabled || !initialLoadDoneRef.current) return;
    if (selectedIndex === null) return;

    // Check if election already exists in allElections
    const existingElection = allElections.find(
      (e) => e.electionIndex === selectedIndex
    );
    if (existingElection) return;

    // Check if already tracking this index
    if (trackingIndices.has(selectedIndex)) return;

    const trackSelectedElection = async () => {
      const indexToTrack = selectedIndex;
      setTrackingIndices((prev) => new Set([...prev, indexToTrack]));
      setIsLoading(true);

      try {
        const { l2Provider, l1Provider } = await getTrackerWithProviders(
          l2Url,
          l1Url,
          chunkSizes
        );

        debug.app("On-demand tracking election %d", indexToTrack);

        const result = await trackElectionProposal(
          indexToTrack,
          l2Provider,
          l1Provider
        );

        if (result) {
          // Get nominee/member details
          const nominee = await getNomineeElectionDetails(
            indexToTrack,
            l2Provider
          );
          const member =
            result.phase === "MEMBER_ELECTION" ||
            result.phase === "PENDING_EXECUTION" ||
            result.phase === "COMPLETED"
              ? await getMemberElectionDetails(indexToTrack, l2Provider)
              : null;

          // Add to allElections (maintain order by electionIndex)
          setAllElections((prev) => {
            const updated = [...prev, result];
            updated.sort((a, b) => a.electionIndex - b.electionIndex);
            return updated;
          });

          if (nominee) {
            setNomineeDetailsMap((prev) => ({
              ...prev,
              [indexToTrack]: serializeNomineeDetails(nominee),
            }));
          }

          if (member) {
            setMemberDetailsMap((prev) => ({
              ...prev,
              [indexToTrack]: serializeMemberDetails(member),
            }));
          }

          debug.app(
            "Successfully tracked election %d: %s",
            indexToTrack,
            result.phase
          );
        } else {
          debug.app("Election %d not found or not started", indexToTrack);
        }
      } catch (err) {
        debug.app("Failed to track election %d: %O", indexToTrack, err);
      } finally {
        setTrackingIndices((prev) => {
          const next = new Set(prev);
          next.delete(indexToTrack);
          return next;
        });
        setIsLoading(false);
      }
    };

    trackSelectedElection();
  }, [
    enabled,
    selectedIndex,
    allElections,
    trackingIndices,
    l2Url,
    l1Url,
    chunkSizes,
  ]);

  // Fetch details only for the selected election (lazy loading)
  useEffect(() => {
    if (!selectedElection || !enabled) return;

    const electionIndex = selectedElection.electionIndex;

    // Skip if we already have details for this election
    if (nomineeDetailsMap[electionIndex] !== undefined) {
      return;
    }

    const fetchDetails = async () => {
      try {
        const { l2Provider } = await getTrackerWithProviders(
          l2Url,
          l1Url,
          chunkSizes
        );

        debug.app("Fetching details for election %d", electionIndex);

        const nominee = await getNomineeElectionDetails(
          electionIndex,
          l2Provider
        );
        if (nominee) {
          setNomineeDetailsMap((prev) => ({
            ...prev,
            [electionIndex]: serializeNomineeDetails(nominee),
          }));
        }

        if (
          selectedElection.phase === "MEMBER_ELECTION" ||
          selectedElection.phase === "PENDING_EXECUTION" ||
          selectedElection.phase === "COMPLETED"
        ) {
          const member = await getMemberElectionDetails(
            electionIndex,
            l2Provider
          );
          if (member) {
            setMemberDetailsMap((prev) => ({
              ...prev,
              [electionIndex]: serializeMemberDetails(member),
            }));
          }
        }
      } catch (err) {
        debug.app(
          "Failed to fetch details for election %d: %O",
          electionIndex,
          err
        );
      }
    };

    fetchDetails();
  }, [selectedElection, enabled, l2Url, l1Url, chunkSizes, nomineeDetailsMap]);

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
