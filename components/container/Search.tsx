"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import * as z from "zod";

import { Form } from "@/components/ui/Form";
import { formSchema } from "@config/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import ContractCard from "@/components/container/ContractCard";
import { columns } from "@/components/table/ColumnsProposals";
import { DataTable } from "@/components/table/DataTable";
import { Progress } from "@/components/ui/Progress";

import { useMultiGovernorSearch } from "@hooks/use-multi-governor-search";

export default function Search() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [autoStarted, setAutoStarted] = useState(false);

  const daysToSearch = parseInt(searchParams.get("days") || "60");
  const rpcFromUrl = searchParams.get("rpc") || "";
  const [customRpc, setCustomRpc] = useState(rpcFromUrl);

  const { proposals, progress, error, isProviderReady, isSearching } =
    useMultiGovernorSearch({
      daysToSearch,
      enabled: autoStarted,
      customRpcUrl: customRpc || undefined,
    });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      address: "0x0000000000000000000000000000000000000000",
      networkId: "42161",
      daysToSearch,
      rpcUrl: rpcFromUrl,
      blockRange: 10000000,
      autoRun: false,
    },
  });

  useEffect(() => {
    if (isProviderReady && !autoStarted) {
      setAutoStarted(true);
    }
  }, [isProviderReady, autoStarted]);

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
      setCustomRpc(values.rpcUrl || "");
      updateURL(values.daysToSearch || 60, values.rpcUrl);
      setAutoStarted(true);
    },
    [updateURL]
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

        <section id="proposals-table">
          {autoStarted && progress < 100 && !error && (
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
            <DataTable
              isPaginated={true}
              columns={columns}
              data={proposals as any[]}
            />
          )}
        </section>
      </form>
    </Form>
  );
}
