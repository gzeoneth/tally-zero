"use client";

import VoteModel from "@/components/container/VoteModel";
import { ResponsiveModal, useIsDesktop } from "@/components/ui/ResponsiveModal";

import { proposalSchema } from "@/config/schema";
import { findStateByValue } from "@/lib/state-utils";
import { stripMarkdownAndHtml, truncateText } from "@/lib/text-utils";
import { ParsedProposal } from "@/types/proposal";

export function DescriptionCell({ mdxContent }: { mdxContent: string }) {
  const plainText = truncateText(stripMarkdownAndHtml(mdxContent));

  return <span className="block truncate font-medium">{plainText}</span>;
}

export function ClickableDescriptionCell({
  proposal,
}: {
  proposal: ParsedProposal;
}) {
  const isDesktop = useIsDesktop();
  const parsedProposal = proposalSchema.parse(proposal);
  const stateValue = findStateByValue(proposal.state);

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
    >
      <VoteModel
        proposal={parsedProposal}
        stateValue={stateValue}
        isDesktop={isDesktop}
        defaultTab="description"
      />
    </ResponsiveModal>
  );
}
