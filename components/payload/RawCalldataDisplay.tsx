"use client";

import { Button } from "@components/ui/Button";
import {
  CheckIcon,
  CopyIcon,
  Pencil1Icon,
  ResetIcon,
} from "@radix-ui/react-icons";
import { useCallback, useState } from "react";

export interface RawCalldataDisplayProps {
  calldata: string;
  nerdMode: boolean;
  isOverridden: boolean;
  onEdit: () => void;
  onReset: () => void;
}

/**
 * Raw calldata display with copy button and optional edit/reset controls
 */
export function RawCalldataDisplay({
  calldata,
  nerdMode,
  isOverridden,
  onEdit,
  onReset,
}: RawCalldataDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(calldata);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = calldata;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [calldata]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <code className="text-xs font-mono break-all block bg-muted/50 p-2 pr-8 rounded max-h-24 overflow-y-auto">
          {calldata}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-2 right-2 p-1 hover:bg-muted rounded transition-colors"
          title="Copy to clipboard"
        >
          {copied ? (
            <CheckIcon className="w-3 h-3 text-green-500" />
          ) : (
            <CopyIcon className="w-3 h-3 text-muted-foreground hover:text-foreground" />
          )}
        </button>
      </div>
      {nerdMode && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil1Icon className="w-3 h-3 mr-1" />
            Edit
          </Button>
          {isOverridden && (
            <Button size="sm" variant="outline" onClick={onReset}>
              <ResetIcon className="w-3 h-3 mr-1" />
              Reset
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
