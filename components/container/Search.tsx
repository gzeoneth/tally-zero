"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as z from "zod";

import { Form } from "@/components/ui/Form";
import { formSchema } from "@config/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import ContractCard from "@/components/container/ContractCard";
import RpcStatus from "@/components/container/RpcStatus";
import { columns } from "@/components/table/ColumnsProposals";
import { DataTable } from "@/components/table/DataTable";
import { Progress } from "@/components/ui/Progress";

import { DEFAULT_FORM_VALUES } from "@config/arbitrum-governance";
import { STORAGE_KEYS } from "@config/storage-keys";
import { useLocalStorage } from "@hooks/use-local-storage";
import { useMultiGovernorSearch } from "@hooks/use-multi-governor-search";

export default function Search() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [autoStarted, setAutoStarted] = useState(false);
  const [rpcHealthy, setRpcHealthy] = useState<boolean | null>(null);

  const daysToSearch = parseInt(
    searchParams.get("days") || String(DEFAULT_FORM_VALUES.daysToSearch)
  );
  const rpcFromUrl = searchParams.get("rpc") || "";

  // Load saved settings from localStorage using the hook
  const [storedL2Rpc, setStoredL2Rpc, isL2RpcHydrated] = useLocalStorage(
    STORAGE_KEYS.L2_RPC,
    ""
  );
  const [l1Rpc, setL1Rpc, isL1RpcHydrated] = useLocalStorage(
    STORAGE_KEYS.L1_RPC,
    ""
  );
  const [blockRange, setBlockRange, isBlockRangeHydrated] =
    useLocalStorage<number>(
      STORAGE_KEYS.BLOCK_RANGE,
      DEFAULT_FORM_VALUES.blockRange
    );
  const [l1BlockRange, setL1BlockRange, isL1BlockRangeHydrated] =
    useLocalStorage<number>(
      STORAGE_KEYS.L1_BLOCK_RANGE,
      DEFAULT_FORM_VALUES.l1BlockRange
    );

  // RPC from URL takes precedence over stored value
  const customRpc = rpcFromUrl || storedL2Rpc;

  // Track applied RPC values - only updates on form submit, not on every keystroke
  const [appliedL2Rpc, setAppliedL2Rpc] = useState(customRpc);
  const [appliedL1Rpc, setAppliedL1Rpc] = useState(l1Rpc);
  const [appliedBlockRange, setAppliedBlockRange] = useState(blockRange);

  // Initialize form first so we can watch values
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      address: "0x0000000000000000000000000000000000000000",
      networkId: "42161",
      daysToSearch,
      rpcUrl: customRpc,
      l1RpcUrl: l1Rpc,
      blockRange,
      l1BlockRange,
      autoRun: false,
    },
  });

  // Update form defaults when localStorage hydrates
  useEffect(() => {
    if (isL1RpcHydrated && l1Rpc) {
      form.setValue("l1RpcUrl", l1Rpc);
      setAppliedL1Rpc(l1Rpc);
    }
  }, [isL1RpcHydrated, l1Rpc, form]);

  useEffect(() => {
    if (isL2RpcHydrated && storedL2Rpc) {
      form.setValue("rpcUrl", storedL2Rpc);
      setAppliedL2Rpc(storedL2Rpc);
    }
  }, [isL2RpcHydrated, storedL2Rpc, form]);

  useEffect(() => {
    if (isBlockRangeHydrated && blockRange) {
      setAppliedBlockRange(blockRange);
    }
  }, [isBlockRangeHydrated, blockRange]);

  // Memoize custom RPC URLs for health check - use applied values only (not watched)
  const customRpcUrls = useMemo(
    () => ({
      arb1: appliedL2Rpc || customRpc || undefined,
      l1: appliedL1Rpc || l1Rpc || undefined,
    }),
    [appliedL2Rpc, appliedL1Rpc, customRpc, l1Rpc]
  );

  // Handle RPC health check results
  const handleRpcHealthChecked = useCallback(
    (allHealthy: boolean, requiredHealthy: boolean) => {
      setRpcHealthy(requiredHealthy);
    },
    []
  );

  const { proposals, progress, error, isProviderReady, isSearching } =
    useMultiGovernorSearch({
      daysToSearch,
      enabled: autoStarted && rpcHealthy === true,
      customRpcUrl: appliedL2Rpc || customRpc || undefined,
      blockRange: appliedBlockRange,
    });

  useEffect(() => {
    if (isProviderReady && rpcHealthy === true && !autoStarted) {
      setAutoStarted(true);
    }
  }, [isProviderReady, rpcHealthy, autoStarted]);

  const updateURL = useCallback(
    (days: number, rpc?: string) => {
      const params = new URLSearchParams();
      params.set("days", days.toString());
      if (rpc) params.set("rpc", rpc);
      router.replace(`?${params.toString()}`);
    },
    [router]
  );

  const onSubmit = useCallback(
    (values: z.infer<typeof formSchema>) => {
      // Save to localStorage for persistence using the hook setters
      setStoredL2Rpc(values.rpcUrl || "");
      setL1Rpc(values.l1RpcUrl || "");
      setBlockRange(values.blockRange || DEFAULT_FORM_VALUES.blockRange);
      setL1BlockRange(values.l1BlockRange || DEFAULT_FORM_VALUES.l1BlockRange);

      // Update applied values - these are used by hooks and RPC health checks
      setAppliedL2Rpc(values.rpcUrl || "");
      setAppliedL1Rpc(values.l1RpcUrl || "");
      setAppliedBlockRange(values.blockRange || DEFAULT_FORM_VALUES.blockRange);

      updateURL(
        values.daysToSearch || DEFAULT_FORM_VALUES.daysToSearch,
        values.rpcUrl
      );
      setAutoStarted(true);
    },
    [updateURL, setStoredL2Rpc, setL1Rpc, setBlockRange, setL1BlockRange]
  );

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col space-y-4"
      >
        <ContractCard
          form={form}
          progress={progress}
          providerReady={isProviderReady}
        />

        <RpcStatus
          customUrls={customRpcUrls}
          onHealthChecked={handleRpcHealthChecked}
        />

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
      </form>
    </Form>
  );
}
