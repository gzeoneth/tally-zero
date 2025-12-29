"use client";

import { memo } from "react";

import { Progress } from "@/components/ui/Progress";
import { STATUS_TEXT_COLORS } from "@/lib/badge-colors";
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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Quorum
        </span>
        <span
          className={cn(
            "text-xs font-semibold",
            reached ? STATUS_TEXT_COLORS.success : "text-foreground"
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
});
