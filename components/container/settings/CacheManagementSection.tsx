"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Separator } from "@/components/ui/Separator";

interface CacheManagementSectionProps {
  cacheStats: { count: number; size: string };
  totalStorage: string;
  onClearCache: () => void;
}

/**
 * Cache management section showing stats and clear button
 */
export function CacheManagementSection({
  cacheStats,
  totalStorage,
  onClearCache,
}: CacheManagementSectionProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Cache Management</Label>
      <div className="p-4 bg-muted/50 rounded-lg space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Cached items:</span>
          <span className="font-mono">{cacheStats.count}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Cache size:</span>
          <span className="font-mono">{cacheStats.size} KB</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total storage:</span>
          <span className="font-mono">{totalStorage} KB</span>
        </div>
        <Separator />
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={onClearCache}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Clear Cache
        </Button>
      </div>
    </div>
  );
}
