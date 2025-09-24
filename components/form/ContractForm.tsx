"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import * as z from "zod";

import { Icons } from "@components/Icons";
import { ReloadIcon } from "@radix-ui/react-icons";

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/Form";
import { Input } from "@/components/ui/Input";
import { Button } from "@components/ui/Button";
import { Checkbox } from "@components/ui/Checkbox";

import { DAO, formSchema } from "@config/schema";
import { selectDAOByGovernorAddress } from "../../lib/dao";

interface ContractFormProps {
  form: UseFormReturn<z.infer<typeof formSchema>>;
  progress: number;
  providerReady?: boolean;
}

export default function ContractForm({
  form,
  progress,
  providerReady = false,
}: ContractFormProps) {
  const [currDao, setCurrDao] = useState<DAO | undefined>();

  const addressWatched = form.watch("address");

  useEffect(() => {
    const dao = selectDAOByGovernorAddress(addressWatched);
    setCurrDao(dao);
    // avoid overriding networkId if user has already entered it
    if (dao && !form.getValues("networkId")) {
      form.setValue("networkId", String(dao.networkId));
    }
  }, [addressWatched, form]);

  return (
    <div>
      <FormField
        control={form.control}
        name="address"
        render={({ field }) => (
          <FormItem className="flex-1">
            <FormLabel>Ethereum address</FormLabel>
            <FormControl>
              <div className="relative flex items-center">
                <Input
                  className="pl-12"
                  placeholder="0x00000..."
                  autoComplete="off"
                  disabled={progress === 100 || progress > 0}
                  {...field}
                />
                <div className="absolute left-0 flex items-center justify-center h-full px-3 text-black bg-gray-200/45 hover:text-violet-500 hover:bg-gray-200 rounded-l-md transition-colors duration-200 ease-in-out">
                  <a
                    href="https://github.com/withtally/tally-zero/blob/main/config/daos.json"
                    target="_blank"
                  >
                    <div className="flex items-center space-x-3">
                      <Icons.orderbook className="w-5 h-auto" />
                    </div>
                  </a>
                </div>
                {currDao && (
                  <div className="absolute right-0 flex items-center space-x-2 justify-center h-full px-3 text-black bg-gray-200 hover:text-violet-500 hover:bg-gray-200 rounded-r-md transition-colors duration-200 ease-in-out">
                    <Image
                      src={currDao.imageUrl}
                      alt={currDao.name}
                      width={50}
                      height={50}
                      className="rounded-md w-6 h-auto"
                      layout="fixed"
                    />
                    <span className="text-sm font-semibold hidden sm:block">
                      {currDao.name}
                    </span>
                  </div>
                )}
              </div>
            </FormControl>
            <FormDescription>
              The address of the contract you want to explore.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="networkId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Network ID</FormLabel>
            <FormControl>
              <div className="relative flex items-center">
                <Input
                  placeholder="Eg 1, 3, 4, 5, 42, 1337, ..."
                  autoComplete="off"
                  {...field}
                  className="pl-12"
                  disabled={progress === 100 || progress > 0}
                />
                <div className="absolute left-0 flex items-center justify-center h-full px-3 text-black bg-gray-200/45 hover:text-violet-500 hover:bg-gray-200 rounded-l-md transition-colors duration-200 ease-in-out">
                  <Icons.link className="w-5 h-auto" />
                </div>
              </div>
            </FormControl>
            <FormDescription>
              The network ID of the contract you want to explore.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="daysToSearch"
        render={({ field }) => (
          <FormItem className="py-4">
            <FormLabel>Days to Search</FormLabel>
            <FormControl>
              <Input
                type="number"
                placeholder="30"
                autoComplete="off"
                disabled={progress === 100 || progress > 0}
                {...field}
                onChange={(e) => field.onChange(parseInt(e.target.value) || 30)}
              />
            </FormControl>
            <FormDescription>
              Number of days to search for proposals (default: 30)
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="lg:grid lg:grid-cols-8 gap-4">
        <FormField
          control={form.control}
          name="rpcUrl"
          render={({ field }) => (
            <FormItem className="col-span-5">
              <FormLabel>Custom RPC URL (Optional)</FormLabel>
              <FormControl>
                <Input
                  placeholder="https://arb1.arbitrum.io/rpc"
                  autoComplete="off"
                  disabled={progress === 100 || progress > 0}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Override the default RPC endpoint
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="blockRange"
          render={({ field }) => (
            <FormItem className="col-span-3">
              <FormLabel>Block Range</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="10000"
                  autoComplete="off"
                  disabled={progress === 100 || progress > 0}
                  {...field}
                  onChange={(e) =>
                    field.onChange(parseInt(e.target.value) || 10000)
                  }
                />
              </FormControl>
              <FormDescription>
                Blocks per query (default: 10000)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="autoRun"
        render={({ field }) => (
          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
            <FormControl>
              <Checkbox
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={progress === 100 || progress > 0}
              />
            </FormControl>
            <div className="space-y-1 leading-none">
              <FormLabel>Auto-connect when provider is ready</FormLabel>
              <FormDescription>
                Automatically submit the form when the Web3 provider becomes
                available
              </FormDescription>
            </div>
          </FormItem>
        )}
      />

      {progress > 0 && progress !== 100 ? (
        <Button variant={"secondary"} disabled className="mt-6 w-full">
          <ReloadIcon className="animate-spin w-5 h-5" />
          <span className="ml-2">Connecting to contract...</span>
        </Button>
      ) : progress === 100 ? (
        <Button
          variant={"secondary"}
          onClick={() => window.location.reload()}
          className="mt-6 w-full"
        >
          <Icons.refresh className="w-5 h-5" />
          <span className="ml-2">Search for another contract</span>
        </Button>
      ) : (
        <Button type="submit" className="mt-6 w-full" disabled={!providerReady}>
          <Icons.search className="w-5 h-6" />
          {providerReady ? "Connect to contract" : "Waiting for provider..."}
        </Button>
      )}
    </div>
  );
}
// trigger recompilation
