"use client";

import { ColumnDef, Row } from "@tanstack/react-table";

import { ProposerCell } from "@components/container/ProposerCell";
import { DataTableColumnHeader } from "@components/table/ColumnHeader";
import { DataTableRowActions } from "@components/table/RowActions";
import { Badge } from "@components/ui/Badge";
import { ClickableDescriptionCell } from "@components/ui/DescriptionCell";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@components/ui/HoverCard";
import { LifecycleCell } from "@components/ui/LifecycleCell";
import { VoteDisplay } from "@components/ui/VoteDisplay";

import { getGovernorTypeFromName } from "@/config/governors";
import { ParsedProposal } from "@/types/proposal";
import { states } from "@data/table/data";
import { cn } from "@lib/utils";

import { DotIcon } from "lucide-react";

export const columns: ColumnDef<ParsedProposal>[] = [
  {
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Proposal ID" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => {
      const id = row.getValue("id") as string;

      return id.length < 6 ? (
        <span>{id}</span>
      ) : (
        <HoverCard>
          <HoverCardTrigger className="underline hover:font-semibold hover:cursor-pointer transition-transform duration-200 ease-in-out transform hover:scale-105">
            {`${id.substring(0, 5)}...${id.substring(id.length - 2)}`}
          </HoverCardTrigger>
          <HoverCardContent className="w-full">{id}</HoverCardContent>
        </HoverCard>
      );
    },

    enableHiding: false,
  },
  {
    accessorKey: "proposer",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Proposer" />
    ),
    cell: ({ row }) => (
      <div className="flex space-x-2">
        <ProposerCell proposer={row.getValue("proposer")} />
      </div>
    ),
  },
  {
    accessorKey: "description",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Proposal" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => {
      return (
        <div className="flex space-x-2 max-w-[225px] lg:max-w-[400px] truncate">
          <ClickableDescriptionCell proposal={row.original} />
        </div>
      );
    },
  },
  {
    accessorKey: "governorName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Governor" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => {
      const governorType = getGovernorTypeFromName(row.original.governorName);
      const isCore = governorType === "core";
      return (
        <Badge
          variant="outline"
          className={cn(
            "text-xs font-medium",
            isCore
              ? "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300"
              : "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
          )}
        >
          {isCore ? "Core" : "Treasury"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "state",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="State" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => {
      const rowState = (row.getValue("state") as string)?.toLowerCase();
      const stateValue = states.find(
        (state) => state.value.toLowerCase() === rowState
      );
      if (!stateValue) return null;

      return (
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
    },
    filterFn: (row, id, value: string[]) => {
      const rowState = (row.getValue(id) as string)?.toLowerCase();
      return value.some((v) => v.toLowerCase() === rowState);
    },
  },
  {
    accessorKey: "lifecycle",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Lifecycle" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => {
      return <LifecycleCell proposal={row.original} />;
    },
  },
  {
    accessorKey: "votes",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Votes" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => {
      return <VoteDisplay votes={row.original.votes} />;
    },
  },
  {
    id: "vote",
    cell: ({ row }) => <DataTableRowActions row={row} />,
  },
];
