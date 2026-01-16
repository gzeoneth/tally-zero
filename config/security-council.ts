import { ELECTION_TIMING } from "@gzeoneth/gov-tracker";

import type { ElectionPhase, PhaseMetadata } from "@/types/election";

export const SC_CONTRACTS = {
  NOMINEE_ELECTION_GOVERNOR: "0x8a1cDA8dee421cD06023470608605934c16A05a0",
  MEMBER_ELECTION_GOVERNOR: "0x467923B9AE90BDB36BA88eCA11604D45F13b712C",
  SECURITY_COUNCIL_MANAGER: "0xD509E5f5aEe2A205F554f36E8a7d56094494eDFC",
} as const;

export const ELECTION_DURATIONS = {
  CONTENDER_SUBMISSION: ELECTION_TIMING.CONTENDER_SUBMISSION_DAYS,
  NOMINEE_SELECTION: ELECTION_TIMING.NOMINEE_SELECTION_DAYS,
  VETTING_PERIOD: ELECTION_TIMING.VETTING_PERIOD_DAYS,
  MEMBER_ELECTION: ELECTION_TIMING.MEMBER_ELECTION_DAYS,
  TOTAL: ELECTION_TIMING.TOTAL_ELECTION_DAYS,
} as const;

export const PHASE_METADATA: Record<ElectionPhase, PhaseMetadata> = {
  NOT_STARTED: {
    name: "Not Started",
    description: "Election has not yet begun",
    durationDays: 0,
    colorClass: "text-muted-foreground",
  },
  CONTENDER_SUBMISSION: {
    name: "Contender Submission",
    description:
      "DAO members declare candidacy. Anyone can register as a contender.",
    durationDays: ELECTION_DURATIONS.CONTENDER_SUBMISSION,
    colorClass: "text-cyan-500",
  },
  NOMINEE_SELECTION: {
    name: "Nominee Selection",
    description:
      "Delegates endorse contenders to become nominees. Candidates need 0.2% of votable tokens.",
    durationDays: ELECTION_DURATIONS.NOMINEE_SELECTION,
    colorClass: "text-blue-500",
  },
  VETTING_PERIOD: {
    name: "Compliance Check",
    description:
      "The Arbitrum Foundation vets nominees for compliance with legal requirements.",
    durationDays: ELECTION_DURATIONS.VETTING_PERIOD,
    colorClass: "text-yellow-500",
  },
  MEMBER_ELECTION: {
    name: "Member Election",
    description:
      "Token holders vote for their preferred nominees. Top 6 are elected.",
    durationDays: ELECTION_DURATIONS.MEMBER_ELECTION,
    colorClass: "text-green-500",
  },
  PENDING_EXECUTION: {
    name: "Pending Execution",
    description:
      "Election succeeded. Waiting for execution to install new council members.",
    durationDays: 0,
    colorClass: "text-purple-500",
  },
  COMPLETED: {
    name: "Completed",
    description:
      "Election has been executed and new council members installed.",
    durationDays: 0,
    colorClass: "text-emerald-500",
  },
} as const;

export const TARGET_COHORT_SIZE = 6;

export const TOTAL_SC_MEMBERS = 12;

export const NOMINEE_QUORUM_PERCENT = 0.2;

export function getPhaseColor(phase: ElectionPhase): string {
  return PHASE_METADATA[phase].colorClass;
}

export function getPhaseBadgeVariant(
  phase: ElectionPhase
): "default" | "secondary" | "destructive" | "outline" {
  if (phase === "COMPLETED") return "default";
  if (phase === "NOT_STARTED") return "outline";
  return "secondary";
}

export function formatCohort(cohort: 0 | 1): string {
  return cohort === 0 ? "First Cohort" : "Second Cohort";
}

export function daysUntil(timestamp: number): number {
  const now = Math.floor(Date.now() / 1000);
  const diff = timestamp - now;
  return Math.max(0, Math.ceil(diff / 86400));
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "Now";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
