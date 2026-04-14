"use client";

import { z } from "zod";

import {
  ProposalDetail,
  type ProposalDetailTab,
} from "@components/proposal/ProposalDetail";
import { Badge } from "@components/ui/Badge";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@components/ui/Dialog";
import {
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@components/ui/Drawer";

import { proposalSchema } from "@config/schema";
import { cn } from "@lib/utils";

interface StateValue {
  value: string;
  label: string;
  bgColor: string;
  icon: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
}

interface ProposalHeaderProps {
  stateValue: StateValue;
}

function ProposalHeader({ stateValue }: ProposalHeaderProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <span>Proposal</span>
      <Badge
        className={cn(
          "text-xs font-semibold inline-flex items-center",
          stateValue.bgColor
        )}
      >
        <stateValue.icon className="mr-1" style={{ strokeWidth: "2" }} />
        {stateValue.label}
      </Badge>
    </div>
  );
}

export default function VoteModel({
  proposal,
  stateValue,
  isDesktop,
  defaultTab = "description",
}: {
  proposal: z.infer<typeof proposalSchema>;
  stateValue: StateValue;
  isDesktop: boolean;
  defaultTab?: ProposalDetailTab;
}) {
  if (isDesktop) {
    return (
      <DialogContent className="sm:max-w-[1000px] max-w-sm max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            <ProposalHeader stateValue={stateValue} />
          </DialogTitle>
        </DialogHeader>

        <ProposalDetail
          proposal={proposal}
          defaultTab={defaultTab}
          maxHeight="max-h-[60vh]"
          DescriptionWrapper={DialogDescription}
        />
      </DialogContent>
    );
  }

  return (
    <DrawerContent className="sm:max-w-[700px] px-4 py-4 max-h-[85vh]">
      <DrawerHeader className="flex-shrink-0">
        <DrawerTitle>
          <ProposalHeader stateValue={stateValue} />
        </DrawerTitle>
      </DrawerHeader>

      <ProposalDetail
        proposal={proposal}
        defaultTab={defaultTab}
        maxHeight="max-h-[50vh]"
        DescriptionWrapper={DrawerDescription}
      />
    </DrawerContent>
  );
}
