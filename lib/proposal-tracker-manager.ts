/**
 * Singleton manager for proposal tracking sessions.
 * Ensures only one tracking session exists per proposal.
 */

import type {
  ProposalStage,
  ProposalTrackingResult,
} from "@/types/proposal-stage";

export type TrackingStatus =
  | "idle"
  | "queued"
  | "loading"
  | "complete"
  | "error";

export interface TrackingSession {
  proposalId: string;
  governorAddress: string;
  status: TrackingStatus;
  stages: ProposalStage[];
  currentStageIndex: number;
  result: ProposalTrackingResult | null;
  error: string | null;
  refreshingFromIndex: number | null;
  subscribers: Set<(session: TrackingSession) => void>;
  abortController: AbortController | null;
  queuePosition: number | null;
}

export interface QueuedItem {
  key: SessionKey;
  proposalId: string;
  governorAddress: string;
  startTracking: () => void;
}

type SessionKey = string;

function getSessionKey(
  proposalId: string,
  governorAddress: string
): SessionKey {
  return `${governorAddress.toLowerCase()}-${proposalId}`;
}

const MAX_CONCURRENT_TRACKING = 2;

class ProposalTrackerManager {
  private sessions: Map<SessionKey, TrackingSession> = new Map();
  private queue: QueuedItem[] = [];
  private activeCount = 0;
  private globalSubscribers: Set<() => void> = new Set();

  getSession(
    proposalId: string,
    governorAddress: string
  ): TrackingSession | undefined {
    const key = getSessionKey(proposalId, governorAddress);
    return this.sessions.get(key);
  }

  getAllSessions(): TrackingSession[] {
    return Array.from(this.sessions.values());
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  createSession(proposalId: string, governorAddress: string): TrackingSession {
    const key = getSessionKey(proposalId, governorAddress);

    // Return existing session if it exists
    const existing = this.sessions.get(key);
    if (existing) {
      return existing;
    }

    const session: TrackingSession = {
      proposalId,
      governorAddress,
      status: "idle",
      stages: [],
      currentStageIndex: -1,
      result: null,
      error: null,
      refreshingFromIndex: null,
      subscribers: new Set(),
      abortController: null,
      queuePosition: null,
    };

    this.sessions.set(key, session);
    return session;
  }

  updateSession(
    proposalId: string,
    governorAddress: string,
    updates: Partial<
      Omit<TrackingSession, "subscribers" | "proposalId" | "governorAddress">
    >
  ): void {
    const key = getSessionKey(proposalId, governorAddress);
    const session = this.sessions.get(key);
    if (!session) return;

    Object.assign(session, updates);
    this.notifySubscribers(session);
  }

  subscribe(
    proposalId: string,
    governorAddress: string,
    callback: (session: TrackingSession) => void
  ): () => void {
    const key = getSessionKey(proposalId, governorAddress);
    let session = this.sessions.get(key);

    if (!session) {
      session = this.createSession(proposalId, governorAddress);
    }

    session.subscribers.add(callback);

    // Immediately notify with current state
    callback(session);

    // Return unsubscribe function
    return () => {
      session?.subscribers.delete(callback);
    };
  }

  subscribeGlobal(callback: () => void): () => void {
    this.globalSubscribers.add(callback);
    return () => {
      this.globalSubscribers.delete(callback);
    };
  }

  private notifySubscribers(session: TrackingSession): void {
    session.subscribers.forEach((callback) => {
      try {
        callback(session);
      } catch (e) {
        console.error("[TrackerManager] Subscriber error:", e);
      }
    });
  }

  private notifyGlobalSubscribers(): void {
    this.globalSubscribers.forEach((callback) => {
      try {
        callback();
      } catch (e) {
        console.error("[TrackerManager] Global subscriber error:", e);
      }
    });
  }

  private updateQueuePositions(): void {
    this.queue.forEach((item, index) => {
      const session = this.sessions.get(item.key);
      if (session && session.status === "queued") {
        session.queuePosition = index + 1;
        this.notifySubscribers(session);
      }
    });
  }

  requestTracking(
    proposalId: string,
    governorAddress: string,
    startTrackingFn: () => void
  ): void {
    const key = getSessionKey(proposalId, governorAddress);
    const session = this.sessions.get(key);

    if (!session) return;

    if (session.status === "loading" || session.status === "complete") {
      return;
    }

    if (session.status === "queued") {
      return;
    }

    if (this.activeCount < MAX_CONCURRENT_TRACKING) {
      this.activeCount++;
      session.status = "loading";
      session.queuePosition = null;
      this.notifySubscribers(session);
      this.notifyGlobalSubscribers();
      startTrackingFn();
    } else {
      const queueItem: QueuedItem = {
        key,
        proposalId,
        governorAddress,
        startTracking: startTrackingFn,
      };
      this.queue.push(queueItem);
      session.status = "queued";
      session.queuePosition = this.queue.length;
      this.notifySubscribers(session);
      this.notifyGlobalSubscribers();
    }
  }

  trackingFinished(proposalId: string, governorAddress: string): void {
    const key = getSessionKey(proposalId, governorAddress);
    const session = this.sessions.get(key);

    if (session?.status === "loading") {
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.notifyGlobalSubscribers();
      this.processQueue();
    }
  }

  private processQueue(): void {
    while (
      this.activeCount < MAX_CONCURRENT_TRACKING &&
      this.queue.length > 0
    ) {
      const item = this.queue.shift();
      if (!item) break;

      const session = this.sessions.get(item.key);
      if (!session) continue;

      if (session.status !== "queued") {
        continue;
      }

      this.activeCount++;
      session.status = "loading";
      session.queuePosition = null;
      this.notifySubscribers(session);
      item.startTracking();
    }

    this.updateQueuePositions();
    this.notifyGlobalSubscribers();
  }

  isTracking(proposalId: string, governorAddress: string): boolean {
    const session = this.getSession(proposalId, governorAddress);
    return session?.status === "loading";
  }

  isQueued(proposalId: string, governorAddress: string): boolean {
    const session = this.getSession(proposalId, governorAddress);
    return session?.status === "queued";
  }

  abortTracking(proposalId: string, governorAddress: string): void {
    const key = getSessionKey(proposalId, governorAddress);
    const session = this.sessions.get(key);
    if (!session) return;

    if (session.status === "queued") {
      this.queue = this.queue.filter((item) => item.key !== key);
      session.status = "idle";
      session.queuePosition = null;
      this.updateQueuePositions();
      this.notifySubscribers(session);
      this.notifyGlobalSubscribers();
      return;
    }

    if (session.abortController) {
      session.abortController.abort();
      session.abortController = null;
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.processQueue();
    }
  }

  clearSession(proposalId: string, governorAddress: string): void {
    const key = getSessionKey(proposalId, governorAddress);
    const session = this.sessions.get(key);
    if (session) {
      if (session.status === "queued") {
        this.queue = this.queue.filter((item) => item.key !== key);
        this.updateQueuePositions();
      }
      if (session.status === "loading" && session.abortController) {
        session.abortController.abort();
        this.activeCount = Math.max(0, this.activeCount - 1);
      }
      this.sessions.delete(key);
      this.notifyGlobalSubscribers();
      this.processQueue();
    }
  }
}

// Singleton instance
export const trackerManager = new ProposalTrackerManager();
