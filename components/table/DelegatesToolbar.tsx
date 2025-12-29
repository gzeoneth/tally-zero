"use client";

import { useState } from "react";

import { Table } from "@tanstack/react-table";

import { ToolbarResetButton } from "@components/table/ToolbarResetButton";
import { ToolbarSearch } from "@components/table/ToolbarSearch";
import { DataTableViewOptions } from "@components/table/ViewOptions";
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

  const handleSearchChange = (value: string) => {
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
        <ToolbarSearch
          value={searchValue}
          onChange={handleSearchChange}
          placeholder="Search address..."
          className="w-full sm:w-[150px] lg:w-[300px]"
        />

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

        {isFiltered && <ToolbarResetButton onClick={handleReset} />}
      </div>
      <div className="hidden sm:block">
        <DataTableViewOptions table={table} />
      </div>
    </div>
  );
}
