"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import RpcStatus from "@/components/container/RpcStatus";
import { columns } from "@/components/table/ColumnsProposals";
import { DataTable } from "@/components/table/DataTable";
import { Progress } from "@/components/ui/Progress";

import { DEFAULT_FORM_VALUES } from "@/config/arbitrum-governance";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useMultiGovernorSearch } from "@/hooks/use-multi-governor-search";

export default function Search() {
  const searchParams = useSearchParams();
  const [autoStarted, setAutoStarted] = useState(false);
  const [rpcHealthy, setRpcHealthy] = useState<boolean | null>(null);

  const [storedDays] = useLocalStorage<number>(
    STORAGE_KEYS.DAYS_TO_SEARCH,
    DEFAULT_FORM_VALUES.daysToSearch
  );
  const [storedL2Rpc] = useLocalStorage(STORAGE_KEYS.L2_RPC, "");
  const [storedL1Rpc] = useLocalStorage(STORAGE_KEYS.L1_RPC, "");
  const [storedBlockRange] = useLocalStorage<number>(
    STORAGE_KEYS.BLOCK_RANGE,
    DEFAULT_FORM_VALUES.blockRange
  );

  const daysToSearch =
    parseInt(searchParams.get("days") || "") ||
    storedDays ||
    DEFAULT_FORM_VALUES.daysToSearch;
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

  const { proposals, progress, error, isProviderReady } =
    useMultiGovernorSearch({
      daysToSearch,
      enabled: autoStarted && rpcHealthy === true,
      customRpcUrl: customRpc || undefined,
      blockRange: storedBlockRange,
    });

  useEffect(() => {
    if (isProviderReady && rpcHealthy === true && !autoStarted) {
      setAutoStarted(true);
    }
  }, [isProviderReady, rpcHealthy, autoStarted]);

  return (
    <div className="flex flex-col space-y-4">
      <section id="proposals-table">
        {rpcHealthy === false && (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-red-600 dark:text-red-400">
              Cannot connect to Arbitrum RPC. Please check your connection or
              try a different RPC URL in settings.
            </p>
          </div>
        )}

        {rpcHealthy === true && autoStarted && progress < 100 && !error && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-full max-w-md">
              <Progress value={progress} />
            </div>
            <p className="text-sm text-muted-foreground">
              {progress === 0
                ? "Connecting to Arbitrum..."
                : progress < 95
                  ? `Searching proposals... ${Math.round(progress)}%`
                  : "Processing proposals..."}
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

        {progress === 100 && !error && (
          <DataTable isPaginated={true} columns={columns} data={proposals} />
        )}
      </section>

      <RpcStatus
        customUrls={customRpcUrls}
        onHealthChecked={handleRpcHealthChecked}
      />
    </div>
  );
}
