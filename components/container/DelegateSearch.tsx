"use client";

import { BigNumber } from "ethers";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import RpcStatus from "@/components/container/RpcStatus";
import { columns } from "@/components/table/ColumnsDelegates";
import { DelegatesToolbar } from "@/components/table/DelegatesToolbar";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";

import { STORAGE_KEYS } from "@/config/storage-keys";
import { useDelegateSearch } from "@/hooks/use-delegate-search";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { formatVotingPower } from "@/lib/format-utils";
import type { DelegateInfo } from "@/types/delegate";

import { DataTablePagination } from "@/components/table/Pagination";
import {
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

export default function DelegateSearch() {
  const searchParams = useSearchParams();
  const [autoStarted, setAutoStarted] = useState(false);
  const [rpcHealthy, setRpcHealthy] = useState<boolean | null>(null);
  const [minPowerFilter, setMinPowerFilter] = useState<string>("");

  const [storedL2Rpc, , l2RpcHydrated] = useLocalStorage(
    STORAGE_KEYS.L2_RPC,
    ""
  );
  const [storedL1Rpc, , l1RpcHydrated] = useLocalStorage(
    STORAGE_KEYS.L1_RPC,
    ""
  );

  const rpcSettingsHydrated = l2RpcHydrated && l1RpcHydrated;

  const rpcFromUrl = searchParams.get("rpc") || "";
  const customRpc = rpcFromUrl || storedL2Rpc;

  const customRpcUrls = useMemo(
    () => ({
      arb1: customRpc || undefined,
      l1: storedL1Rpc || undefined,
    }),
    [customRpc, storedL1Rpc]
  );

  const handleRpcHealthChecked = useCallback(
    (_allHealthy: boolean, requiredHealthy: boolean) => {
      setRpcHealthy(requiredHealthy);
    },
    []
  );

  // Convert min power from ARB to wei (18 decimals) for filtering
  const minVotingPowerWei = useMemo(() => {
    if (!minPowerFilter || minPowerFilter === "") return undefined;
    try {
      const arbValue = parseFloat(minPowerFilter);
      if (isNaN(arbValue) || arbValue < 0) return undefined;
      // Convert ARB to wei
      const weiValue = BigNumber.from(10).pow(18).mul(Math.floor(arbValue));
      return weiValue.toString();
    } catch (error) {
      console.warn("Invalid min power filter:", error);
      return undefined;
    }
  }, [minPowerFilter]);

  const {
    delegates,
    totalVotingPower,
    totalSupply,
    error,
    isLoading,
    cacheStats,
    snapshotBlock,
    refreshVisibleDelegates,
    isRefreshingVisible,
  } = useDelegateSearch({
    enabled: autoStarted && rpcHealthy === true,
    customRpcUrl: customRpc || undefined,
    minVotingPower: minVotingPowerWei,
  });

  useEffect(() => {
    if (rpcHealthy === true && !autoStarted) {
      setAutoStarted(true);
    }
  }, [rpcHealthy, autoStarted]);

  // Calculate delegated percentage
  const delegatedPercentage = useMemo(() => {
    if (!totalVotingPower || !totalSupply || totalSupply === "0") {
      return "0.00";
    }
    try {
      const votingPowerBN = BigNumber.from(totalVotingPower);
      const totalSupplyBN = BigNumber.from(totalSupply);
      const percentage =
        (parseFloat(votingPowerBN.toString()) /
          parseFloat(totalSupplyBN.toString())) *
        100;
      return percentage.toFixed(2);
    } catch (error) {
      console.error("Error calculating delegated percentage:", error);
      return "0.00";
    }
  }, [totalVotingPower, totalSupply]);

  // Table state
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable<DelegateInfo>({
    data: delegates,
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
    meta: {
      totalVotingPower,
    },
  });

  // Refresh voting power for visible delegates when page changes
  const visibleRows = table.getRowModel().rows;
  useEffect(() => {
    if (visibleRows.length > 0 && autoStarted && rpcHealthy === true) {
      const visibleAddresses = visibleRows.map((row) => row.original.address);
      refreshVisibleDelegates(visibleAddresses);
    }
  }, [visibleRows, autoStarted, rpcHealthy, refreshVisibleDelegates]);

  return (
    <div className="flex flex-col space-y-4">
      {/* Summary Stats Cards */}
      {delegates.length > 0 && !error && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Delegates</CardDescription>
              <CardTitle className="text-3xl">
                {delegates.length.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Voting Power</CardDescription>
              <CardTitle className="text-3xl">
                {formatVotingPower(totalVotingPower)} ARB
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>ARB Total Supply</CardDescription>
              <CardTitle className="text-3xl">
                {formatVotingPower(totalSupply)} ARB
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Delegated</CardDescription>
              <CardTitle className="text-3xl">{delegatedPercentage}%</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Cutoff Block Notice */}
      {snapshotBlock > 0 && cacheStats && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Delegate list indexed up to block {snapshotBlock.toLocaleString()}.
            New delegates since then may not appear.
            {cacheStats.age && ` Cache age: ${cacheStats.age}`}
          </p>
        </div>
      )}

      <section id="delegates-table">
        {rpcHealthy === false && (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-red-600 dark:text-red-400">
              Cannot connect to Arbitrum RPC. Please check your connection or
              try a different RPC URL in settings.
            </p>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="space-y-2 w-full max-w-md">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <p className="text-sm text-muted-foreground">
              Loading delegates...
            </p>
          </div>
        )}

        {error && (
          <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-sm text-red-600 dark:text-red-400">
              Error: {error.message}. Please try again.
            </p>
          </div>
        )}

        {delegates.length > 0 && !error && (
          <div className="space-y-4 overflow-hidden">
            <DelegatesToolbar
              table={table}
              onMinPowerChange={setMinPowerFilter}
            />

            <div className="relative">
              <div className="rounded-2xl border bg-white dark:bg-zinc-950 dark:border-zinc-800 overflow-x-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => {
                          return (
                            <TableHead key={header.id} colSpan={header.colSpan}>
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
                          No delegates found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="hidden sm:block md:hidden absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none rounded-r-2xl" />
            </div>

            <DataTablePagination table={table} />
          </div>
        )}

        {delegates.length === 0 && !isLoading && !error && (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              No delegates found. Try adjusting your filters.
            </p>
          </div>
        )}
      </section>

      <RpcStatus
        customUrls={customRpcUrls}
        onHealthChecked={handleRpcHealthChecked}
        autoCheck={rpcSettingsHydrated}
      />
    </div>
  );
}
