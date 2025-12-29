"use client";

import VoteModel from "@/components/container/VoteModel";
import { Badge } from "@/components/ui/Badge";
import { Drawer, DrawerTrigger } from "@/components/ui/Drawer";
import { GovernorBadge } from "@/components/ui/GovernorBadge";
import { proposalSchema } from "@/config/schema";
import { findStateByValue } from "@/lib/state-utils";
import { stripMarkdownAndHtml, truncateText } from "@/lib/text-utils";
import { cn } from "@/lib/utils";
import { ParsedProposal } from "@/types/proposal";
import { ChevronRight, DotIcon } from "lucide-react";

interface MobileProposalCardProps {
  proposal: ParsedProposal;
}

export function MobileProposalCard({ proposal }: MobileProposalCardProps) {
  const parsedProposal = proposalSchema.parse(proposal);
  const stateValue = findStateByValue(proposal.state);
  const plainText = truncateText(
    stripMarkdownAndHtml(proposal.description),
    80
  );

  if (!stateValue) {
    return null;
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button className="w-full text-left p-4 bg-white dark:bg-zinc-950 rounded-xl border dark:border-zinc-800 hover:border-primary/50 transition-colors min-h-[88px] active:scale-[0.98] touch-manipulation">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm leading-snug line-clamp-2">
                {plainText}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge
                  className={cn(
                    "text-[10px] font-bold inline-flex items-center px-2 py-0.5",
                    stateValue.bgColor
                  )}
                >
                  <DotIcon
                    className="mr-0.5 h-3 w-3"
                    style={{ strokeWidth: "3" }}
                  />
                  {stateValue.label}
                </Badge>
                {proposal.governorName && (
                  <GovernorBadge
                    governorName={proposal.governorName}
                    size="sm"
                  />
                )}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
          </div>
        </button>
      </DrawerTrigger>
      <VoteModel
        proposal={parsedProposal}
        stateValue={stateValue}
        isDesktop={false}
        defaultTab="description"
      />
    </Drawer>
  );
}

interface MobileProposalListProps {
  proposals: ParsedProposal[];
}

export function MobileProposalList({ proposals }: MobileProposalListProps) {
  if (proposals.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No proposals found
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {proposals.map((proposal) => (
        <MobileProposalCard key={proposal.id} proposal={proposal} />
      ))}
    </div>
  );
}
