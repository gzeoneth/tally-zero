"use client";

import { ETHEREUM_RPC_URL } from "@/config/arbitrum-governance";
import { getGovernorByAddress, isCoreGovernor } from "@/config/governors";
import { DEFAULT_CACHE_TTL_MS, STORAGE_KEYS } from "@/config/storage-keys";
import {
  emitVoteUpdate,
  trackerManager,
  type TrackingSession,
} from "@/lib/proposal-tracker-manager";
import {
  createCoreGovernorTracker,
  createTreasuryGovernorTracker,
  getAllStageMetadata,
  type StageProgressCallback,
} from "@/lib/stage-tracker";
import {
  clearCachedStages,
  loadCachedStages,
  saveCachedStages,
} from "@/lib/stages-cache";
import { getStoredNumber } from "@/lib/storage-utils";
import type {
  ProposalStage,
  ProposalTrackingResult,
} from "@/types/proposal-stage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalStorage } from "./use-local-storage";

interface UseProposalStagesOptions {
  proposalId: string;
  creationTxHash: string;
  governorAddress: string;
  enabled?: boolean;
  l1RpcUrl?: string;
  l2RpcUrl?: string;
}

interface UseProposalStagesResult {
  stages: ProposalStage[];
  currentStageIndex: number;
  isLoading: boolean;
  isQueued: boolean;
  queuePosition: number | null;
  isComplete: boolean;
  error: string | null;
  result: ProposalTrackingResult | null;
  refetchFromStage: (stageIndex: number) => void;
  refreshingFromIndex: number | null;
  currentL1Block: number | null;
  isBackgroundRefreshing: boolean;
}

function getStoredCacheTtlMs(): number {
  // Stored value is in seconds, convert to ms
  const seconds = getStoredNumber(
    STORAGE_KEYS.CACHE_TTL,
    DEFAULT_CACHE_TTL_MS / 1000
  );
  return seconds > 0 ? seconds * 1000 : DEFAULT_CACHE_TTL_MS;
}

export function useProposalStages({
  proposalId,
  creationTxHash,
  governorAddress,
  enabled = true,
  l1RpcUrl,
  l2RpcUrl,
}: UseProposalStagesOptions): UseProposalStagesResult {
  const [storedL1Rpc, , l1RpcHydrated] = useLocalStorage(
    STORAGE_KEYS.L1_RPC,
    ETHEREUM_RPC_URL
  );
  const [storedL2Rpc, , l2RpcHydrated] = useLocalStorage(
    STORAGE_KEYS.L2_RPC,
    ""
  );
  const rpcHydrated = l1RpcHydrated && l2RpcHydrated;

  const effectiveL1RpcUrl = l1RpcUrl || storedL1Rpc;
  const effectiveL2RpcUrl = l2RpcUrl || storedL2Rpc;

  // Local state that syncs with the global session
  const [stages, setStages] = useState<ProposalStage[]>([]);
  const [currentStageIndex, setCurrentStageIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProposalTrackingResult | null>(null);
  const [refreshingFromIndex, setRefreshingFromIndex] = useState<number | null>(
    null
  );
  const [isQueued, setIsQueued] = useState(false);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [currentL1Block, setCurrentL1Block] = useState<number | null>(null);
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);

  const isMounted = useRef(true);

  // Sync local state from session
  const syncFromSession = useCallback((session: TrackingSession) => {
    if (!isMounted.current) return;
    setStages(session.stages);
    setCurrentStageIndex(session.currentStageIndex);
    setIsLoading(session.status === "loading");
    setIsQueued(session.status === "queued");
    setQueuePosition(session.queuePosition);
    setIsComplete(session.status === "complete");
    setError(session.error);
    setResult(session.result);
    setRefreshingFromIndex(session.refreshingFromIndex);
    setIsBackgroundRefreshing(session.isBackgroundRefreshing);
  }, []);

  // Start tracking function
  const startTracking = useCallback(
    async (startFromStage?: number, existingStages?: ProposalStage[]) => {
      if (!proposalId || !creationTxHash || !governorAddress) return;

      const abortController = new AbortController();

      trackerManager.updateSession(proposalId, governorAddress, {
        status: "loading",
        error: null,
        abortController,
        refreshingFromIndex: startFromStage ?? null,
      });

      try {
        const governorConfig = getGovernorByAddress(governorAddress);
        if (!governorConfig) {
          throw new Error(`Unknown governor address: ${governorAddress}`);
        }

        const tracker = isCoreGovernor(governorAddress)
          ? createCoreGovernorTracker(
              effectiveL2RpcUrl || undefined,
              effectiveL1RpcUrl || undefined
            )
          : createTreasuryGovernorTracker(
              effectiveL2RpcUrl || undefined,
              effectiveL1RpcUrl || undefined
            );

        const onProgress: StageProgressCallback = (stage, index) => {
          if (abortController.signal.aborted) return;

          const session = trackerManager.getSession(
            proposalId,
            governorAddress
          );
          if (!session) return;

          const newStages = [...session.stages];
          newStages[index] = stage;

          trackerManager.updateSession(proposalId, governorAddress, {
            stages: newStages,
            currentStageIndex: index,
          });
        };

        const trackingResult = await tracker.trackProposal(
          proposalId,
          creationTxHash,
          onProgress,
          startFromStage !== undefined ? existingStages : undefined,
          startFromStage
        );

        if (abortController.signal.aborted) return;

        trackerManager.trackingFinished(proposalId, governorAddress);

        trackerManager.updateSession(proposalId, governorAddress, {
          result: trackingResult,
          stages: trackingResult.stages,
          status: "complete",
          refreshingFromIndex: null,
          abortController: null,
          isBackgroundRefreshing: false,
        });

        saveCachedStages(proposalId, governorAddress, trackingResult);

        // Lifecycle tracker stores votes in ether format, convert to wei
        const votingStage = trackingResult.stages.find(
          (s) => s.type === "VOTING_ACTIVE"
        );
        const forVotesStr = votingStage?.data?.forVotes as string | undefined;
        if (forVotesStr) {
          try {
            const { ethers } = await import("ethers");
            const againstVotesStr =
              (votingStage?.data?.againstVotes as string) || "0";
            const abstainVotesStr =
              (votingStage?.data?.abstainVotes as string) || "0";
            emitVoteUpdate({
              proposalId,
              governorAddress,
              forVotes: ethers.utils.parseEther(forVotesStr).toString(),
              againstVotes: ethers.utils.parseEther(againstVotesStr).toString(),
              abstainVotes: ethers.utils.parseEther(abstainVotesStr).toString(),
            });
          } catch {
            // If conversion fails, skip the update
          }
        }
      } catch (err) {
        if (abortController.signal.aborted) return;
        trackerManager.trackingFinished(proposalId, governorAddress);

        trackerManager.updateSession(proposalId, governorAddress, {
          error: err instanceof Error ? err.message : String(err),
          status: "error",
          refreshingFromIndex: null,
          abortController: null,
          isBackgroundRefreshing: false,
        });
      }
    },
    [
      proposalId,
      creationTxHash,
      governorAddress,
      effectiveL1RpcUrl,
      effectiveL2RpcUrl,
    ]
  );

  // Refetch from a specific stage
  const refetchFromStage = useCallback(
    (stageIndex: number) => {
      if (!proposalId || !governorAddress) return;

      clearCachedStages(proposalId, governorAddress);

      // Abort any existing tracking
      trackerManager.abortTracking(proposalId, governorAddress);

      const session = trackerManager.getSession(proposalId, governorAddress);
      const existingStages = session?.stages ?? [];

      if (stageIndex === 0) {
        trackerManager.updateSession(proposalId, governorAddress, {
          stages: [],
          currentStageIndex: -1,
          status: "idle",
          result: null,
          error: null,
          queuePosition: null,
        });
        trackerManager.requestTracking(proposalId, governorAddress, () =>
          startTracking(0)
        );
      } else {
        // Truncate stages from the target index onward
        const truncatedStages = existingStages.slice(0, stageIndex);
        trackerManager.updateSession(proposalId, governorAddress, {
          stages: truncatedStages,
          currentStageIndex: stageIndex - 1,
          status: "idle",
          result: null,
          error: null,
          queuePosition: null,
        });
        trackerManager.requestTracking(proposalId, governorAddress, () =>
          startTracking(stageIndex, truncatedStages)
        );
      }
    },
    [proposalId, governorAddress, startTracking]
  );

  // Mount/unmount effect
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Fetch current L1 block for timing calculations
  useEffect(() => {
    if (!enabled || !rpcHydrated) return;

    const fetchL1Block = async () => {
      try {
        const response = await fetch(effectiveL1RpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_blockNumber",
            params: [],
            id: 1,
          }),
        });
        const data = await response.json();
        if (data.result && isMounted.current) {
          setCurrentL1Block(parseInt(data.result, 16));
        }
      } catch {
        // Silently fail - timing will use fallback
      }
    };

    // Fetch immediately
    fetchL1Block();

    // Refresh every 60 seconds
    const interval = setInterval(fetchL1Block, 60000);

    return () => clearInterval(interval);
  }, [enabled, rpcHydrated, effectiveL1RpcUrl]);

  // Function to trigger background refresh
  const triggerBackgroundRefresh = useCallback(() => {
    if (!proposalId || !governorAddress) return;

    const session = trackerManager.getSession(proposalId, governorAddress);
    if (!session) return;

    if (
      session.isBackgroundRefreshing ||
      session.status === "loading" ||
      session.status === "queued"
    ) {
      return;
    }

    trackerManager.updateSession(proposalId, governorAddress, {
      isBackgroundRefreshing: true,
      status: "idle",
    });

    trackerManager.requestTracking(proposalId, governorAddress, () =>
      startTracking()
    );
  }, [proposalId, governorAddress, startTracking]);

  // Subscribe to session and start tracking if needed
  useEffect(() => {
    if (
      !enabled ||
      !proposalId ||
      !creationTxHash ||
      !governorAddress ||
      !rpcHydrated
    ) {
      return;
    }

    // Create or get session
    const session = trackerManager.createSession(proposalId, governorAddress);

    // Subscribe to updates
    const unsubscribe = trackerManager.subscribe(
      proposalId,
      governorAddress,
      syncFromSession
    );

    // Check if we need to start tracking
    const checkAndStartTracking = () => {
      // Already tracking or queued
      if (session.status === "loading" || session.status === "queued") {
        return;
      }

      // Check for cached result
      const cacheTtlMs = getStoredCacheTtlMs();
      const {
        result: cached,
        isExpired,
        isComplete: allStagesCompleted,
      } = loadCachedStages(proposalId, governorAddress, cacheTtlMs);

      if (cached) {
        // Always load the cached data first
        trackerManager.updateSession(proposalId, governorAddress, {
          stages: cached.stages,
          currentStageIndex: cached.stages.length - 1,
          result: cached,
          status: "complete",
        });

        // If cache is expired and not all stages are completed, do a background refresh
        if (isExpired && !allStagesCompleted) {
          triggerBackgroundRefresh();
        }
        return;
      }

      // No cache, start fresh tracking
      if (session.status !== "complete") {
        trackerManager.requestTracking(proposalId, governorAddress, () =>
          startTracking()
        );
      }
    };

    checkAndStartTracking();

    return () => {
      unsubscribe();
    };
  }, [
    proposalId,
    creationTxHash,
    governorAddress,
    enabled,
    rpcHydrated,
    syncFromSession,
    startTracking,
    triggerBackgroundRefresh,
  ]);

  // Periodic TTL check - continuously check for expiration while user is on page
  useEffect(() => {
    if (!enabled || !proposalId || !governorAddress) return;

    const checkTtlExpiration = () => {
      const session = trackerManager.getSession(proposalId, governorAddress);
      if (!session || session.status !== "complete") return;
      if (session.isBackgroundRefreshing) return;

      const cacheTtlMs = getStoredCacheTtlMs();
      const { isExpired, isComplete: allStagesCompleted } = loadCachedStages(
        proposalId,
        governorAddress,
        cacheTtlMs
      );

      if (isExpired && !allStagesCompleted) {
        triggerBackgroundRefresh();
      }
    };

    // Check every 30 seconds
    const interval = setInterval(checkTtlExpiration, 30000);

    return () => clearInterval(interval);
  }, [enabled, proposalId, governorAddress, triggerBackgroundRefresh]);

  return {
    stages,
    currentStageIndex,
    isLoading,
    isQueued,
    queuePosition,
    isComplete,
    error,
    result,
    refetchFromStage,
    refreshingFromIndex,
    currentL1Block,
    isBackgroundRefreshing,
  };
}

export function getAllStageTypes(governorType: "core" | "treasury" = "core") {
  return getAllStageMetadata(governorType);
}
