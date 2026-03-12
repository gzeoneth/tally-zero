"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeAbiParameters } from "viem";
import { useSimulateContract, useWriteContract } from "wagmi";

import { ReloadIcon } from "@radix-ui/react-icons";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getDelegateLabel } from "@/lib/delegate-cache";
import { getSimulationErrorMessage } from "@/lib/error-utils";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { shortenAddress } from "@/lib/format-utils";

interface ElectionVoteRowProps {
  proposalId: string;
  targetAddress: string;
  governorAddress: `0x${string}`;
  governorAbi: readonly Record<string, unknown>[];
  availableVotes: bigint | undefined;
  onVoteSuccess: () => void;
  infoSlot?: React.ReactNode;
}

export function ElectionVoteRow({
  proposalId,
  targetAddress,
  governorAddress,
  governorAbi,
  availableVotes,
  onVoteSuccess,
  infoSlot,
}: ElectionVoteRowProps): React.ReactElement {
  const [amount, setAmount] = useState("");
  const label = getDelegateLabel(targetAddress);
  const explorerUrl = getAddressExplorerUrl(targetAddress);

  const voteAmountWei = useMemo(() => {
    if (!amount || isNaN(Number(amount))) return undefined;
    try {
      const parsed = parseFloat(amount);
      if (parsed <= 0) return undefined;
      return BigInt(Math.floor(parsed * 1e18));
    } catch {
      return undefined;
    }
  }, [amount]);

  const encodedParams = useMemo(() => {
    if (!voteAmountWei) return undefined;
    return encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [targetAddress as `0x${string}`, voteAmountWei]
    );
  }, [targetAddress, voteAmountWei]);

  const {
    data: simulateData,
    error: simulateError,
    isError: isSimulateError,
  } = useSimulateContract({
    address: governorAddress,
    abi: governorAbi,
    functionName: "castVoteWithReasonAndParams",
    args: encodedParams
      ? [BigInt(proposalId), 1, "", encodedParams]
      : undefined,
    query: { enabled: !!encodedParams },
  });

  const simulationErrorMessage = useMemo(() => {
    if (!isSimulateError || !simulateError) return null;
    return getSimulationErrorMessage(simulateError);
  }, [isSimulateError, simulateError]);

  const {
    data: txHash,
    isPending: isWriting,
    writeContract,
  } = useWriteContract();

  useEffect(() => {
    if (txHash) {
      toast(`Vote submitted for ${label || shortenAddress(targetAddress)}`);
      setAmount("");
      onVoteSuccess();
    }
  }, [txHash, label, targetAddress, onVoteSuccess]);

  const handleVote = useCallback(() => {
    if (simulateData?.request) {
      writeContract(simulateData.request);
    }
  }, [simulateData, writeContract]);

  const exceedsAvailable =
    voteAmountWei !== undefined &&
    availableVotes !== undefined &&
    voteAmountWei > availableVotes;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {label ? (
            <span className="text-sm font-medium truncate">{label}</span>
          ) : (
            <span className="font-mono text-xs">
              {shortenAddress(targetAddress)}
            </span>
          )}
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors shrink-0"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {infoSlot}
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder="Amount (ARB)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          variant="glass"
          className="h-8 text-sm flex-1"
          min="0"
          step="any"
        />
        {isWriting ? (
          <Button size="sm" disabled className="shrink-0">
            <ReloadIcon className="h-3 w-3 mr-1 animate-spin" />
            Voting
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleVote}
            disabled={!simulateData?.request || exceedsAvailable}
            className="shrink-0"
          >
            Vote
          </Button>
        )}
      </div>

      {exceedsAvailable && (
        <p className="text-xs text-red-500">Exceeds available voting power</p>
      )}
      {simulationErrorMessage && amount && !exceedsAvailable && (
        <p className="text-xs text-red-500 dark:text-red-400">
          {simulationErrorMessage}
        </p>
      )}
    </div>
  );
}
