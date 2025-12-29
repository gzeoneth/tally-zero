"use client";

import { memo } from "react";

import { SearchIcon } from "lucide-react";

import { Input } from "@components/ui/Input";

export interface ToolbarSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const ToolbarSearch = memo(function ToolbarSearch({
  value,
  onChange,
  placeholder = "Search ...",
  className = "w-full sm:w-[150px] lg:w-[450px]",
}: ToolbarSearchProps) {
  return (
    <div className="relative flex-1 sm:flex-initial">
      <SearchIcon className="absolute top-1/2 left-3 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`pl-10 h-11 sm:h-12 text-base ${className}`}
      />
    </div>
  );
});
