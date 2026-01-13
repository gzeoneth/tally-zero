"use client";

import { CheckCircle2, Circle, Clock } from "lucide-react";

import { PHASE_METADATA } from "@/config/security-council";
import { cn } from "@/lib/utils";
import type { ElectionPhase } from "@/types/election";

interface ElectionPhaseTimelineProps {
  currentPhase: ElectionPhase;
  className?: string;
}

const TIMELINE_PHASES: ElectionPhase[] = [
  "NOMINEE_SELECTION",
  "VETTING_PERIOD",
  "MEMBER_ELECTION",
  "PENDING_EXECUTION",
];

function getPhaseIndex(phase: ElectionPhase): number {
  if (phase === "NOT_STARTED") return -1;
  if (phase === "COMPLETED") return TIMELINE_PHASES.length;
  return TIMELINE_PHASES.indexOf(phase);
}

export function ElectionPhaseTimeline({
  currentPhase,
  className,
}: ElectionPhaseTimelineProps): React.ReactElement {
  const currentIndex = getPhaseIndex(currentPhase);

  return (
    <div className={cn("space-y-4", className)}>
      <h3 className="text-lg font-semibold">Election Timeline</h3>

      <div className="relative">
        {TIMELINE_PHASES.map((phase, index) => {
          const metadata = PHASE_METADATA[phase];
          const isCompleted = index < currentIndex;
          const isActive = index === currentIndex;
          const isFuture = index > currentIndex;

          return (
            <div key={phase} className="flex items-start gap-4 pb-8 last:pb-0">
              <div className="relative flex flex-col items-center">
                <PhaseIcon isCompleted={isCompleted} isActive={isActive} />
                {index < TIMELINE_PHASES.length - 1 && (
                  <div
                    className={cn(
                      "absolute top-8 h-full w-0.5",
                      isCompleted ? "bg-green-500" : "bg-border"
                    )}
                  />
                )}
              </div>

              <div className="flex-1 pt-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "font-medium",
                      isCompleted && "text-green-500",
                      isActive && "text-primary",
                      isFuture && "text-muted-foreground"
                    )}
                  >
                    {metadata.name}
                  </span>
                  {metadata.durationDays > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({metadata.durationDays} days)
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {metadata.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {currentPhase === "COMPLETED" && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-green-500">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-medium">Election Completed</span>
        </div>
      )}

      {currentPhase === "NOT_STARTED" && (
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 p-3 text-muted-foreground">
          <Clock className="h-5 w-5" />
          <span>No active election</span>
        </div>
      )}
    </div>
  );
}

function PhaseIcon({
  isCompleted,
  isActive,
}: {
  isCompleted: boolean;
  isActive: boolean;
}): React.ReactElement {
  if (isCompleted) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white">
        <CheckCircle2 className="h-5 w-5" />
      </div>
    );
  }

  if (isActive) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Circle className="h-5 w-5 fill-current" />
      </div>
    );
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-border bg-background">
      <Circle className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}
