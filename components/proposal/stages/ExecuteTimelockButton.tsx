"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import TimelockABI from "@/data/ArbitrumTimelock_ABI.json";
import type { TimelockOperationInfo } from "@/hooks/use-timelock-operation";
import { hashOperation, validateSalt } from "@gzeoneth/gov-tracker";
import { ReloadIcon } from "@radix-ui/react-icons";
import { BigNumber } from "ethers";
import { useEffect, useMemo, useState } from "react";
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
  const [customSalt, setCustomSalt] = useState("");

  const baseParams = useMemo(
    () => ({
      target: operation.target,
      value: BigNumber.from(operation.value),
      data: operation.data,
      predecessor: operation.predecessor,
    }),
    [operation.target, operation.value, operation.data, operation.predecessor]
  );

  const zeroSaltMatches = useMemo(
    () =>
      validateSalt(operation.operationId, {
        ...baseParams,
        salt: ZERO_BYTES32,
      }),
    [operation.operationId, baseParams]
  );

  const needsCustomSalt = !zeroSaltMatches;

  const { validatedSalt, saltValidationError } = useMemo(() => {
    if (!needsCustomSalt || !customSalt) {
      return { validatedSalt: null, saltValidationError: null };
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(customSalt)) {
      return {
        validatedSalt: null,
        saltValidationError:
          "Salt must be a valid bytes32 (0x followed by 64 hex characters)",
      };
    }
    if (
      validateSalt(operation.operationId, { ...baseParams, salt: customSalt })
    ) {
      return { validatedSalt: customSalt, saltValidationError: null };
    }
    const computedId = hashOperation({ ...baseParams, salt: customSalt });
    return {
      validatedSalt: null,
      saltValidationError: `Salt produces operation ID ${computedId.slice(0, 18)}... which doesn't match expected ${operation.operationId.slice(0, 18)}...`,
    };
  }, [needsCustomSalt, customSalt, operation.operationId, baseParams]);

  const effectiveSalt =
    validatedSalt ?? (zeroSaltMatches ? ZERO_BYTES32 : null);

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
      effectiveSalt as `0x${string}`,
    ],
    value: BigInt(operation.value),
    query: {
      enabled: isConnected && effectiveSalt !== null,
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

  if (needsCustomSalt && !validatedSalt) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-yellow-600 dark:text-yellow-400">
          Operation requires a non-zero salt
        </div>
        <div className="flex gap-2 items-start">
          <div className="flex-1 space-y-1">
            <Input
              type="text"
              placeholder="0x..."
              value={customSalt}
              onChange={(e) => setCustomSalt(e.target.value)}
              className="font-mono text-xs h-8"
            />
            {saltValidationError && (
              <div className="text-xs text-red-500">{saltValidationError}</div>
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Expected operation ID: {operation.operationId.slice(0, 18)}...
        </div>
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
