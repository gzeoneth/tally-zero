"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as z from "zod";

import { Form } from "@/components/ui/Form";
import { ContractParams } from "@/types/search";
import { formSchema } from "@config/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import ContractCard from "@/components/container/ContractCard";
import { columns } from "@/components/table/ColumnsProposals";
import { DataTable } from "@/components/table/DataTable";
import { Progress } from "@/components/ui/Progress";

import { State } from "@/types/search";
import { initialState } from "@config/intial-state";
import { useGovernorContract } from "@hooks/use-governor-contract";

export default function Search() {
  const [state, setState] = useState<State>(initialState);
  const [formContractParams, setFormContractParams] = useState<ContractParams>(
    {}
  );
  const searchParams = useSearchParams();
  const router = useRouter();
  const hasSubmittedRef = useRef(false);
  const [providerReady, setProviderReady] = useState(false);

  useEffect(() => {
    if (formContractParams.contractAddress && formContractParams.networkId) {
      setState((prevState) => ({
        ...prevState,
        governor: {
          ...prevState.governor,
          address: formContractParams.contractAddress,
        },
      }));
    }
  }, [formContractParams, setState]);

  const {
    overallProgress,
    formattedProposals,
    searchError,
    isSearching,
    isProviderReady,
  } = useGovernorContract({
    values: formContractParams,
    state,
    setState,
  });

  useEffect(() => {
    setProviderReady(isProviderReady);
  }, [isProviderReady]);

  // Parse query params
  const getDefaultValues = () => {
    const address =
      searchParams.get("address") ||
      "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";
    const networkId = searchParams.get("networkId") || "42161";
    const daysToSearch = parseInt(searchParams.get("days") || "60");
    const rpcUrl = searchParams.get("rpc") || "https://arb1.arbitrum.io/rpc";
    const blockRange = parseInt(searchParams.get("blockRange") || "10000000");
    const autoRun = searchParams.get("autoRun") === "true";

    return {
      address,
      networkId,
      daysToSearch,
      rpcUrl,
      blockRange,
      autoRun,
    };
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(),
  });

  // Update URL when form values change
  const updateURL = (values: z.infer<typeof formSchema>) => {
    const params = new URLSearchParams();
    params.set("address", values.address);
    params.set("networkId", values.networkId);
    params.set("days", values.daysToSearch?.toString() || "30");
    if (values.rpcUrl) params.set("rpc", values.rpcUrl);
    params.set("blockRange", values.blockRange?.toString() || "10000");
    params.set("autoRun", values.autoRun?.toString() || "false");

    router.replace(`?${params.toString()}`);
  };

  // Handle auto-run
  useEffect(() => {
    const autoRun = form.getValues("autoRun");
    if (
      autoRun &&
      providerReady &&
      !hasSubmittedRef.current &&
      !isSearching &&
      overallProgress === 0
    ) {
      hasSubmittedRef.current = true;
      form.handleSubmit(onSubmit)();
    }
  }, [providerReady, form, isSearching, overallProgress]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    setState(initialState);
    updateURL(values);
    hasSubmittedRef.current = true;

    setFormContractParams({
      contractAddress: `0x${values.address.slice(2)}`,
      networkId: parseInt(values.networkId),
      daysToSearch: values.daysToSearch || 30,
      rpcUrl: values.rpcUrl || "",
      blockRange: values.blockRange || 10000,
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col space-y-4"
      >
        <ContractCard
          form={form}
          progress={overallProgress}
          providerReady={providerReady}
        />

        <section id="proposals-table">
          {overallProgress > 0 && overallProgress < 100 && (
            <Progress className="mb-8" value={overallProgress} />
          )}

          {searchError && (
            <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-600 dark:text-red-400">
                Error: {searchError.message}. Please try again with a smaller
                time range or check your RPC connection.
              </p>
            </div>
          )}

          {overallProgress === 100 && !searchError && (
            <DataTable
              isPaginated={true}
              columns={columns}
              data={formattedProposals as any[]}
            />
          )}
        </section>
      </form>
    </Form>
  );
}
