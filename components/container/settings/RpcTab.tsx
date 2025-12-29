"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { FormInputField } from "@/components/ui/FormInputField";
import { Separator } from "@/components/ui/Separator";
import {
  ARBITRUM_RPC_URL,
  DEFAULT_FORM_VALUES,
  ETHEREUM_RPC_URL,
} from "@/config/arbitrum-governance";

interface RpcTabProps {
  l2RpcInput: string;
  setL2RpcInput: (value: string) => void;
  l1RpcInput: string;
  setL1RpcInput: (value: string) => void;
  blockRangeInput: string;
  setBlockRangeInput: (value: string) => void;
  l1BlockRangeInput: string;
  setL1BlockRangeInput: (value: string) => void;
}

/**
 * RPC settings tab with custom endpoints and block range configuration
 */
export function RpcTab({
  l2RpcInput,
  setL2RpcInput,
  l1RpcInput,
  setL1RpcInput,
  blockRangeInput,
  setBlockRangeInput,
  l1BlockRangeInput,
  setL1BlockRangeInput,
}: RpcTabProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="mt-0 space-y-6">
      <FormInputField
        id="l2-rpc"
        label="Arbitrum RPC URL"
        type="url"
        value={l2RpcInput}
        onChange={setL2RpcInput}
        placeholder={ARBITRUM_RPC_URL}
        helpText="Custom Arbitrum One RPC endpoint (optional)"
      />

      <FormInputField
        id="l1-rpc"
        label="Ethereum L1 RPC URL"
        type="url"
        value={l1RpcInput}
        onChange={setL1RpcInput}
        placeholder={ETHEREUM_RPC_URL}
        helpText="Custom Ethereum mainnet RPC endpoint (optional)"
      />

      <Separator />

      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        {showAdvanced ? (
          <ChevronUp className="w-4 h-4 mr-2" />
        ) : (
          <ChevronDown className="w-4 h-4 mr-2" />
        )}
        Block Range Settings
      </button>

      {showAdvanced && (
        <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
          <FormInputField
            id="block-range"
            label="Arbitrum Block Range"
            type="number"
            value={blockRangeInput}
            onChange={setBlockRangeInput}
            placeholder={String(DEFAULT_FORM_VALUES.blockRange)}
            min={100}
            helpText="Query chunk size for Arbitrum (default: 10,000,000)"
          />

          <FormInputField
            id="l1-block-range"
            label="L1 Block Range"
            type="number"
            value={l1BlockRangeInput}
            onChange={setL1BlockRangeInput}
            placeholder={String(DEFAULT_FORM_VALUES.l1BlockRange)}
            min={100}
            helpText="Query chunk size for Ethereum L1 (default: 1,000)"
          />
        </div>
      )}
    </div>
  );
}
