"use client";

import { memo } from "react";

import type { StageStatus } from "@/types/proposal-stage";
import {
  CheckCircledIcon,
  CircleIcon,
  CrossCircledIcon,
  DotsHorizontalIcon,
  MinusCircledIcon,
  PlayIcon,
  StopIcon,
} from "@radix-ui/react-icons";

export interface StatusIconProps {
  status: StageStatus;
}

export const StatusIcon = memo(function StatusIcon({
  status,
}: StatusIconProps) {
  switch (status) {
    case "COMPLETED":
      return <CheckCircledIcon className="h-5 w-5 text-green-500" />;
    case "READY":
      return <PlayIcon className="h-5 w-5 text-blue-500" />;
    case "PENDING":
      return (
        <DotsHorizontalIcon className="h-5 w-5 text-yellow-500 animate-pulse" />
      );
    case "FAILED":
      return <CrossCircledIcon className="h-5 w-5 text-red-500" />;
    case "SKIPPED":
      return <MinusCircledIcon className="h-5 w-5 text-muted-foreground/50" />;
    case "CANCELED":
      return <StopIcon className="h-5 w-5 text-orange-500" />;
    case "NOT_STARTED":
    default:
      return <CircleIcon className="h-5 w-5 text-muted-foreground" />;
  }
});
