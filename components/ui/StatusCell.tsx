"use client";

import { z } from "zod";

import VoteModel from "@/components/container/VoteModel";
import { Badge } from "@/components/ui/Badge";
import { Dialog, DialogTrigger } from "@/components/ui/Dialog";
import { Drawer, DrawerTrigger } from "@/components/ui/Drawer";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/HoverCard";
import { proposalSchema } from "@/config/schema";
import { states } from "@/data/table/data";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useProposalStages } from "@/hooks/use-proposal-stages";
import {
  formatCurrentState,
  formatStageName,
  getStateStyle,
} from "@/lib/lifecycle-utils";
import { cn } from "@/lib/utils";
import {
  CheckCircledIcon,
  ClockIcon,
  CrossCircledIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { DotIcon } from "lucide-react";

interface StatusCellProps {
  proposal: z.infer<typeof proposalSchema>;
}

export function StatusCell({ proposal }: StatusCellProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const proposalStages = useProposalStages({
    proposalId: proposal.id,
    creationTxHash: proposal.creationTxHash || "",
    governorAddress: proposal.contractAddress,
    enabled: !!proposal.creationTxHash,
  });

  // Derive lifecycle status from proposal stages result
  const lifecycleStatus = proposalStages.isQueued
    ? "queued"
    : proposalStages.isLoading
      ? "loading"
      : proposalStages.error
        ? "error"
        : proposalStages.isComplete
          ? "complete"
          : "idle";

  const currentLifecycleState = proposalStages.result?.currentState || null;
  const { queuePosition, currentStageIndex, stages, isBackgroundRefreshing } =
    proposalStages;

  const stateValue = states.find((state) => state.value === proposal.state);

  if (!stateValue) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  // Determine if we should show lifecycle info as secondary
  const shouldShowLifecycle =
    proposal.creationTxHash &&
    lifecycleStatus !== "idle" &&
    lifecycleStatus !== "error";

  const lifecycleStateFormatted = formatCurrentState(currentLifecycleState);
  const showLifecycleAsSeparate =
    shouldShowLifecycle &&
    lifecycleStatus === "complete" &&
    lifecycleStateFormatted.toLowerCase() !== stateValue.label.toLowerCase();

  // Main state badge
  const mainBadge = (
    <Badge
      className={cn(
        "text-xs font-bold inline-flex items-center pr-5 -py-1 hover:bg-current/10 transition-colors duration-200 ease-in-out",
        stateValue.bgColor
      )}
    >
      <DotIcon className="mr-1" style={{ strokeWidth: "3" }} />
      {stateValue.label}
    </Badge>
  );

  // If no lifecycle tracking or same as state, just show the state badge
  if (!shouldShowLifecycle) {
    return mainBadge;
  }

  // If lifecycle differs from state, show both with lifecycle as clickable detail
  if (showLifecycleAsSeparate) {
    const lifecycleContent = (
      <LifecycleContent
        status={lifecycleStatus}
        currentState={currentLifecycleState}
        queuePosition={queuePosition}
        currentStageIndex={currentStageIndex}
        stages={stages}
        isBackgroundRefreshing={isBackgroundRefreshing}
      />
    );

    const DialogOrDrawer = isDesktop ? Dialog : Drawer;
    const TriggerComponent = isDesktop ? DialogTrigger : DrawerTrigger;

    return (
      <DialogOrDrawer>
        <TriggerComponent asChild>
          <div className="flex flex-col gap-1 cursor-pointer hover:opacity-80 transition-opacity">
            {mainBadge}
            <div className="text-xs text-muted-foreground pl-1">
              {lifecycleContent}
            </div>
          </div>
        </TriggerComponent>
        <VoteModel
          proposal={proposal}
          stateValue={stateValue}
          isDesktop={isDesktop}
          defaultTab="stages"
        />
      </DialogOrDrawer>
    );
  }

  // If lifecycle is loading/queued, show state with lifecycle indicator
  if (lifecycleStatus === "loading" || lifecycleStatus === "queued") {
    const lifecycleContent = (
      <LifecycleContent
        status={lifecycleStatus}
        currentState={currentLifecycleState}
        queuePosition={queuePosition}
        currentStageIndex={currentStageIndex}
        stages={stages}
        isBackgroundRefreshing={isBackgroundRefreshing}
      />
    );

    const DialogOrDrawer = isDesktop ? Dialog : Drawer;
    const TriggerComponent = isDesktop ? DialogTrigger : DrawerTrigger;

    return (
      <DialogOrDrawer>
        <TriggerComponent asChild>
          <div className="flex flex-col gap-1 cursor-pointer hover:opacity-80 transition-opacity">
            {mainBadge}
            <div className="text-xs text-muted-foreground pl-1">
              {lifecycleContent}
            </div>
          </div>
        </TriggerComponent>
        <VoteModel
          proposal={proposal}
          stateValue={stateValue}
          isDesktop={isDesktop}
          defaultTab="stages"
        />
      </DialogOrDrawer>
    );
  }

  // Default: just show the state badge (lifecycle matches state)
  return mainBadge;
}

interface LifecycleContentProps {
  status: string;
  currentState: string | null;
  queuePosition: number | null;
  currentStageIndex: number;
  stages: Array<{ type: string; status: string }>;
  isBackgroundRefreshing: boolean;
}

function LifecycleContent({
  status,
  currentState,
  queuePosition,
  currentStageIndex,
  stages,
  isBackgroundRefreshing,
}: LifecycleContentProps) {
  if (status === "queued") {
    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-help">
            <ClockIcon className="h-3 w-3 text-yellow-500" />
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
            <ReloadIcon className="h-3 w-3 text-blue-500 animate-spin" />
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

  if (status === "complete") {
    const stateDisplay = formatCurrentState(currentState);
    const { icon, color } = getStateStyle(currentState);
    const StateIcon = iconMap[icon];

    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-help">
            {isBackgroundRefreshing ? (
              <div className="relative">
                <StateIcon className={cn("h-3 w-3", color)} />
                <ReloadIcon className="absolute -top-0.5 -right-0.5 h-2 w-2 text-blue-500 animate-spin" />
              </div>
            ) : (
              <StateIcon className={cn("h-3 w-3", color)} />
            )}
            <span className={cn("text-xs font-medium", color)}>
              {stateDisplay}
            </span>
          </div>
        </HoverCardTrigger>
        <HoverCardContent className="w-auto">
          <p className="text-sm">Lifecycle tracked: {stages.length} stages</p>
          {isBackgroundRefreshing ? (
            <p className="text-xs text-blue-500">Refreshing in background...</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Click to view details
            </p>
          )}
        </HoverCardContent>
      </HoverCard>
    );
  }

  return null;
}

const iconMap = {
  check: CheckCircledIcon,
  reload: ReloadIcon,
  clock: ClockIcon,
  cross: CrossCircledIcon,
} as const;
