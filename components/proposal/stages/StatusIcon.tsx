"use client";

import type { StageStatus } from "@/types/proposal-stage";
import {
  CheckCircledIcon,
  CircleIcon,
  CrossCircledIcon,
  DotsHorizontalIcon,
} from "@radix-ui/react-icons";

export interface StatusIconProps {
  status: StageStatus;
}

/**
 * Icon representing the status of a proposal stage
 */
export function StatusIcon({ status }: StatusIconProps) {
  switch (status) {
    case "COMPLETED":
      return <CheckCircledIcon className="h-5 w-5 text-green-500" />;
    case "PENDING":
      return (
        <DotsHorizontalIcon className="h-5 w-5 text-yellow-500 animate-pulse" />
      );
    case "FAILED":
      return <CrossCircledIcon className="h-5 w-5 text-red-500" />;
    case "NOT_STARTED":
    default:
      return <CircleIcon className="h-5 w-5 text-muted-foreground" />;
  }
}
