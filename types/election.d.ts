export type ElectionPhase =
  | "NOT_STARTED"
  | "NOMINEE_SELECTION"
  | "VETTING_PERIOD"
  | "MEMBER_ELECTION"
  | "PENDING_EXECUTION"
  | "COMPLETED";

export interface PhaseMetadata {
  name: string;
  description: string;
  durationDays: number;
  colorClass: string;
}
