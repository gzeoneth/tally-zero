"use client";

import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import * as React from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@components/ui/Table";

import { ParsedProposal } from "@/types/proposal";
import { MobileProposalList } from "@components/table/MobileProposalCard";
import { DataTablePagination } from "@components/table/Pagination";
import { DataTableToolbar } from "@components/table/Toolbar";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isPaginated: boolean;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isPaginated = true,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const [isMobileView, setIsMobileView] = React.useState(false);

  // Show/hide columns based on screen size
  React.useEffect(() => {
    const handleResize = () => {
      const isXLScreen = window.innerWidth >= 1280;
      const isLargeScreen = window.innerWidth >= 1024;
      const isMediumScreen = window.innerWidth >= 768;
      const isSmallScreen = window.innerWidth >= 640;
      const isMobile = window.innerWidth < 640;

      setIsMobileView(isMobile);

      setColumnVisibility((prev) => ({
        ...prev,
        proposer: isXLScreen,
        votes: isLargeScreen,
        governorName: isMediumScreen,
        id: isSmallScreen,
        state: isSmallScreen,
        lifecycle: isSmallScreen,
      }));
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const filteredData = table
    .getFilteredRowModel()
    .rows.map((row) => row.original);

  return (
    <div className="space-y-4">
      <DataTableToolbar table={table} />

      {isMobileView ? (
        <MobileProposalList proposals={filteredData as ParsedProposal[]} />
      ) : (
        <div className="relative overflow-x-auto">
          <div className="glass rounded-2xl overflow-clip">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const size = header.column.columnDef.size;
                      return (
                        <TableHead
                          key={header.id}
                          colSpan={header.colSpan}
                          style={size ? { width: size } : undefined}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      No proposals found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="hidden sm:block md:hidden absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none rounded-r-2xl" />
        </div>
      )}

      {isPaginated && !isMobileView && <DataTablePagination table={table} />}
    </div>
  );
}
