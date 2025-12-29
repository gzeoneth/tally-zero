"use client";

import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import { Row } from "@tanstack/react-table";
import { useCallback, useState } from "react";

import VoteModel from "@/components/container/VoteModel";
import { Button } from "@components/ui/Button";
import { Dialog, DialogTrigger } from "@components/ui/Dialog";
import { Drawer, DrawerTrigger } from "@components/ui/Drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@components/ui/DropdownMenu";

import { useDeepLink } from "@/context/DeepLinkContext";
import { findStateByValue } from "@/lib/state-utils";
import { proposalSchema } from "@config/schema";

import { useMediaQuery } from "@hooks/use-media-query";

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row,
}: DataTableRowActionsProps<TData>) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { openProposal, clearDeepLink } = useDeepLink();
  const [open, setOpen] = useState(false);
  const proposal = proposalSchema.parse(row.original);
  const stateValue = findStateByValue(row.getValue("state") as string);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      setOpen(newOpen);
      if (newOpen) {
        openProposal(proposal.id);
      } else {
        clearDeepLink();
      }
    },
    [proposal.id, openProposal, clearDeepLink]
  );

  if (!stateValue) {
    return null;
  }

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex h-8 w-8 p-0 transition-all duration-200 hover:bg-white/20 dark:hover:bg-white/10 data-[state=open]:bg-white/20 dark:data-[state=open]:bg-white/10"
            >
              <DotsHorizontalIcon className="w-4 h-4 " />
              <span className="sr-only" data-state={proposal.state}>
                View proposal
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-[200px] glass-subtle rounded-lg"
          >
            <DialogTrigger asChild>
              <DropdownMenuItem className="transition-all duration-200 hover:bg-white/20 dark:hover:bg-white/10">
                <span>
                  View Proposal <span className="sr-only">{proposal.id}</span>
                </span>
              </DropdownMenuItem>
            </DialogTrigger>
            <DropdownMenuItem
              className="transition-all duration-200 hover:bg-white/20 dark:hover:bg-white/10"
              onClick={() => {
                navigator.clipboard.writeText(proposal.id.toString());
              }}
            >
              Copy Proposal ID
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <VoteModel
          proposal={proposal}
          stateValue={stateValue}
          isDesktop={isDesktop}
        />
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 transition-all duration-200 hover:bg-white/20 dark:hover:bg-white/10 data-[state=open]:bg-white/20 dark:data-[state=open]:bg-white/10"
          >
            <DotsHorizontalIcon className="w-4 h-4 " />
            <span className="sr-only" data-state={proposal.state}>
              View proposal
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-[200px] glass-subtle rounded-lg"
        >
          <DrawerTrigger asChild>
            <DropdownMenuItem className="transition-all duration-200 hover:bg-white/20 dark:hover:bg-white/10">
              <span>
                View Proposal <span className="sr-only">{proposal.id}</span>
              </span>
            </DropdownMenuItem>
          </DrawerTrigger>
          <DropdownMenuItem
            className="transition-all duration-200 hover:bg-white/20 dark:hover:bg-white/10"
            onClick={() => {
              navigator.clipboard.writeText(proposal.proposer);
            }}
          >
            Copy Proposer Address
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <VoteModel
        proposal={proposal}
        stateValue={stateValue}
        isDesktop={isDesktop}
      />
    </Drawer>
  );
}
