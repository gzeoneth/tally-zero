"use client";

import { z } from "zod";

import VoteModel from "@/components/container/VoteModel";
import { Dialog, DialogTrigger } from "@/components/ui/Dialog";
import { Drawer, DrawerTrigger } from "@/components/ui/Drawer";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/HoverCard";
import { proposalSchema } from "@/config/schema";
import { states } from "@/data/table/data";
import { useLifecycleStatus } from "@/hooks/use-lifecycle-status";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import {
  CheckCircledIcon,
  ClockIcon,
  CrossCircledIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";

interface LifecycleCellProps {
  proposal: z.infer<typeof proposalSchema>;
}

export function LifecycleCell({ proposal }: LifecycleCellProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { status, currentState, queuePosition, currentStageIndex, stages } =
    useLifecycleStatus({
      proposalId: proposal.id,
      creationTxHash: proposal.creationTxHash,
      governorAddress: proposal.contractAddress,
      enabled: !!proposal.creationTxHash,
    });

  const stateValue = states.find((state) => state.value === proposal.state);

  if (!proposal.creationTxHash || !stateValue) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  const content = (
    <LifecycleContent
      status={status}
      currentState={currentState}
      queuePosition={queuePosition}
      currentStageIndex={currentStageIndex}
      stages={stages}
    />
  );

  if (status === "idle") {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  if (isDesktop) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <button className="text-left hover:opacity-80 transition-opacity">
            {content}
          </button>
        </DialogTrigger>
        <VoteModel
          proposal={proposal}
          stateValue={stateValue}
          isDesktop={isDesktop}
          defaultTab="stages"
        />
      </Dialog>
    );
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button className="text-left hover:opacity-80 transition-opacity">
          {content}
        </button>
      </DrawerTrigger>
      <VoteModel
        proposal={proposal}
        stateValue={stateValue}
        isDesktop={isDesktop}
        defaultTab="stages"
      />
    </Drawer>
  );
}

interface LifecycleContentProps {
  status: string;
  currentState: string | null;
  queuePosition: number | null;
  currentStageIndex: number;
  stages: Array<{ type: string; status: string }>;
}

function LifecycleContent({
  status,
  currentState,
  queuePosition,
  currentStageIndex,
  stages,
}: LifecycleContentProps) {
  if (status === "queued") {
    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-help">
            <ClockIcon className="h-3.5 w-3.5 text-yellow-500" />
            <span className="text-xs text-yellow-600 dark:text-yellow-400">
              Queue #{queuePosition}
            </span>
          </div>
        </HoverCardTrigger>
        <HoverCardContent className="w-auto">
          <p className="text-sm">Waiting in queue (position {queuePosition})</p>
          <p className="text-xs text-muted-foreground">
            Max 2 proposals tracked concurrently
          </p>
        </HoverCardContent>
      </HoverCard>
    );
  }

  if (status === "loading") {
    const progress =
      stages.length > 0 ? Math.round((stages.length / 10) * 100) : 0;
    const currentStageName = stages[currentStageIndex]?.type || "Starting...";

    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-help">
            <ReloadIcon className="h-3.5 w-3.5 text-blue-500 animate-spin" />
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-blue-600 dark:text-blue-400">
                Tracking
              </span>
              <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </HoverCardTrigger>
        <HoverCardContent className="w-auto">
          <p className="text-sm">
            Tracking lifecycle ({stages.length}/10 stages)
          </p>
          <p className="text-xs text-muted-foreground">
            Current: {formatStageName(currentStageName)}
          </p>
        </HoverCardContent>
      </HoverCard>
    );
  }

  if (status === "error") {
    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-help">
            <CrossCircledIcon className="h-3.5 w-3.5 text-red-500" />
            <span className="text-xs text-red-600 dark:text-red-400">
              Error
            </span>
          </div>
        </HoverCardTrigger>
        <HoverCardContent className="w-auto">
          <p className="text-sm">Failed to track lifecycle</p>
        </HoverCardContent>
      </HoverCard>
    );
  }

  if (status === "complete") {
    const stateDisplay = formatCurrentState(currentState);
    const { icon: StateIcon, color } = getStateStyle(currentState);

    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-help">
            <StateIcon className={cn("h-3.5 w-3.5", color)} />
            <span className={cn("text-xs font-medium", color)}>
              {stateDisplay}
            </span>
          </div>
        </HoverCardTrigger>
        <HoverCardContent className="w-auto">
          <p className="text-sm">Lifecycle tracked: {stages.length} stages</p>
          <p className="text-xs text-muted-foreground">Click to view details</p>
        </HoverCardContent>
      </HoverCard>
    );
  }

  return null;
}

function formatStageName(stageName: string): string {
  return stageName
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCurrentState(state: string | null): string {
  if (!state) return "Unknown";

  const stateMap: Record<string, string> = {
    Active: "Active",
    Pending: "Pending",
    Succeeded: "Passed",
    Defeated: "Defeated",
    Queued: "Queued",
    Executed: "Executed",
    Canceled: "Canceled",
    Expired: "Expired",
  };

  return stateMap[state] || state;
}

function getStateStyle(state: string | null): {
  icon: typeof CheckCircledIcon;
  color: string;
} {
  switch (state) {
    case "Executed":
      return {
        icon: CheckCircledIcon,
        color: "text-green-600 dark:text-green-400",
      };
    case "Active":
    case "Pending":
      return {
        icon: ReloadIcon,
        color: "text-blue-600 dark:text-blue-400",
      };
    case "Queued":
    case "Succeeded":
      return {
        icon: ClockIcon,
        color: "text-yellow-600 dark:text-yellow-400",
      };
    case "Defeated":
    case "Canceled":
    case "Expired":
      return {
        icon: CrossCircledIcon,
        color: "text-red-600 dark:text-red-400",
      };
    default:
      return {
        icon: ClockIcon,
        color: "text-muted-foreground",
      };
  }
}
