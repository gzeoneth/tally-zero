"use client";

import React, { useState } from "react";

import { Cross2Icon } from "@radix-ui/react-icons";
import { Table } from "@tanstack/react-table";
import { SearchIcon } from "lucide-react";

import { DataTableViewOptions } from "@components/table/ViewOptions";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";

interface DelegatesToolbarProps<TData> {
  table: Table<TData>;
  onMinPowerChange?: (value: string) => void;
}

export function DelegatesToolbar<TData>({
  table,
  onMinPowerChange,
}: DelegatesToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;
  const [searchValue, setSearchValue] = useState("");
  const [minPowerValue, setMinPowerValue] = useState("");

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchValue(value);
    table.getColumn("address")?.setFilterValue(value);
  };

  const handleMinPowerChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setMinPowerValue(value);
    onMinPowerChange?.(value);
  };

  const handleReset = () => {
    setSearchValue("");
    setMinPowerValue("");
    table.resetColumnFilters();
    onMinPowerChange?.("");
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-1 items-center gap-2 sm:space-x-2">
        <div className="relative flex-1 sm:flex-initial">
          <SearchIcon className="absolute top-1/2 left-3 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search address..."
            value={searchValue}
            onChange={handleSearchChange}
            className="pl-10 h-11 sm:h-12 w-full sm:w-[150px] lg:w-[300px] text-base"
          />
        </div>

        <div className="relative">
          <Input
            type="number"
            placeholder="Min voting power (ARB)"
            value={minPowerValue}
            onChange={handleMinPowerChange}
            className="h-11 sm:h-12 w-full sm:w-[200px] text-base"
            min="0"
            step="1000"
          />
        </div>

        {isFiltered && (
          <Button
            variant="ghost"
            onClick={handleReset}
            className="h-11 sm:h-12 px-2 lg:px-3 hover:bg-red-500 min-w-[44px]"
          >
            <span className="hidden sm:inline">Reset</span>
            <Cross2Icon className="sm:ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="hidden sm:block">
        <DataTableViewOptions table={table} />
      </div>
    </div>
  );
}
