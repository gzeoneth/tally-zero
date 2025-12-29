"use client";

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

  // SVG circle math
  const radius = 15;
  const strokeWidth = 3;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex items-center gap-1.5">
      <svg
        viewBox="0 0 36 36"
        className="h-8 w-8"
        aria-label={`Quorum progress: ${percentage.toFixed(0)}%`}
      >
        {/* Background circle - glass effect */}
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-white/10"
        />
        {/* Progress circle */}
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={cn(
            "origin-center -rotate-90 transform transition-colors duration-300",
            isReached
              ? "stroke-emerald-500 dark:stroke-emerald-400"
              : "stroke-violet-500 dark:stroke-violet-400"
          )}
        />
        {/* Check icon when reached - native SVG path for proper centering */}
        {isReached && (
          <path
            d="M12 18 L16 22 L24 14"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-emerald-500 dark:stroke-emerald-400"
          />
        )}
      </svg>
      <span
        className={cn(
          "text-xs font-semibold transition-colors duration-300",
          isReached
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-foreground"
        )}
      >
        {percentage.toFixed(0)}%
      </span>
    </div>
  );
});
