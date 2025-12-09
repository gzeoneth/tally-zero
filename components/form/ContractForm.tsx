"use client";

import { useState } from "react";
import { UseFormReturn } from "react-hook-form";
import * as z from "zod";

import { Icons } from "@components/Icons";
import { ReloadIcon } from "@radix-ui/react-icons";
import { ChevronDown, ChevronUp } from "lucide-react";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/Form";
import { Input } from "@/components/ui/Input";
import { Button } from "@components/ui/Button";

import {
  ARBITRUM_RPC_URL,
  DEFAULT_FORM_VALUES,
  ETHEREUM_RPC_URL,
} from "@config/arbitrum-governance";
import { formSchema } from "@config/schema";

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
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {showAdvanced ? (
          <ChevronUp className="w-4 h-4 mr-1" />
        ) : (
          <ChevronDown className="w-4 h-4 mr-1" />
        )}
        Settings
      </button>

      {showAdvanced && (
        <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
          <FormField
            control={form.control}
            name="daysToSearch"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Days to Search</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder={String(DEFAULT_FORM_VALUES.daysToSearch)}
                    autoComplete="off"
                    disabled={progress > 0 && progress < 100}
                    {...field}
                    onChange={(e) =>
                      field.onChange(
                        parseInt(e.target.value) ||
                          DEFAULT_FORM_VALUES.daysToSearch
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="rpcUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Arbitrum RPC URL (optional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder={ARBITRUM_RPC_URL}
                    autoComplete="off"
                    disabled={progress > 0 && progress < 100}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="l1RpcUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ethereum L1 RPC URL (optional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder={ETHEREUM_RPC_URL}
                    autoComplete="off"
                    disabled={progress > 0 && progress < 100}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="blockRange"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Arb1 Block Range (chunk size)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder={String(DEFAULT_FORM_VALUES.blockRange)}
                    autoComplete="off"
                    disabled={progress > 0 && progress < 100}
                    {...field}
                    onChange={(e) =>
                      field.onChange(
                        parseInt(e.target.value) ||
                          DEFAULT_FORM_VALUES.blockRange
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="l1BlockRange"
            render={({ field }) => (
              <FormItem>
                <FormLabel>L1 Block Range (chunk size)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder={String(DEFAULT_FORM_VALUES.l1BlockRange)}
                    autoComplete="off"
                    disabled={progress > 0 && progress < 100}
                    {...field}
                    onChange={(e) =>
                      field.onChange(
                        parseInt(e.target.value) ||
                          DEFAULT_FORM_VALUES.l1BlockRange
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            variant="secondary"
            className="w-full"
            disabled={progress > 0 && progress < 100}
          >
            <Icons.refresh className="w-4 h-4 mr-2" />
            Apply & Reload
          </Button>
        </div>
      )}

      {progress > 0 && progress < 100 && (
        <Button variant="secondary" disabled className="w-full">
          <ReloadIcon className="animate-spin w-4 h-4 mr-2" />
          Loading proposals...
        </Button>
      )}
    </div>
  );
}
