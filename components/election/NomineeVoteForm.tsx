"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeAbiParameters } from "viem";
import {
  useAccount,
  useBlockNumber,
  useReadContract,
  useSimulateContract,
  useWriteContract,
} from "wagmi";

import type { SerializableMemberNominee } from "@gzeoneth/gov-tracker";
import { ReloadIcon } from "@radix-ui/react-icons";
import { AlertCircle, ExternalLink, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ARB_TOKEN } from "@/config/arbitrum-governance";
import {
  ERC20_VOTES_ABI,
  MEMBER_ELECTION_GOVERNOR_ABI,
} from "@/config/election-abi";
import { SC_CONTRACTS } from "@/config/security-council";
import { getDelegateLabel } from "@/lib/delegate-cache";
import { getSimulationErrorMessage } from "@/lib/error-utils";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";

const MEMBER_GOVERNOR_ADDRESS =
  SC_CONTRACTS.MEMBER_ELECTION_GOVERNOR as `0x${string}`;

interface NomineeVoteFormProps {
  proposalId: string;
  nominees: SerializableMemberNominee[];
  fullWeightDeadline: number;
  proposalDeadline: number;
}

export function NomineeVoteForm({
  proposalId,
  nominees,
  fullWeightDeadline,
}: NomineeVoteFormProps): React.ReactElement {
  const { address, isConnected } = useAccount();
  const { data: currentBlock } = useBlockNumber({ watch: true });

  const { data: snapshotBlock } = useReadContract({
    address: MEMBER_GOVERNOR_ADDRESS,
    abi: MEMBER_ELECTION_GOVERNOR_ABI,
    functionName: "proposalSnapshot",
    args: [BigInt(proposalId)],
  });

  const { data: totalVotingPower } = useReadContract({
    address: ARB_TOKEN.address as `0x${string}`,
    abi: ERC20_VOTES_ABI,
    functionName: "getPastVotes",
    args: address && snapshotBlock ? [address, snapshotBlock] : undefined,
    query: { enabled: isConnected && !!address && !!snapshotBlock },
  });

  const { data: usedVotes, refetch: refetchUsedVotes } = useReadContract({
    address: MEMBER_GOVERNOR_ADDRESS,
    abi: MEMBER_ELECTION_GOVERNOR_ABI,
    functionName: "votesUsed",
    args: address ? [BigInt(proposalId), address] : undefined,
    query: { enabled: isConnected && !!address },
  });

  const availableVotes = useMemo(() => {
    if (totalVotingPower === undefined || usedVotes === undefined)
      return undefined;
    const avail = totalVotingPower - usedVotes;
    return avail > BigInt(0) ? avail : BigInt(0);
  }, [totalVotingPower, usedVotes]);

  const isFullWeight =
    currentBlock !== undefined && currentBlock <= BigInt(fullWeightDeadline);

  if (!isConnected) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <Wallet className="h-4 w-4" />
        Connect your wallet to vote for nominees
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="glass-subtle rounded-lg p-3 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total Voting Power</span>
          <span className="font-semibold">
            {totalVotingPower !== undefined
              ? `${formatVotingPower(totalVotingPower)} ARB`
              : "—"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Used</span>
          <span>
            {usedVotes !== undefined
              ? `${formatVotingPower(usedVotes)} ARB`
              : "—"}
          </span>
        </div>
        <div className="flex justify-between text-sm font-medium">
          <span className="text-muted-foreground">Available</span>
          <span className="text-primary">
            {availableVotes !== undefined
              ? `${formatVotingPower(availableVotes)} ARB`
              : "—"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {isFullWeight ? (
          <Badge
            variant="secondary"
            className="text-green-500 border-green-500/30"
          >
            Full weight voting active
          </Badge>
        ) : (
          <div className="flex items-center gap-1 text-yellow-500">
            <AlertCircle className="h-3 w-3" />
            <span className="text-xs">
              Vote weight is now decreasing — earlier votes count more
            </span>
          </div>
        )}
      </div>

      {nominees.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          No nominees available for voting
        </div>
      ) : (
        <div className="space-y-3">
          {nominees.map((nominee) => (
            <NomineeVoteRow
              key={nominee.address}
              proposalId={proposalId}
              nominee={nominee}
              availableVotes={availableVotes}
              onVoteSuccess={refetchUsedVotes}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NomineeVoteRow({
  proposalId,
  nominee,
  availableVotes,
  onVoteSuccess,
}: {
  proposalId: string;
  nominee: SerializableMemberNominee;
  availableVotes: bigint | undefined;
  onVoteSuccess: () => void;
}): React.ReactElement {
  const [amount, setAmount] = useState("");
  const label = getDelegateLabel(nominee.address);
  const explorerUrl = getAddressExplorerUrl(nominee.address);

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
      [nominee.address as `0x${string}`, voteAmountWei]
    );
  }, [nominee.address, voteAmountWei]);

  const {
    data: simulateData,
    error: simulateError,
    isError: isSimulateError,
  } = useSimulateContract({
    address: MEMBER_GOVERNOR_ADDRESS,
    abi: MEMBER_ELECTION_GOVERNOR_ABI,
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
      toast(`Vote submitted for ${label || shortenAddress(nominee.address)}`);
      setAmount("");
      onVoteSuccess();
    }
  }, [txHash, label, nominee.address, onVoteSuccess]);

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
              {shortenAddress(nominee.address)}
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
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            {formatVotingPower(nominee.weightReceived)} ARB
          </span>
          {nominee.isWinner && (
            <Badge variant="default" className="bg-green-500 text-xs">
              Top 6
            </Badge>
          )}
        </div>
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
