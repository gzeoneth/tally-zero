"use client";

import {
  getFinalStageForGovernor,
  getGovernorByAddress,
} from "@/config/governors";
import {
  CACHE_TTL_CHECK_INTERVAL_MS,
  L1_BLOCK_CACHE_FRESHNESS_MS,
  L1_BLOCK_REFRESH_INTERVAL_MS,
} from "@/config/storage-keys";
import { getErrorMessage } from "@/lib/error-utils";
import {
  clearProposalCheckpoint,
  getCacheAdapter,
  loadCheckpoint,
} from "@/lib/gov-tracker-cache";
import {
  emitVoteUpdate,
  trackerManager,
  type TrackingSession,
} from "@/lib/proposal-tracker-manager";
import {
  createProposalTracker,
  toProposalTrackingResult,
} from "@/lib/stage-tracker";
import { getStoredCacheTtlMs } from "@/lib/storage-utils";
import type {
  ProposalStage,
  ProposalTrackingResult,
} from "@/types/proposal-stage";
import {
  getAllStageMetadata,
  type GovernorTrackingInput,
  type ProposalQueuedData,
  type StageType,
  type TrackingCheckpoint,
  type TrackingProgress,
} from "@gzeoneth/gov-tracker";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRpcSettings } from "./use-rpc-settings";

// Shared L1 block cache to avoid redundant RPC calls across hook instances
let sharedL1Block: { block: number; timestamp: number } | null = null;
let pendingL1BlockPromise: Promise<number | null> | null = null;

/**
 * Fetch L1 block with deduplication - multiple callers share the same result
 * within a short time window
 */
async function fetchSharedL1Block(rpcUrl: string): Promise<number | null> {
  // Return cached value if fresh
  if (
    sharedL1Block &&
    Date.now() - sharedL1Block.timestamp < L1_BLOCK_CACHE_FRESHNESS_MS
  ) {
    return sharedL1Block.block;
  }

  // If a fetch is already in progress, wait for it
  if (pendingL1BlockPromise) {
    return pendingL1BlockPromise;
  }

  // Start a new fetch
  pendingL1BlockPromise = (async () => {
    try {
      const response = await fetch(rpcUrl, {
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
      if (data.result) {
        const block = parseInt(data.result, 16);
        sharedL1Block = { block, timestamp: Date.now() };
        return block;
      }
      return null;
    } catch {
      return null;
    } finally {
      pendingL1BlockPromise = null;
    }
  })();

  return pendingL1BlockPromise;
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

/**
 * Convert TrackingCheckpoint to ProposalTrackingResult
 */
function checkpointToResult(
  checkpoint: TrackingCheckpoint,
  proposalId: string,
  creationTxHash: string,
  governorAddress: string
): ProposalTrackingResult {
  const stages = checkpoint.cachedData.completedStages ?? [];
  const input = checkpoint.input as GovernorTrackingInput;

  // Extract timelockLink from PROPOSAL_QUEUED stage if present
  const queuedStage = stages.find((s) => s.type === "PROPOSAL_QUEUED");
  const queuedData = queuedStage?.data as ProposalQueuedData | undefined;
  let timelockLink = undefined;
  if (queuedData?.timelockAddress && queuedData?.operationId && queuedStage) {
    const queueTx = queuedStage.transactions[0];
    timelockLink = {
      timelockAddress: queuedData.timelockAddress,
      operationId: queuedData.operationId,
      txHash: queueTx?.hash ?? "",
      queueBlockNumber: queueTx?.blockNumber ?? 0,
    };
  }

  // Determine current state from voting stage
  const votingStage = stages.find((s) => s.type === "VOTING_ACTIVE");
  interface VotingData {
    proposalState?: string;
  }
  const votingData = votingStage?.data as VotingData | undefined;
  const currentState = votingData?.proposalState
    ? votingData.proposalState.charAt(0).toUpperCase() +
      votingData.proposalState.slice(1)
    : undefined;

  return {
    proposalId: input.proposalId ?? proposalId,
    creationTxHash: input.creationTxHash ?? creationTxHash,
    governorAddress: input.governorAddress ?? governorAddress,
    stages,
    timelockLink,
    currentState,
  };
}

/**
 * Check if checkpoint stages are complete for this governor
 */
function isCheckpointComplete(
  checkpoint: TrackingCheckpoint,
  governorAddress: string
): boolean {
  const stages = checkpoint.cachedData.completedStages ?? [];
  if (stages.length === 0) return false;

  // Check if any stage failed
  const hasFailed = stages.some((s) => s.status === "FAILED");
  if (hasFailed) return true;

  // Check if reached final stage for this governor
  const expectedFinal = getFinalStageForGovernor(governorAddress);
  if (!expectedFinal) return false;

  const finalStage = stages.find((s) => s.type === expectedFinal);
  if (finalStage?.status === "COMPLETED") return true;

  // Check for SKIPPED stages (shortened execution path)
  const hasSkipped = stages.some((s) => s.status === "SKIPPED");
  if (hasSkipped) {
    for (let i = stages.length - 1; i >= 0; i--) {
      if (stages[i].status === "COMPLETED") return true;
    }
  }

  return false;
}

/**
 * Check if checkpoint needs refresh based on TTL
 */
function checkpointNeedsRefresh(
  checkpoint: TrackingCheckpoint,
  governorAddress: string,
  ttlMs: number
): boolean {
  if (isCheckpointComplete(checkpoint, governorAddress)) {
    return false;
  }
  const age = Date.now() - checkpoint.createdAt;
  return age > ttlMs;
}

export function useProposalStages({
  proposalId,
  creationTxHash,
  governorAddress,
  enabled = true,
  l1RpcUrl,
  l2RpcUrl,
}: UseProposalStagesOptions): UseProposalStagesResult {
  const {
    l1Rpc,
    l2Rpc,
    l1ChunkSize,
    l2ChunkSize,
    isHydrated: rpcHydrated,
  } = useRpcSettings();

  const cacheTtlMs = getStoredCacheTtlMs();

  const effectiveL1RpcUrl = l1RpcUrl || l1Rpc;
  const effectiveL2RpcUrl = l2RpcUrl || l2Rpc;

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

  // Start tracking function using gov-tracker
  const startTracking = useCallback(async () => {
    if (!proposalId || !creationTxHash || !governorAddress) return;

    const abortController = new AbortController();

    trackerManager.updateSession(proposalId, governorAddress, {
      status: "loading",
      error: null,
      abortController,
      refreshingFromIndex: null,
    });

    try {
      const governorConfig = getGovernorByAddress(governorAddress);
      if (!governorConfig) {
        throw new Error(`Unknown governor address: ${governorAddress}`);
      }

      // Create tracker with progress callback
      const onProgress = (stage: ProposalStage, index: number) => {
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

      // Get cache adapter - gov-tracker handles caching automatically
      const cache = getCacheAdapter();

      // Create tracker using gov-tracker package with cache for resume
      const tracker = createProposalTracker(
        effectiveL2RpcUrl || undefined,
        effectiveL1RpcUrl || undefined,
        {
          onProgress: (progress: TrackingProgress) => {
            onProgress(progress.stage, progress.currentIndex);
          },
          chunkingConfig: {
            l1ChunkSize,
            l2ChunkSize,
          },
          cache,
        }
      );

      // Track by transaction hash
      const results = await tracker.trackByTxHash(creationTxHash);

      if (abortController.signal.aborted) {
        trackerManager.updateSession(proposalId, governorAddress, {
          isBackgroundRefreshing: false,
        });
        return;
      }

      // Use first result (governor proposals return single result)
      const trackingResult = results[0];
      if (!trackingResult) {
        throw new Error("No tracking result returned");
      }

      // Add proposal metadata for UI display
      const proposalResult = toProposalTrackingResult(
        trackingResult,
        proposalId,
        creationTxHash,
        governorAddress
      );

      trackerManager.trackingFinished(proposalId, governorAddress);

      trackerManager.updateSession(proposalId, governorAddress, {
        result: proposalResult,
        stages: proposalResult.stages,
        status: "complete",
        refreshingFromIndex: null,
        abortController: null,
        isBackgroundRefreshing: false,
      });

      // Emit vote update using raw values from gov-tracker
      const votingStage = proposalResult.stages.find(
        (s) => s.type === "VOTING_ACTIVE"
      );
      const forVotesRaw = votingStage?.data?.forVotesRaw as string | undefined;
      if (forVotesRaw) {
        emitVoteUpdate({
          proposalId,
          governorAddress,
          forVotes: forVotesRaw,
          againstVotes: (votingStage?.data?.againstVotesRaw as string) || "0",
          abstainVotes: (votingStage?.data?.abstainVotesRaw as string) || "0",
        });
      }
    } catch (err) {
      if (abortController.signal.aborted) {
        trackerManager.updateSession(proposalId, governorAddress, {
          isBackgroundRefreshing: false,
        });
        return;
      }
      trackerManager.trackingFinished(proposalId, governorAddress);

      trackerManager.updateSession(proposalId, governorAddress, {
        error: getErrorMessage(err, "track proposal stages"),
        status: "error",
        refreshingFromIndex: null,
        abortController: null,
        isBackgroundRefreshing: false,
      });
    }
  }, [
    proposalId,
    creationTxHash,
    governorAddress,
    effectiveL1RpcUrl,
    effectiveL2RpcUrl,
    l1ChunkSize,
    l2ChunkSize,
  ]);

  // Refetch from a specific stage (stageIndex is kept for API compatibility but we always re-track fully)
  const refetchFromStage = useCallback(
    (_stageIndex: number) => {
      if (!proposalId || !governorAddress || !creationTxHash) return;

      // Clear the gov-tracker checkpoint so it re-tracks fresh
      const cache = getCacheAdapter();
      clearProposalCheckpoint(cache, creationTxHash);

      // Abort any existing tracking
      trackerManager.abortTracking(proposalId, governorAddress);

      // Reset session to idle with no cached stages
      trackerManager.updateSession(proposalId, governorAddress, {
        stages: [],
        currentStageIndex: -1,
        status: "idle",
        result: null,
        error: null,
        queuePosition: null,
      });

      // Start fresh tracking
      trackerManager.requestTracking(proposalId, governorAddress, () =>
        startTracking()
      );
    },
    [proposalId, governorAddress, creationTxHash, startTracking]
  );

  // Mount/unmount effect
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Fetch current L1 block for timing calculations (uses shared cache)
  useEffect(() => {
    if (!enabled || !rpcHydrated) return;

    const updateL1Block = async () => {
      const block = await fetchSharedL1Block(effectiveL1RpcUrl);
      if (block !== null && isMounted.current) {
        setCurrentL1Block(block);
      }
    };

    // Fetch immediately (may use cached value)
    updateL1Block();

    // Refresh periodically
    const interval = setInterval(updateL1Block, L1_BLOCK_REFRESH_INTERVAL_MS);

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

    // Mark as background refreshing
    trackerManager.updateSession(proposalId, governorAddress, {
      isBackgroundRefreshing: true,
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
    const checkAndStartTracking = async () => {
      // Already tracking or queued
      if (session.status === "loading" || session.status === "queued") {
        return;
      }

      // Check for cached checkpoint
      const cache = getCacheAdapter();
      const checkpoint = await loadCheckpoint(cache, creationTxHash);

      if (checkpoint && checkpoint.cachedData.completedStages?.length) {
        // Load cached stages into session
        const cachedResult = checkpointToResult(
          checkpoint,
          proposalId,
          creationTxHash,
          governorAddress
        );

        trackerManager.updateSession(proposalId, governorAddress, {
          stages: cachedResult.stages,
          currentStageIndex: cachedResult.stages.length - 1,
          result: cachedResult,
          status: "complete",
        });

        // Check if needs background refresh
        if (checkpointNeedsRefresh(checkpoint, governorAddress, cacheTtlMs)) {
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
    cacheTtlMs,
  ]);

  // Periodic TTL check
  useEffect(() => {
    if (!enabled || !proposalId || !governorAddress || !creationTxHash) return;

    const checkTtlExpiration = async () => {
      const session = trackerManager.getSession(proposalId, governorAddress);
      if (!session || session.status !== "complete") return;
      if (session.isBackgroundRefreshing) return;

      const cache = getCacheAdapter();
      const checkpoint = await loadCheckpoint(cache, creationTxHash);
      if (!checkpoint) return;

      if (checkpointNeedsRefresh(checkpoint, governorAddress, cacheTtlMs)) {
        triggerBackgroundRefresh();
      }
    };

    const interval = setInterval(
      checkTtlExpiration,
      CACHE_TTL_CHECK_INTERVAL_MS
    );

    return () => clearInterval(interval);
  }, [
    enabled,
    proposalId,
    governorAddress,
    creationTxHash,
    triggerBackgroundRefresh,
    cacheTtlMs,
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

/** Stage metadata with type included for array iteration */
export interface StageMetadataWithType {
  type: StageType;
  title: string;
  description: string;
  chain: "ethereum" | "arb1" | "nova" | "unknown" | "CROSS_CHAIN";
  estimatedDays: number;
  requiresAction: boolean;
}

/**
 * Get all stage metadata as an array with type included
 */
export function getAllStageTypes(
  _governorType: "core" | "treasury" = "core"
): StageMetadataWithType[] {
  const metadata = getAllStageMetadata();
  return (
    Object.entries(metadata) as [StageType, (typeof metadata)[StageType]][]
  ).map(([type, meta]) => ({
    type,
    ...meta,
  }));
}
