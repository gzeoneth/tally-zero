"use client";

import { CheckIcon } from "@radix-ui/react-icons";
import { memo } from "react";

import { cn } from "@/lib/utils";

export interface QuorumIndicatorProps {
  current: string;
  required: string;
  reached?: boolean;
}

export const QuorumIndicator = memo(function QuorumIndicator({
  current,
  required,
  reached,
}: QuorumIndicatorProps) {
  const currentNum = parseFloat(current);
  const requiredNum = parseFloat(required);
  const percentage =
    requiredNum > 0 ? Math.min(100, (currentNum / requiredNum) * 100) : 0;

  // Calculate reached from percentage if not provided
  const isReached = reached ?? percentage >= 100;

  return (
    <div
      className="flex items-center gap-2"
      title={`Quorum: ${percentage.toFixed(0)}% of required votes`}
    >
      {/* Quorum label badge */}
      <div
        className={cn(
          "flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold transition-all duration-300",
          isReached
            ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30"
            : "bg-violet-500/20 text-violet-600 dark:text-violet-400 ring-1 ring-violet-500/30"
        )}
      >
        {isReached ? <CheckIcon className="h-3 w-3" /> : "Q"}
      </div>

      {/* Progress bar container */}
      <div className="w-12 space-y-0.5">
        {/* Progress track */}
        <div
          className={cn(
            "h-1.5 rounded-full overflow-hidden",
            "bg-white/10 dark:bg-white/5"
          )}
        >
          {/* Progress fill with glow effect when reached */}
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out",
              isReached
                ? "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                : "bg-gradient-to-r from-violet-500 to-violet-400"
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Percentage label */}
        <div
          className={cn(
            "text-[10px] font-semibold text-center transition-colors duration-300",
            isReached
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-violet-600 dark:text-violet-400"
          )}
        >
          {percentage.toFixed(0)}%
        </div>
      </div>
    </div>
  );
});
