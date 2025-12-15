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
import {
  CACHE_TTL_MS,
  CACHE_VERSION,
  STORAGE_KEYS,
} from "@config/storage-keys";
import { useCallback, useEffect, useRef, useState } from "react";

interface CachedResult {
  version: number;
  timestamp: number;
  result: ProposalTrackingResult;
}

function getCacheKey(proposalId: string, governorAddress: string): string {
  return `${STORAGE_KEYS.STAGES_CACHE_PREFIX}${governorAddress.toLowerCase()}-${proposalId}`;
}

interface CacheLoadResult {
  result: ProposalTrackingResult | null;
  isExpired: boolean;
  allStagesCompleted: boolean;
}

function areAllStagesCompleted(result: ProposalTrackingResult): boolean {
  if (!result.stages || result.stages.length === 0) return false;
  const lastStage = result.stages[result.stages.length - 1];
  return lastStage.status === "COMPLETED";
}

function loadCachedResult(
  proposalId: string,
  governorAddress: string,
  ttlMs: number = CACHE_TTL_MS
): CacheLoadResult {
  if (typeof window === "undefined") {
    return { result: null, isExpired: false, allStagesCompleted: false };
  }
  try {
    const key = getCacheKey(proposalId, governorAddress);
    const cached = localStorage.getItem(key);
    if (!cached) {
      return { result: null, isExpired: false, allStagesCompleted: false };
    }
    const parsed: CachedResult = JSON.parse(cached);
    if (parsed.version !== CACHE_VERSION) {
      return { result: null, isExpired: false, allStagesCompleted: false };
    }

    const isExpired = Date.now() - parsed.timestamp > ttlMs;
    const allStagesCompleted = areAllStagesCompleted(parsed.result);

    return {
      result: parsed.result,
      isExpired,
      allStagesCompleted,
    };
  } catch {
    return { result: null, isExpired: false, allStagesCompleted: false };
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

function getStoredRpc(key: string, defaultValue: string): string {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        // Values are stored via useLocalStorage which uses JSON.stringify
        return JSON.parse(stored) || defaultValue;
      } catch {
        return stored || defaultValue;
      }
    }
    return defaultValue;
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
  const storedL1Rpc = getStoredRpc(STORAGE_KEYS.L1_RPC, ETHEREUM_RPC_URL);
  const storedL2Rpc = getStoredRpc(STORAGE_KEYS.L2_RPC, "");

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
        });

        saveCachedResult(proposalId, governorAddress, trackingResult);
      } catch (err) {
        if (abortController.signal.aborted) return;
        trackerManager.trackingFinished(proposalId, governorAddress);

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
    if (!enabled) return;

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
  }, [enabled, effectiveL1RpcUrl]);

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
    const checkAndStartTracking = () => {
      // Already tracking or queued
      if (session.status === "loading" || session.status === "queued") {
        return;
      }

      // Check for cached result
      const {
        result: cached,
        isExpired,
        allStagesCompleted,
      } = loadCachedResult(proposalId, governorAddress);

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
          setIsBackgroundRefreshing(true);
          trackerManager.requestTracking(
            proposalId,
            governorAddress,
            async () => {
              await startTracking();
              if (isMounted.current) {
                setIsBackgroundRefreshing(false);
              }
            }
          );
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
    syncFromSession,
    startTracking,
  ]);

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

export function getAllStageTypes() {
  return STAGE_METADATA;
}
