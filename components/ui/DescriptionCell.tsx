"use client";

import VoteModel from "@/components/container/VoteModel";
import { Dialog, DialogTrigger } from "@/components/ui/Dialog";
import { Drawer, DrawerTrigger } from "@/components/ui/Drawer";

import { proposalSchema } from "@/config/schema";
import { states } from "@/data/table/data";
import { useMediaQuery } from "@/hooks/use-media-query";
import { stripMarkdownAndHtml, truncateText } from "@/lib/text-utils";
import { ParsedProposal } from "@/types/proposal";

export function DescriptionCell({ mdxContent }: { mdxContent: string }) {
  const plainText = truncateText(stripMarkdownAndHtml(mdxContent));

  return (
    <span className="max-w-[500px] truncate font-medium">{plainText}</span>
  );
}

export function ClickableDescriptionCell({
  proposal,
}: {
  proposal: ParsedProposal;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const parsedProposal = proposalSchema.parse(proposal);
  const stateValue = states.find(
    (state) => state.value.toLowerCase() === proposal.state?.toLowerCase()
  );

  if (!stateValue) {
    return <DescriptionCell mdxContent={proposal.description} />;
  }

  const plainText = truncateText(stripMarkdownAndHtml(proposal.description));

  if (isDesktop) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <button
            className="max-w-[500px] truncate font-medium text-left hover:text-primary hover:underline transition-colors cursor-pointer"
            title="Click to view full description"
          >
            {plainText}
          </button>
        </DialogTrigger>
        <VoteModel
          proposal={parsedProposal}
          stateValue={stateValue}
          isDesktop={isDesktop}
          defaultTab="description"
        />
      </Dialog>
    );
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          className="max-w-[500px] truncate font-medium text-left hover:text-primary hover:underline transition-colors cursor-pointer"
          title="Click to view full description"
        >
          {plainText}
        </button>
      </DrawerTrigger>
      <VoteModel
        proposal={parsedProposal}
        stateValue={stateValue}
        isDesktop={isDesktop}
        defaultTab="description"
      />
    </Drawer>
  );
}
