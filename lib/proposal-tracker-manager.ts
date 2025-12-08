/**
 * Singleton manager for proposal tracking sessions.
 * Ensures only one tracking session exists per proposal, even if the component
 * is unmounted and remounted.
 */

import type {
  ProposalStage,
  ProposalTrackingResult,
} from "@/types/proposal-stage";

export type TrackingStatus = "idle" | "loading" | "complete" | "error";

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
}

type SessionKey = string;

function getSessionKey(
  proposalId: string,
  governorAddress: string
): SessionKey {
  return `${governorAddress.toLowerCase()}-${proposalId}`;
}

class ProposalTrackerManager {
  private sessions: Map<SessionKey, TrackingSession> = new Map();

  getSession(
    proposalId: string,
    governorAddress: string
  ): TrackingSession | undefined {
    const key = getSessionKey(proposalId, governorAddress);
    return this.sessions.get(key);
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

  private notifySubscribers(session: TrackingSession): void {
    session.subscribers.forEach((callback) => {
      try {
        callback(session);
      } catch (e) {
        console.error("[TrackerManager] Subscriber error:", e);
      }
    });
  }

  isTracking(proposalId: string, governorAddress: string): boolean {
    const session = this.getSession(proposalId, governorAddress);
    return session?.status === "loading";
  }

  abortTracking(proposalId: string, governorAddress: string): void {
    const session = this.getSession(proposalId, governorAddress);
    if (session?.abortController) {
      session.abortController.abort();
      session.abortController = null;
    }
  }

  clearSession(proposalId: string, governorAddress: string): void {
    const key = getSessionKey(proposalId, governorAddress);
    const session = this.sessions.get(key);
    if (session) {
      session.abortController?.abort();
      this.sessions.delete(key);
    }
  }
}

// Singleton instance
export const trackerManager = new ProposalTrackerManager();
