"use client";

import { getGovernorTypeFromName } from "@/config/governors";
import { cn } from "@/lib/utils";

import { Badge } from "./Badge";

interface GovernorBadgeProps {
  governorName: string;
  /** Size variant: "sm" for mobile cards, "default" for table cells */
  size?: "sm" | "default";
  className?: string;
}

/**
 * Displays a styled badge indicating whether a proposal is from Core or Treasury governor
 */
export function GovernorBadge({
  governorName,
  size = "default",
  className,
}: GovernorBadgeProps) {
  const governorType = getGovernorTypeFromName(governorName);
  const isCore = governorType === "core";

  const sizeClasses = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs";

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        sizeClasses,
        isCore
          ? "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300"
          : "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300",
        className
      )}
    >
      {isCore ? "Core" : "Treasury"}
    </Badge>
  );
}
