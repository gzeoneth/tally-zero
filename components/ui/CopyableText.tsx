"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@components/ui/Tooltip";
import { cn } from "@lib/utils";
import { CheckIcon, CopyIcon } from "@radix-ui/react-icons";
import { useCallback, useState } from "react";

interface CopyableTextProps {
  value: string;
  displayText?: string;
  maxLength?: number;
  className?: string;
  mono?: boolean;
  tooltipText?: string;
}

export function CopyableText({
  value,
  displayText,
  maxLength = 50,
  className,
  mono = true,
  tooltipText,
}: CopyableTextProps) {
  const [copied, setCopied] = useState(false);

  const truncatedText =
    displayText ??
    (value.length > maxLength
      ? value.slice(0, Math.floor(maxLength / 2)) +
        "..." +
        value.slice(-Math.floor(maxLength / 2) + 3)
      : value);

  const isTruncated = truncatedText !== value;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = value;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [value]);

  const content = (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-1 group cursor-pointer hover:text-primary transition-colors text-left",
        mono && "font-mono",
        className
      )}
      title={isTruncated ? undefined : "Click to copy"}
    >
      <span className="break-all">{truncatedText}</span>
      {copied ? (
        <CheckIcon className="w-3 h-3 text-green-500 shrink-0" />
      ) : (
        <CopyIcon className="w-3 h-3 opacity-0 group-hover:opacity-50 shrink-0 transition-opacity" />
      )}
    </button>
  );

  if (isTruncated) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent
            side="top"
            className="max-w-[400px] break-all font-mono text-xs"
          >
            <p>{tooltipText ?? "Click to copy full value:"}</p>
            <p className="text-muted-foreground mt-1 max-h-[200px] overflow-y-auto">
              {value}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}
