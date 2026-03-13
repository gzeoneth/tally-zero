"use client";

import { useEffect, useMemo } from "react";
import {
  useAccount,
  useReadContract,
  useSignTypedData,
  useSimulateContract,
  useWriteContract,
} from "wagmi";

import { ReloadIcon } from "@radix-ui/react-icons";
import { CheckCircle2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { getAddContenderTypedData } from "@gzeoneth/gov-tracker";

import { Button } from "@/components/ui/Button";
import { NOMINEE_ELECTION_GOVERNOR_ABI } from "@/config/election-abi";
import { SC_CONTRACTS } from "@/config/security-council";
import { getSimulationErrorMessage } from "@/lib/error-utils";

const NOMINEE_GOVERNOR_ADDRESS =
  SC_CONTRACTS.NOMINEE_ELECTION_GOVERNOR as `0x${string}`;

interface ContenderSignupFormProps {
  proposalId: string;
}

export function ContenderSignupForm({
  proposalId,
}: ContenderSignupFormProps): React.ReactElement {
  const { address, isConnected } = useAccount();

  const { data: governorName } = useReadContract({
    address: NOMINEE_GOVERNOR_ADDRESS,
    abi: NOMINEE_ELECTION_GOVERNOR_ABI,
    functionName: "name",
    query: { staleTime: Infinity },
  });

  const { data: isAlreadyContender, refetch: refetchContender } =
    useReadContract({
      address: NOMINEE_GOVERNOR_ADDRESS,
      abi: NOMINEE_ELECTION_GOVERNOR_ABI,
      functionName: "isContender",
      args: address ? [BigInt(proposalId), address] : undefined,
      query: { enabled: isConnected && !!address },
    });

  const {
    data: signature,
    signTypedData,
    isPending: isSigning,
    reset: resetSignature,
  } = useSignTypedData();

  const {
    data: simulateData,
    error: simulateError,
    isError: isSimulateError,
  } = useSimulateContract({
    address: NOMINEE_GOVERNOR_ADDRESS,
    abi: NOMINEE_ELECTION_GOVERNOR_ABI,
    functionName: "addContender",
    args: signature ? [BigInt(proposalId), signature] : undefined,
    query: { enabled: !!signature },
  });

  const simulationErrorMessage = useMemo(() => {
    if (!isSimulateError || !simulateError) return null;
    return getSimulationErrorMessage(simulateError);
  }, [isSimulateError, simulateError]);

  const {
    data: txHash,
    isPending: isWriting,
    isSuccess,
    writeContract,
  } = useWriteContract();

  useEffect(() => {
    if (txHash) {
      toast("Successfully registered as contender!");
      refetchContender();
      resetSignature();
    }
  }, [txHash, refetchContender, resetSignature]);

  useEffect(() => {
    if (simulateData?.request) {
      writeContract(simulateData.request);
    }
  }, [simulateData, writeContract]);

  function handleSign(): void {
    if (!governorName) return;

    const td = getAddContenderTypedData(governorName, proposalId);
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
        <Button onClick={handleSign} disabled={!governorName}>
          Register as Contender
        </Button>
      )}
    </div>
  );
}
