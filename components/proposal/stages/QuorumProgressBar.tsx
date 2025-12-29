"use client";

import { CheckCircledIcon, TargetIcon } from "@radix-ui/react-icons";
import { memo } from "react";

import { formatCompactNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";

export interface QuorumProgressBarProps {
  current: string;
  required: string;
  reached: boolean;
}

export const QuorumProgressBar = memo(function QuorumProgressBar({
  current,
  required,
  reached,
}: QuorumProgressBarProps) {
  const currentNum = parseFloat(current);
  const requiredNum = parseFloat(required);
  const percentage =
    requiredNum > 0 ? Math.min(100, (currentNum / requiredNum) * 100) : 0;

  return (
    <div className="glass-subtle rounded-lg px-3 py-2 space-y-2">
      {/* Header with icon and status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {reached ? (
            <CheckCircledIcon className="h-4 w-4 text-emerald-500" />
          ) : (
            <TargetIcon className="h-4 w-4 text-violet-500" />
          )}
          <span className="text-xs font-semibold text-foreground">
            Quorum {reached ? "Reached" : "Progress"}
          </span>
        </div>
        <span
          className={cn(
            "text-sm font-bold tabular-nums",
            reached
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-violet-600 dark:text-violet-400"
          )}
        >
          {percentage.toFixed(0)}%
        </span>
      </div>

      {/* Progress bar with gradient */}
      <div className="h-2 rounded-full overflow-hidden bg-white/10 dark:bg-white/5">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            reached
              ? "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.4)]"
              : "bg-gradient-to-r from-violet-500 to-violet-400"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Vote counts */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">
          {formatCompactNumber(current)} votes
        </span>
        <span className="tabular-nums">
          {formatCompactNumber(required)} required
        </span>
      </div>
    </div>
  );
});
