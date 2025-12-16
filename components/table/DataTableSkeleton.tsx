"use client";

import { Skeleton } from "@components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@components/ui/Table";

interface DataTableSkeletonProps {
  rowCount?: number;
  showToolbar?: boolean;
}

export function DataTableSkeleton({
  rowCount = 8,
  showToolbar = true,
}: DataTableSkeletonProps) {
  return (
    <div className="space-y-4 overflow-hidden">
      {showToolbar && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-1 items-center gap-2 sm:space-x-2">
            <div className="relative flex-1 sm:flex-initial">
              <Skeleton className="h-11 sm:h-12 w-full sm:w-[150px] lg:w-[450px]" />
            </div>
            <Skeleton className="h-11 sm:h-12 w-[100px] hidden sm:block" />
          </div>
          <div className="hidden sm:block">
            <Skeleton className="h-11 sm:h-12 w-[100px]" />
          </div>
        </div>
      )}

      <div className="relative">
        <div className="rounded-2xl border bg-white dark:bg-zinc-950 dark:border-zinc-800 overflow-x-auto scrollbar-thin">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px] sm:w-[120px]">
                  <Skeleton className="h-4 w-20" />
                </TableHead>
                <TableHead className="hidden xl:table-cell w-[140px]">
                  <Skeleton className="h-4 w-16" />
                </TableHead>
                <TableHead className="min-w-[200px] lg:min-w-[350px]">
                  <Skeleton className="h-4 w-24" />
                </TableHead>
                <TableHead className="hidden md:table-cell w-[100px]">
                  <Skeleton className="h-4 w-20" />
                </TableHead>
                <TableHead className="hidden sm:table-cell w-[100px]">
                  <Skeleton className="h-4 w-12" />
                </TableHead>
                <TableHead className="hidden sm:table-cell w-[120px]">
                  <Skeleton className="h-4 w-20" />
                </TableHead>
                <TableHead className="hidden lg:table-cell w-[140px]">
                  <Skeleton className="h-4 w-16" />
                </TableHead>
                <TableHead className="w-[70px]">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: rowCount }).map((_, index) => (
                <TableRow key={index}>
                  {/* Proposal ID */}
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>

                  {/* Proposer (hidden on smaller screens) */}
                  <TableCell className="hidden xl:table-cell">
                    <Skeleton className="h-4 w-24" />
                  </TableCell>

                  {/* Description */}
                  <TableCell>
                    <Skeleton className="h-4 w-full max-w-[200px] lg:max-w-[350px]" />
                  </TableCell>

                  {/* Governor (hidden on smaller screens) */}
                  <TableCell className="hidden md:table-cell">
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </TableCell>

                  {/* State (hidden on smaller screens) */}
                  <TableCell className="hidden sm:table-cell">
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </TableCell>

                  {/* Lifecycle (hidden on smaller screens) */}
                  <TableCell className="hidden sm:table-cell">
                    <Skeleton className="h-4 w-20" />
                  </TableCell>

                  {/* Votes (hidden on smaller screens) */}
                  <TableCell className="hidden lg:table-cell">
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell>
                    <Skeleton className="h-8 w-8 rounded-md" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="hidden sm:block md:hidden absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none rounded-r-2xl" />
      </div>

      {/* Pagination skeleton */}
      <div className="hidden sm:flex items-center justify-between px-2">
        <Skeleton className="h-4 w-40" />
        <div className="flex items-center space-x-6 lg:space-x-8">
          <Skeleton className="h-4 w-32" />
          <div className="flex items-center space-x-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </div>
    </div>
  );
}
