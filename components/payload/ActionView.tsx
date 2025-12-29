"use client";

import { useCallback, useState } from "react";
import { formatEther } from "viem";

import { Badge } from "@components/ui/Badge";
import { Button } from "@components/ui/Button";
import { CopyableText } from "@components/ui/CopyableText";
import { Input } from "@components/ui/Input";
import { Label } from "@components/ui/Label";
import { SimulationButton } from "@components/ui/SimulationButton";

import { L2_TREASURY_TIMELOCK } from "@config/arbitrum-governance";
import { isTreasuryGovernor } from "@config/governors";
import { useDecodedCalldata } from "@hooks/use-decoded-calldata";
import { simulateCall } from "@lib/tenderly";
import { cn } from "@lib/utils";

import { DecodedCalldataView } from "./DecodedCalldataView";
import { RawCalldataDisplay } from "./RawCalldataDisplay";

export interface ActionViewProps {
  index: number;
  target: string;
  value: string;
  calldata: string;
  nerdMode?: boolean;
  overriddenCalldata?: string;
  onCalldataChange?: (newCalldata: string | undefined) => void;
  governorAddress?: string;
}

/**
 * Single action view with calldata decoding and optional editing
 */
export function ActionView({
  index,
  target,
  value,
  calldata,
  nerdMode = false,
  overriddenCalldata,
  onCalldataChange,
  governorAddress,
}: ActionViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(overriddenCalldata || calldata);

  const effectiveCalldata = overriddenCalldata ?? calldata;
  const isOverridden = overriddenCalldata !== undefined;

  const ethValue = formatEther(BigInt(value));
  const hasValue = ethValue !== "0";
  const hasCalldata = effectiveCalldata !== "0x" && effectiveCalldata !== "";

  const { decoded, isDecoding } = useDecodedCalldata({
    calldata: effectiveCalldata,
    targetAddress: target,
    enabled: hasCalldata,
  });

  const showDecoded = decoded && decoded.decodingSource !== "failed";

  const handleSaveEdit = useCallback(() => {
    if (editValue !== calldata) {
      onCalldataChange?.(editValue);
    } else {
      onCalldataChange?.(undefined);
    }
    setIsEditing(false);
  }, [editValue, calldata, onCalldataChange]);

  const handleResetOverride = useCallback(() => {
    onCalldataChange?.(undefined);
    setEditValue(calldata);
    setIsEditing(false);
  }, [calldata, onCalldataChange]);

  const handleCancelEdit = useCallback(() => {
    setEditValue(overriddenCalldata || calldata);
    setIsEditing(false);
  }, [overriddenCalldata, calldata]);

  return (
    <div
      className={cn(
        "border rounded-lg p-3 space-y-2 text-sm",
        isOverridden
          ? "border-orange-500 bg-orange-50/30 dark:bg-orange-950/10"
          : "border-border"
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Action {index + 1}
          {isOverridden && (
            <Badge
              variant="outline"
              className="ml-2 text-[10px] border-orange-500 text-orange-600"
            >
              Override
            </Badge>
          )}
        </span>
        {hasValue && (
          <span className="text-xs font-semibold text-green-600 dark:text-green-400">
            {ethValue} ETH
          </span>
        )}
      </div>

      {/* Target address */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">To:</span>
        <CopyableText value={target} className="text-xs" maxLength={42} />
      </div>

      {/* Calldata section */}
      {hasCalldata && (
        <div className="space-y-2">
          {/* Decoded view */}
          {(showDecoded || isDecoding) && !isEditing && (
            <DecodedCalldataView decoded={decoded} isDecoding={isDecoding} />
          )}

          {showDecoded && !isEditing && governorAddress && (
            <SimulationButton
              type="call"
              onSimulate={() =>
                simulateCall({
                  target,
                  calldata: effectiveCalldata,
                  chain: "Arb1",
                  from: isTreasuryGovernor(governorAddress)
                    ? L2_TREASURY_TIMELOCK.address
                    : undefined,
                })
              }
            />
          )}

          {/* Editing mode */}
          {nerdMode && isEditing ? (
            <div className="space-y-2">
              <Label className="text-xs">Edit Calldata (hex)</Label>
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="0x..."
                className="font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={
                    !editValue.startsWith("0x") || editValue.length < 10
                  }
                >
                  Save Override
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Raw data - always visible in nerd mode, collapsible otherwise */}
              <details className="group" open={nerdMode || isOverridden}>
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
                  {showDecoded
                    ? "Raw calldata"
                    : `Calldata (${effectiveCalldata.length} bytes)`}
                  {!showDecoded && !isDecoding && (
                    <Badge variant="outline" className="text-[10px] ml-1">
                      Unknown
                    </Badge>
                  )}
                </summary>
                <div className="mt-1 space-y-2">
                  <RawCalldataDisplay
                    calldata={effectiveCalldata}
                    nerdMode={nerdMode}
                    isOverridden={isOverridden}
                    onEdit={() => {
                      setEditValue(effectiveCalldata);
                      setIsEditing(true);
                    }}
                    onReset={handleResetOverride}
                  />
                </div>
              </details>
            </>
          )}
        </div>
      )}

      {!hasCalldata && (
        <span className="text-xs text-muted-foreground italic">
          No calldata
        </span>
      )}
    </div>
  );
}
