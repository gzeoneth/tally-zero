"use client";

import { memo, useCallback } from "react";

import VoteModel from "@/components/container/VoteModel";
import { ResponsiveModal, useIsDesktop } from "@/components/ui/ResponsiveModal";

import { proposalSchema } from "@/config/schema";
import { useDeepLink } from "@/context/DeepLinkContext";
import { findStateByValue } from "@/lib/state-utils";
import { stripMarkdownAndHtml, truncateText } from "@/lib/text-utils";
import { ParsedProposal } from "@/types/proposal";

export const DescriptionCell = memo(function DescriptionCell({
  mdxContent,
}: {
  mdxContent: string;
}) {
  const plainText = truncateText(stripMarkdownAndHtml(mdxContent));

  return <span className="block truncate font-medium">{plainText}</span>;
});

export function ClickableDescriptionCell({
  proposal,
  defaultTab = "description",
}: {
  proposal: ParsedProposal;
  defaultTab?: "description" | "payload" | "stages" | "vote";
}) {
  const isDesktop = useIsDesktop();
  const { openProposal, clearDeepLink } = useDeepLink();
  const parsedProposal = proposalSchema.parse(proposal);
  const stateValue = findStateByValue(proposal.state);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        openProposal(proposal.id, defaultTab);
      } else {
        clearDeepLink();
      }
    },
    [proposal.id, defaultTab, openProposal, clearDeepLink]
  );

  if (!stateValue) {
    return <DescriptionCell mdxContent={proposal.description} />;
  }

  const plainText = truncateText(stripMarkdownAndHtml(proposal.description));

  return (
    <ResponsiveModal
      trigger={
        <button
          className="block w-full truncate font-medium text-left hover:text-primary hover:underline transition-colors cursor-pointer"
          title="Click to view full description"
        >
          {plainText}
        </button>
      }
      onOpenChange={handleOpenChange}
    >
      <VoteModel
        proposal={parsedProposal}
        stateValue={stateValue}
        isDesktop={isDesktop}
        defaultTab={defaultTab}
      />
    </ResponsiveModal>
  );
}
