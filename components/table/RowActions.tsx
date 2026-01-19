"use client";

import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import { Row } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import VoteModel from "@/components/container/VoteModel";
import { isArbitrumGovernor } from "@/config/arbitrum";
import { Button } from "@components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@components/ui/Dialog";
import { Drawer, DrawerTrigger } from "@components/ui/Drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@components/ui/DropdownMenu";

const ProposalStages = dynamic(
  () =>
    import("@/components/proposal/ProposalStages").then(
      (mod) => mod.ProposalStages
    ),
  {
    ssr: false,
    loading: () => (
      <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading stages...
      </div>
    ),
  }
);

import { proposalSchema } from "@config/schema";
import { states } from "@data/table/data";

import { useMediaQuery } from "@hooks/use-media-query";

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row,
}: DataTableRowActionsProps<TData>) {
  const [stagesOpen, setStagesOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const proposal = proposalSchema.parse(row.original);
  const stateValue = states.find(
    (state) => state.value === row.getValue("state")
  );

  const showStagesOption =
    isArbitrumGovernor(proposal.contractAddress) && proposal.transactionHash;

  if (!stateValue) {
    return null;
  }

  if (isDesktop) {
    return (
      <>
        <Dialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
              >
                <DotsHorizontalIcon className="w-4 h-4 " />
                <span className="sr-only" data-state={proposal.state}>
                  View proposal
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DialogTrigger asChild>
                <DropdownMenuItem>
                  <span>
                    View Proposal <span className="sr-only">{proposal.id}</span>
                  </span>
                </DropdownMenuItem>
              </DialogTrigger>
              {showStagesOption && (
                <DropdownMenuItem onClick={() => setStagesOpen(true)}>
                  View Lifecycle Stages
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
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

        {showStagesOption && (
          <Dialog open={stagesOpen} onOpenChange={setStagesOpen}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Proposal Lifecycle</DialogTitle>
              </DialogHeader>
              <ProposalStages txHash={proposal.transactionHash!} />
            </DialogContent>
          </Dialog>
        )}
      </>
    );
  }

  return (
    <>
      <Drawer>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
            >
              <DotsHorizontalIcon className="w-4 h-4 " />
              <span className="sr-only" data-state={proposal.state}>
                View proposal
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px]">
            <DrawerTrigger asChild>
              <DropdownMenuItem>
                <span>
                  View Proposal <span className="sr-only">{proposal.id}</span>
                </span>
              </DropdownMenuItem>
            </DrawerTrigger>
            {showStagesOption && (
              <DropdownMenuItem onClick={() => setStagesOpen(true)}>
                View Lifecycle Stages
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
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

      {showStagesOption && (
        <Dialog open={stagesOpen} onOpenChange={setStagesOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Proposal Lifecycle</DialogTitle>
            </DialogHeader>
            <ProposalStages txHash={proposal.transactionHash!} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
