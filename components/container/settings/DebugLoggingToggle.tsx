"use client";

import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { useDebugLogging } from "@/hooks/use-debug-logging";

/**
 * Toggle for enabling debug console logging (nerd mode feature)
 */
export function DebugLoggingToggle() {
  const { enabled, toggle } = useDebugLogging();

  return (
    <div className="glass-subtle rounded-lg p-4 flex items-center justify-between transition-all duration-200 hover:shadow-md">
      <div className="space-y-0.5">
        <Label>Debug Logging</Label>
        <p className="text-xs text-muted-foreground">
          Enable verbose console logging for debugging lifecycle tracking
        </p>
      </div>
      <Button
        type="button"
        variant={enabled ? "default" : "outline"}
        size="sm"
        onClick={toggle}
        className="transition-all duration-200"
      >
        {enabled ? "On" : "Off"}
      </Button>
    </div>
  );
}
