"use client";

import {
  CORE_GOVERNOR,
  ETHEREUM_RPC_URL,
  TREASURY_GOVERNOR,
} from "@/config/arbitrum-governance";
import {
  STAGE_METADATA,
  createCoreGovernorTracker,
  createTreasuryGovernorTracker,
  type StageProgressCallback,
} from "@/lib/incremental-stage-tracker";
import {
  trackerManager,
  type TrackingSession,
} from "@/lib/proposal-tracker-manager";
import type {
  ProposalStage,
  ProposalTrackingResult,
} from "@/types/proposal-stage";
import { useCallback, useEffect, useRef, useState } from "react";

const L1_RPC_KEY = "tally-zero-l1-rpc";
const L2_RPC_KEY = "tally-zero-l2-rpc";
const CACHE_PREFIX = "tally-zero-stages-";
const CACHE_VERSION = 1;

interface CachedResult {
  version: number;
  timestamp: number;
  result: ProposalTrackingResult;
}

function getCacheKey(proposalId: string, governorAddress: string): string {
  return `${CACHE_PREFIX}${governorAddress.toLowerCase()}-${proposalId}`;
}

function loadCachedResult(
  proposalId: string,
  governorAddress: string
): ProposalTrackingResult | null {
  if (typeof window === "undefined") return null;
  try {
    const key = getCacheKey(proposalId, governorAddress);
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const parsed: CachedResult = JSON.parse(cached);
    if (parsed.version !== CACHE_VERSION) return null;
    return parsed.result;
  } catch {
    return null;
  }
}

function saveCachedResult(
  proposalId: string,
  governorAddress: string,
  result: ProposalTrackingResult
): void {
  if (typeof window === "undefined") return;
  try {
    const key = getCacheKey(proposalId, governorAddress);
    const cached: CachedResult = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      result,
    };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch {
    // Storage full or unavailable
  }
}

function clearCachedResult(proposalId: string, governorAddress: string): void {
  if (typeof window === "undefined") return;
  try {
    const key = getCacheKey(proposalId, governorAddress);
    localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

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
  isComplete: boolean;
  error: string | null;
  result: ProposalTrackingResult | null;
  refetchFromStage: (stageIndex: number) => void;
  refreshingFromIndex: number | null;
}

function getStoredRpc(key: string, defaultValue: string): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem(key) || defaultValue;
  }
  return defaultValue;
}

export function useProposalStages({
  proposalId,
  creationTxHash,
  governorAddress,
  enabled = true,
  l1RpcUrl,
  l2RpcUrl,
}: UseProposalStagesOptions): UseProposalStagesResult {
  const effectiveL1RpcUrl =
    l1RpcUrl || getStoredRpc(L1_RPC_KEY, ETHEREUM_RPC_URL);
  const effectiveL2RpcUrl = l2RpcUrl || getStoredRpc(L2_RPC_KEY, "");

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

  const isMounted = useRef(true);

  // Sync local state from session
  const syncFromSession = useCallback((session: TrackingSession) => {
    if (!isMounted.current) return;
    setStages(session.stages);
    setCurrentStageIndex(session.currentStageIndex);
    setIsLoading(session.status === "loading");
    setIsComplete(session.status === "complete");
    setError(session.error);
    setResult(session.result);
    setRefreshingFromIndex(session.refreshingFromIndex);
  }, []);

  // Start tracking function
  const startTracking = useCallback(
    async (startFromStage?: number, existingStages?: ProposalStage[]) => {
      if (!proposalId || !creationTxHash || !governorAddress) return;

      // Check if already tracking
      if (trackerManager.isTracking(proposalId, governorAddress)) {
        console.log("[useProposalStages] Already tracking, skipping start");
        return;
      }

      const abortController = new AbortController();

      trackerManager.updateSession(proposalId, governorAddress, {
        status: "loading",
        error: null,
        abortController,
        refreshingFromIndex: startFromStage ?? null,
      });

      try {
        const isCoreGovernor =
          governorAddress.toLowerCase() === CORE_GOVERNOR.address.toLowerCase();
        const isTreasuryGovernor =
          governorAddress.toLowerCase() ===
          TREASURY_GOVERNOR.address.toLowerCase();

        if (!isCoreGovernor && !isTreasuryGovernor) {
          throw new Error(`Unknown governor address: ${governorAddress}`);
        }

        const tracker = isCoreGovernor
          ? createCoreGovernorTracker(
              effectiveL2RpcUrl || undefined,
              effectiveL1RpcUrl
            )
          : createTreasuryGovernorTracker(
              effectiveL2RpcUrl || undefined,
              effectiveL1RpcUrl
            );

        const onProgress: StageProgressCallback = (stage, index, isLast) => {
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

          if (isLast) {
            trackerManager.updateSession(proposalId, governorAddress, {
              status: "complete",
            });
          }
        };

        const trackingResult = await tracker.trackProposal(
          proposalId,
          creationTxHash,
          onProgress,
          startFromStage !== undefined ? existingStages : undefined,
          startFromStage
        );

        if (abortController.signal.aborted) return;

        trackerManager.updateSession(proposalId, governorAddress, {
          result: trackingResult,
          stages: trackingResult.stages,
          status: "complete",
          refreshingFromIndex: null,
          abortController: null,
        });

        saveCachedResult(proposalId, governorAddress, trackingResult);
      } catch (err) {
        if (abortController.signal.aborted) return;
        trackerManager.updateSession(proposalId, governorAddress, {
          error: err instanceof Error ? err.message : String(err),
          status: "error",
          refreshingFromIndex: null,
          abortController: null,
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

      clearCachedResult(proposalId, governorAddress);

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
        });
        startTracking(0);
      } else {
        // Truncate stages from the target index onward
        const truncatedStages = existingStages.slice(0, stageIndex);
        trackerManager.updateSession(proposalId, governorAddress, {
          stages: truncatedStages,
          currentStageIndex: stageIndex - 1,
          status: "idle",
          result: null,
          error: null,
        });
        startTracking(stageIndex, truncatedStages);
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

  // Subscribe to session and start tracking if needed
  useEffect(() => {
    if (!enabled || !proposalId || !creationTxHash || !governorAddress) {
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
    const shouldStartTracking = () => {
      // Already tracking or complete
      if (session.status === "loading" || session.status === "complete") {
        console.log(
          `[useProposalStages] Session status is ${session.status}, not starting new tracking`
        );
        return false;
      }

      // Check for cached result
      const cached = loadCachedResult(proposalId, governorAddress);
      if (cached) {
        console.log("[useProposalStages] Found cached result, restoring");
        trackerManager.updateSession(proposalId, governorAddress, {
          stages: cached.stages,
          currentStageIndex: cached.stages.length - 1,
          result: cached,
          status: "complete",
        });
        return false;
      }

      return true;
    };

    // Only start tracking if session is idle
    if (shouldStartTracking()) {
      console.log("[useProposalStages] Starting new tracking session");
      startTracking();
    }

    return () => {
      unsubscribe();
    };
  }, [
    proposalId,
    creationTxHash,
    governorAddress,
    enabled,
    syncFromSession,
    startTracking,
  ]);

  return {
    stages,
    currentStageIndex,
    isLoading,
    isComplete,
    error,
    result,
    refetchFromStage,
    refreshingFromIndex,
  };
}

export function getAllStageTypes() {
  return STAGE_METADATA;
}
