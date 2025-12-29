"use client";

import { Progress } from "@/components/ui/Progress";
import { formatCompactNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";

export interface QuorumProgressBarProps {
  current: string;
  required: string;
  reached: boolean;
}

/**
 * Progress bar showing quorum progress for a proposal vote
 */
export function QuorumProgressBar({
  current,
  required,
  reached,
}: QuorumProgressBarProps) {
  const currentNum = parseFloat(current);
  const requiredNum = parseFloat(required);
  const percentage =
    requiredNum > 0 ? Math.min(100, (currentNum / requiredNum) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Quorum
        </span>
        <span
          className={cn(
            "text-xs font-semibold",
            reached ? "text-green-600 dark:text-green-400" : "text-foreground"
          )}
        >
          {percentage.toFixed(0)}%
        </span>
      </div>
      <Progress
        value={percentage}
        className={cn(
          "h-2",
          reached && "[&>div]:bg-green-500 dark:[&>div]:bg-green-400"
        )}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatCompactNumber(current)}</span>
        <span>{formatCompactNumber(required)}</span>
      </div>
    </div>
  );
}
