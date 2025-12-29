"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
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
      <div className="space-y-2">
        <Label htmlFor="l2-rpc">Arbitrum RPC URL</Label>
        <Input
          id="l2-rpc"
          type="url"
          value={l2RpcInput}
          onChange={(e) => setL2RpcInput(e.target.value)}
          placeholder={ARBITRUM_RPC_URL}
        />
        <p className="text-xs text-muted-foreground">
          Custom Arbitrum One RPC endpoint (optional)
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="l1-rpc">Ethereum L1 RPC URL</Label>
        <Input
          id="l1-rpc"
          type="url"
          value={l1RpcInput}
          onChange={(e) => setL1RpcInput(e.target.value)}
          placeholder={ETHEREUM_RPC_URL}
        />
        <p className="text-xs text-muted-foreground">
          Custom Ethereum mainnet RPC endpoint (optional)
        </p>
      </div>

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
          <div className="space-y-2">
            <Label htmlFor="block-range">Arbitrum Block Range</Label>
            <Input
              id="block-range"
              type="number"
              value={blockRangeInput}
              onChange={(e) => setBlockRangeInput(e.target.value)}
              placeholder={String(DEFAULT_FORM_VALUES.blockRange)}
              min={100}
            />
            <p className="text-xs text-muted-foreground">
              Query chunk size for Arbitrum (default: 10,000,000)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="l1-block-range">L1 Block Range</Label>
            <Input
              id="l1-block-range"
              type="number"
              value={l1BlockRangeInput}
              onChange={(e) => setL1BlockRangeInput(e.target.value)}
              placeholder={String(DEFAULT_FORM_VALUES.l1BlockRange)}
              min={100}
            />
            <p className="text-xs text-muted-foreground">
              Query chunk size for Ethereum L1 (default: 1,000)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
