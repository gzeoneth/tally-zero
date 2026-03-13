"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEstimateGas, useSendTransaction } from "wagmi";

import {
  VOTE_SUPPORT,
  encodeElectionVoteParams,
  prepareCastVoteWithReasonAndParams,
} from "@gzeoneth/gov-tracker";

import { ReloadIcon } from "@radix-ui/react-icons";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { useNerdMode } from "@/context/NerdModeContext";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { getDelegateLabel } from "@/lib/delegate-cache";
import { getSimulationErrorMessage } from "@/lib/error-utils";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { shortenAddress } from "@/lib/format-utils";

interface ElectionVoteRowProps {
  proposalId: string;
  targetAddress: string;
  governorAddress: `0x${string}`;
  availableVotes: bigint | undefined;
  onVoteSuccess: () => void;
  infoSlot?: React.ReactNode;
}

export function ElectionVoteRow({
  proposalId,
  targetAddress,
  governorAddress,
  availableVotes,
  onVoteSuccess,
  infoSlot,
}: ElectionVoteRowProps): React.ReactElement {
  const { nerdMode } = useNerdMode();
  const [phaseOverride] = useLocalStorage<string>(
    STORAGE_KEYS.ELECTION_PHASE_OVERRIDE,
    ""
  );
  const isOverrideActive = nerdMode && !!phaseOverride;

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

  const prepared = useMemo(() => {
    if (!voteAmountWei) return undefined;
    const params = encodeElectionVoteParams(
      targetAddress,
      voteAmountWei.toString()
    );
    return prepareCastVoteWithReasonAndParams(
      proposalId,
      VOTE_SUPPORT.FOR,
      "",
      params,
      governorAddress
    );
  }, [proposalId, targetAddress, voteAmountWei, governorAddress]);

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
    sendTransaction,
  } = useSendTransaction();

  useEffect(() => {
    if (txHash) {
      toast(`Vote submitted for ${label || shortenAddress(targetAddress)}`);
      setAmount("");
      onVoteSuccess();
    }
  }, [txHash, label, targetAddress, onVoteSuccess]);

  const handleVote = useCallback(() => {
    if (!prepared) return;
    if (!isEstimateError || isOverrideActive) {
      sendTransaction({
        to: prepared.to as `0x${string}`,
        data: prepared.data as `0x${string}`,
      });
    }
  }, [prepared, isEstimateError, isOverrideActive, sendTransaction]);

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
            disabled={
              !prepared ||
              (isEstimateError && !isOverrideActive) ||
              exceedsAvailable
            }
            className="shrink-0"
          >
            Vote
          </Button>
        )}
      </div>

      {exceedsAvailable && (
        <p className="text-xs text-red-500">Exceeds available voting power</p>
      )}
      {simulationErrorMessage &&
        amount &&
        !exceedsAvailable &&
        !isOverrideActive && (
          <p className="text-xs text-red-500 dark:text-red-400">
            {simulationErrorMessage}
          </p>
        )}
    </div>
  );
}
