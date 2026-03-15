"use client";

import { useEffect, useMemo } from "react";
import {
  useAccount,
  useEstimateGas,
  useReadContract,
  useSendTransaction,
  useSignTypedData,
} from "wagmi";

import { ReloadIcon } from "@radix-ui/react-icons";
import { CheckCircle2, Wallet } from "lucide-react";
import { toast } from "sonner";

import {
  nomineeElectionGovernorReadAbi,
  prepareContenderRegistration,
} from "@gzeoneth/gov-tracker";

import { Button } from "@/components/ui/Button";
import { useElectionContracts } from "@/hooks/use-election-contracts";
import { getSimulationErrorMessage } from "@/lib/error-utils";

interface ContenderSignupFormProps {
  proposalId: string;
}

export function ContenderSignupForm({
  proposalId,
}: ContenderSignupFormProps): React.ReactElement {
  const { address, isConnected } = useAccount();
  const { nomineeGovernor, chainId } = useElectionContracts();
  const governorAddress = nomineeGovernor as `0x${string}`;

  const { data: governorName } = useReadContract({
    address: governorAddress,
    abi: nomineeElectionGovernorReadAbi,
    functionName: "name",
    query: { staleTime: Infinity },
  });

  const { data: isAlreadyContender, refetch: refetchContender } =
    useReadContract({
      address: governorAddress,
      abi: nomineeElectionGovernorReadAbi,
      functionName: "isContender",
      args: address ? [BigInt(proposalId), address] : undefined,
      query: { enabled: isConnected && !!address },
    });

  const registration = useMemo(() => {
    if (!governorName) return undefined;
    return prepareContenderRegistration(
      governorName,
      proposalId,
      governorAddress,
      chainId
    );
  }, [governorName, proposalId, governorAddress, chainId]);

  const {
    data: signature,
    signTypedData,
    isPending: isSigning,
    reset: resetSignature,
  } = useSignTypedData();

  const prepared = useMemo(() => {
    if (!signature || !registration) return undefined;
    return registration.buildTransaction(signature);
  }, [signature, registration]);

  const { error: estimateError, isError: isEstimateError } = useEstimateGas({
    to: prepared?.to as `0x${string}`,
    data: prepared?.data as `0x${string}`,
    query: { enabled: !!prepared },
  });

  const simulationErrorMessage = useMemo(() => {
    if (!isEstimateError || !estimateError) return null;
    return getSimulationErrorMessage(estimateError);
  }, [isEstimateError, estimateError]);

  const {
    data: txHash,
    isPending: isWriting,
    isSuccess,
    sendTransaction,
  } = useSendTransaction();

  useEffect(() => {
    if (txHash) {
      toast("Successfully registered as contender!");
      refetchContender();
      resetSignature();
    }
  }, [txHash, refetchContender, resetSignature]);

  useEffect(() => {
    if (prepared && !isEstimateError) {
      sendTransaction({
        to: prepared.to as `0x${string}`,
        data: prepared.data as `0x${string}`,
      });
    }
  }, [prepared, isEstimateError, sendTransaction]);

  function handleSign(): void {
    if (!registration) return;

    const td = registration.typedData;
    signTypedData({
      domain: {
        ...td.domain,
        verifyingContract: td.domain.verifyingContract as `0x${string}`,
      },
      types: td.types,
      primaryType: td.primaryType,
      message: {
        proposalId: BigInt(td.message.proposalId),
      },
    });
  }

  if (!isConnected) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <Wallet className="h-4 w-4" />
        Connect your wallet to register as a contender
      </div>
    );
  }

  if (isAlreadyContender) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-500 p-4">
        <CheckCircle2 className="h-4 w-4" />
        You are already registered as a contender
      </div>
    );
  }

  const isPending = isSigning || isWriting;

  return (
    <div className="space-y-4 p-4">
      <p className="text-sm text-muted-foreground">
        Sign a message to register as a contender for this Security Council
        election. This requires an EIP-712 signature.
      </p>

      {simulationErrorMessage && (
        <p className="text-sm text-red-500 dark:text-red-400">
          {simulationErrorMessage}
        </p>
      )}

      {isSuccess ? (
        <Button variant="secondary" disabled>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Registered
        </Button>
      ) : isPending ? (
        <Button disabled>
          <ReloadIcon className="h-4 w-4 mr-2 animate-spin" />
          {isSigning ? "Signing..." : "Submitting..."}
        </Button>
      ) : (
        <Button onClick={handleSign} disabled={!registration}>
          Register as Contender
        </Button>
      )}
    </div>
  );
}
