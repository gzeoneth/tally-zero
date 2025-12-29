"use client";

import { ActionView } from "./ActionView";

export type CalldataOverrides = Record<number, string>;

export interface PayloadViewProps {
  targets: string[];
  values: string[];
  calldatas: string[];
  nerdMode?: boolean;
  calldataOverrides?: CalldataOverrides;
  onCalldataOverrideChange?: (
    index: number,
    newCalldata: string | undefined
  ) => void;
  governorAddress?: string;
}

/**
 * Container component for displaying proposal payload actions
 */
export function PayloadView({
  targets,
  values,
  calldatas,
  nerdMode = false,
  calldataOverrides,
  onCalldataOverrideChange,
  governorAddress,
}: PayloadViewProps) {
  if (targets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No actions in this proposal.
      </p>
    );
  }

  const hasOverrides =
    calldataOverrides && Object.keys(calldataOverrides).length > 0;

  return (
    <div className="space-y-3">
      {/* Override info banner */}
      {nerdMode && hasOverrides && (
        <div className="bg-orange-100 dark:bg-orange-950/30 border border-orange-500 rounded-lg p-3 text-xs text-orange-700 dark:text-orange-300">
          You have calldata overrides active.
        </div>
      )}

      {targets.map((target, idx) => (
        <ActionView
          key={idx}
          index={idx}
          target={target}
          value={values[idx] || "0"}
          calldata={calldatas[idx] || "0x"}
          nerdMode={nerdMode}
          overriddenCalldata={calldataOverrides?.[idx]}
          onCalldataChange={(newCalldata) =>
            onCalldataOverrideChange?.(idx, newCalldata)
          }
          governorAddress={governorAddress}
        />
      ))}
    </div>
  );
}
