"use client";

import { useEffect, useState } from "react";
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

  const { overallProgress, formattedProposals, searchError, isSearching } =
    useGovernorContract({
      values: formContractParams,
      state,
      setState,
    });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      address: "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9", // Arbitrum Core Governor
      networkId: "42161", // Arbitrum One
      daysToSearch: 60, // Default to 60 days
      rpcUrl: "https://arb1.arbitrum.io/rpc", // Default RPC URL
      blockRange: 10000000, // Default block range per query
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    setState(initialState);

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
        <ContractCard form={form} progress={overallProgress} />

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
