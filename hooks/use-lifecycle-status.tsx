"use client";

import {
  CORE_GOVERNOR,
  ETHEREUM_RPC_URL,
  TREASURY_GOVERNOR,
} from "@/config/arbitrum-governance";
import {
  createCoreGovernorTracker,
  createTreasuryGovernorTracker,
  type StageProgressCallback,
} from "@/lib/incremental-stage-tracker";
import {
  trackerManager,
  type TrackingSession,
  type TrackingStatus,
} from "@/lib/proposal-tracker-manager";
import type {
  ProposalStage,
  ProposalTrackingResult,
} from "@/types/proposal-stage";
import { CACHE_VERSION, STORAGE_KEYS } from "@config/storage-keys";
import { useCallback, useEffect, useRef, useState } from "react";

interface CachedResult {
  version: number;
  timestamp: number;
  result: ProposalTrackingResult;
}

function getCacheKey(proposalId: string, governorAddress: string): string {
  return `${STORAGE_KEYS.STAGES_CACHE_PREFIX}${governorAddress.toLowerCase()}-${proposalId}`;
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

function getStoredRpc(key: string, defaultValue: string): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem(key) || defaultValue;
  }
  return defaultValue;
}

export interface LifecycleStatus {
  status: TrackingStatus;
  currentState: string | null;
  queuePosition: number | null;
  currentStageIndex: number;
  totalStages: number;
  stages: ProposalStage[];
}

interface UseLifecycleStatusOptions {
  proposalId: string;
  creationTxHash?: string;
  governorAddress: string;
  enabled?: boolean;
}

export function useLifecycleStatus({
  proposalId,
  creationTxHash,
  governorAddress,
  enabled = true,
}: UseLifecycleStatusOptions): LifecycleStatus {
  const [status, setStatus] = useState<TrackingStatus>("idle");
  const [currentState, setCurrentState] = useState<string | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [currentStageIndex, setCurrentStageIndex] = useState(-1);
  const [stages, setStages] = useState<ProposalStage[]>([]);

  const isMounted = useRef(true);
  const hasInitialized = useRef(false);

  const effectiveL1RpcUrl = getStoredRpc(STORAGE_KEYS.L1_RPC, ETHEREUM_RPC_URL);
  const effectiveL2RpcUrl = getStoredRpc(STORAGE_KEYS.L2_RPC, "");

  const syncFromSession = useCallback((session: TrackingSession) => {
    if (!isMounted.current) return;
    setStatus(session.status);
    setQueuePosition(session.queuePosition);
    setCurrentStageIndex(session.currentStageIndex);
    setStages(session.stages);
    if (session.result?.currentState) {
      setCurrentState(session.result.currentState);
    }
  }, []);

  const startTracking = useCallback(async () => {
    if (!proposalId || !creationTxHash || !governorAddress) return;

    const abortController = new AbortController();

    trackerManager.updateSession(proposalId, governorAddress, {
      error: null,
      abortController,
      refreshingFromIndex: null,
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

      const onProgress: StageProgressCallback = (stage, index, _isLast) => {
        if (abortController.signal.aborted) return;

        const session = trackerManager.getSession(proposalId, governorAddress);
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
        onProgress
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
  }, [
    proposalId,
    creationTxHash,
    governorAddress,
    effectiveL1RpcUrl,
    effectiveL2RpcUrl,
  ]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !proposalId || !governorAddress) {
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

    // Only initialize tracking once per proposal
    if (!hasInitialized.current) {
      hasInitialized.current = true;

      // Check if we need to start tracking
      if (
        session.status !== "loading" &&
        session.status !== "queued" &&
        session.status !== "complete"
      ) {
        // Check for cached result
        const cached = loadCachedResult(proposalId, governorAddress);
        if (cached) {
          trackerManager.updateSession(proposalId, governorAddress, {
            stages: cached.stages,
            currentStageIndex: cached.stages.length - 1,
            result: cached,
            status: "complete",
          });
        } else if (creationTxHash) {
          // Queue for tracking
          trackerManager.requestTracking(
            proposalId,
            governorAddress,
            startTracking
          );
        }
      }
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
    status,
    currentState,
    queuePosition,
    currentStageIndex,
    totalStages: 10, // Total stages in the lifecycle
    stages,
  };
}
