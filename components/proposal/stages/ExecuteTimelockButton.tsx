"use client";

import { Button } from "@/components/ui/Button";
import TimelockABI from "@/data/ArbitrumTimelock_ABI.json";
import type { TimelockOperationInfo } from "@/lib/stage-tracker/timelock-operation-tracker";
import { ReloadIcon } from "@radix-ui/react-icons";
import { useEffect } from "react";
import { toast } from "sonner";
import {
  useAccount,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

interface ExecuteTimelockButtonProps {
  operation: TimelockOperationInfo;
  onSuccess?: () => void;
}

export function ExecuteTimelockButton({
  operation,
  onSuccess,
}: ExecuteTimelockButtonProps) {
  const { isConnected } = useAccount();

  const {
    data: simulateData,
    error: simulateError,
    isLoading: isSimulating,
  } = useSimulateContract({
    address: operation.timelockAddress as `0x${string}`,
    abi: TimelockABI,
    functionName: "execute",
    args: [
      operation.target as `0x${string}`,
      BigInt(operation.value),
      operation.data as `0x${string}`,
      operation.predecessor as `0x${string}`,
      ZERO_BYTES32 as `0x${string}`,
    ],
    value: BigInt(operation.value),
    query: {
      enabled: isConnected,
    },
  });

  const {
    data: txHash,
    isPending: isWriting,
    writeContract,
    error: writeError,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash,
    });

  useEffect(() => {
    if (isConfirmed && txHash) {
      toast.success("Timelock operation executed successfully!");
      onSuccess?.();
    }
  }, [isConfirmed, txHash, onSuccess]);

  useEffect(() => {
    if (writeError) {
      toast.error(`Transaction failed: ${writeError.message}`);
    }
  }, [writeError]);

  const handleExecute = () => {
    if (simulateData?.request) {
      writeContract(simulateData.request);
    }
  };

  if (!isConnected) {
    return (
      <div className="text-xs text-muted-foreground">
        Connect wallet to execute
      </div>
    );
  }

  if (isSimulating) {
    return (
      <Button size="sm" disabled>
        <ReloadIcon className="h-3 w-3 mr-1 animate-spin" />
        Checking...
      </Button>
    );
  }

  if (simulateError) {
    const errorMsg = simulateError.message.toLowerCase();
    if (
      errorMsg.includes("not ready") ||
      errorMsg.includes("operation is not ready")
    ) {
      return (
        <div className="text-xs text-yellow-600 dark:text-yellow-400">
          Operation not yet ready
        </div>
      );
    }
    if (
      errorMsg.includes("missing role") ||
      errorMsg.includes("accesscontrol")
    ) {
      return (
        <div className="text-xs text-muted-foreground">
          Execution restricted to authorized addresses
        </div>
      );
    }
    return (
      <div className="text-xs text-red-500" title={simulateError.message}>
        Cannot execute (simulation failed)
      </div>
    );
  }

  if (isWriting || isConfirming) {
    return (
      <Button size="sm" disabled>
        <ReloadIcon className="h-3 w-3 mr-1 animate-spin" />
        {isConfirming ? "Confirming..." : "Executing..."}
      </Button>
    );
  }

  if (isConfirmed) {
    return (
      <Button size="sm" variant="outline" disabled>
        Executed ✓
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={handleExecute} disabled={!simulateData?.request}>
      Execute Operation
    </Button>
  );
}
