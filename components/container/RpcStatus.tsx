"use client";

import { useEffect } from "react";

import { useRpcHealth } from "@/hooks/use-rpc-health";
import type { RpcHealthResult } from "@/lib/rpc-health";
import { cn } from "@/lib/utils";
import {
  CheckCircledIcon,
  CrossCircledIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";

interface RpcStatusProps {
  customUrls?: {
    arb1?: string;
    nova?: string;
    l1?: string;
  };
  onHealthChecked?: (allHealthy: boolean, requiredHealthy: boolean) => void;
}

function StatusIndicator({ result }: { result: RpcHealthResult }) {
  const statusConfig = {
    checking: {
      icon: <ReloadIcon className="h-3 w-3 animate-spin" />,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
      label: "Checking...",
    },
    healthy: {
      icon: <CheckCircledIcon className="h-3 w-3" />,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/30",
      label: result.latencyMs ? `${result.latencyMs}ms` : "OK",
    },
    degraded: {
      icon: <CheckCircledIcon className="h-3 w-3" />,
      color: "text-yellow-600 dark:text-yellow-400",
      bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
      label: result.latencyMs ? `${result.latencyMs}ms (slow)` : "Slow",
    },
    down: {
      icon: <CrossCircledIcon className="h-3 w-3" />,
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-100 dark:bg-red-900/30",
      label: "Down",
    },
  };

  const config = statusConfig[result.status];

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs",
        config.bgColor,
        config.color
      )}
      title={result.error || `Block: ${result.blockNumber || "N/A"}`}
    >
      {config.icon}
      <span className="font-medium">{result.name}</span>
      <span className="opacity-75">{config.label}</span>
    </div>
  );
}

export default function RpcStatus({
  customUrls,
  onHealthChecked,
}: RpcStatusProps) {
  const { results, isChecking, summary, checkHealth } = useRpcHealth({
    customUrls,
    autoCheck: true,
  });

  // Notify parent when health check completes - use useEffect to avoid setState during render
  useEffect(() => {
    if (summary && onHealthChecked) {
      onHealthChecked(summary.allHealthy, summary.requiredHealthy);
    }
  }, [summary, onHealthChecked]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          RPC Status
        </span>
        <button
          type="button"
          onClick={() => checkHealth()}
          disabled={isChecking}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {isChecking ? (
            <ReloadIcon className="h-3 w-3 animate-spin" />
          ) : (
            <ReloadIcon className="h-3 w-3" />
          )}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {results.map((result) => (
          <StatusIndicator key={result.id} result={result} />
        ))}
      </div>

      {summary && !summary.requiredHealthy && (
        <p className="text-xs text-red-600 dark:text-red-400">
          Arbitrum One RPC is required for proposal search
        </p>
      )}

      {summary && summary.requiredHealthy && !summary.allHealthy && (
        <p className="text-xs text-yellow-600 dark:text-yellow-400">
          Some RPCs are unavailable. Lifecycle tracking may be incomplete.
        </p>
      )}
    </div>
  );
}
