"use client";

import { memo } from "react";

import { cn } from "@/lib/utils";
import type { ProposalVotes } from "@/types/proposal";

export interface VoteDistributionBarCompactProps {
  votes: ProposalVotes | undefined;
}

export const VoteDistributionBarCompact = memo(
  function VoteDistributionBarCompact({
    votes,
  }: VoteDistributionBarCompactProps) {
    if (!votes) {
      return (
        <span className="text-muted-foreground text-xs font-medium">-</span>
      );
    }

    const forNum = parseFloat(votes.forVotes) || 0;
    const againstNum = parseFloat(votes.againstVotes) || 0;
    const abstainNum = parseFloat(votes.abstainVotes) || 0;
    const total = forNum + againstNum + abstainNum;

    if (total === 0) {
      return (
        <span className="text-muted-foreground text-xs font-medium">-</span>
      );
    }

    const forPct = (forNum / total) * 100;
    const againstPct = (againstNum / total) * 100;
    const abstainPct = (abstainNum / total) * 100;

    // Only show percentages for segments that have votes
    const segments = [
      { pct: forPct, label: `${Math.round(forPct)}%`, type: "for" as const },
      {
        pct: againstPct,
        label: `${Math.round(againstPct)}%`,
        type: "against" as const,
      },
      {
        pct: abstainPct,
        label: `${Math.round(abstainPct)}%`,
        type: "abstain" as const,
      },
    ].filter((s) => s.pct > 0);

    return (
      <div className="w-24 space-y-0.5">
        {/* Stacked bar with glassmorphism */}
        <div className="flex h-1.5 rounded-full overflow-hidden bg-white/10 backdrop-blur-sm">
          {forPct > 0 && (
            <div
              className={cn(
                "bg-gradient-to-r from-emerald-500 to-emerald-400",
                "dark:from-emerald-400 dark:to-emerald-300",
                "transition-all"
              )}
              style={{ width: `${forPct}%` }}
            />
          )}
          {againstPct > 0 && (
            <div
              className={cn(
                "bg-gradient-to-r from-rose-500 to-rose-400",
                "dark:from-rose-400 dark:to-rose-300",
                "transition-all"
              )}
              style={{ width: `${againstPct}%` }}
            />
          )}
          {abstainPct > 0 && (
            <div
              className={cn(
                "bg-gradient-to-r from-gray-400 to-gray-300",
                "dark:from-gray-500 dark:to-gray-400",
                "transition-all"
              )}
              style={{ width: `${abstainPct}%` }}
            />
          )}
        </div>

        {/* Compact percentage labels */}
        <div className="flex justify-between text-[10px] text-muted-foreground">
          {segments.map((segment) => (
            <span
              key={segment.type}
              className={cn(
                segment.type === "for" &&
                  "text-emerald-600 dark:text-emerald-400",
                segment.type === "against" &&
                  "text-rose-600 dark:text-rose-400",
                segment.type === "abstain" && "text-muted-foreground"
              )}
            >
              {segment.label}
            </span>
          ))}
        </div>
      </div>
    );
  }
);
