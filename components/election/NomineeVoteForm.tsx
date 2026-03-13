"use client";

import { useMemo } from "react";
import { useAccount, useBlockNumber, useReadContract } from "wagmi";

import type { SerializableMemberNominee } from "@gzeoneth/gov-tracker";
import { erc20VotesAbi } from "@gzeoneth/gov-tracker";
import { AlertCircle, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { ARB_TOKEN } from "@/config/arbitrum-governance";
import { MEMBER_ELECTION_GOVERNOR_ABI } from "@/config/election-abi";
import { SC_CONTRACTS } from "@/config/security-council";
import { formatVotingPower } from "@/lib/format-utils";

import { ElectionVoteRow } from "./ElectionVoteRow";
import { VotingPowerSummary } from "./VotingPowerSummary";

const MEMBER_GOVERNOR_ADDRESS =
  SC_CONTRACTS.MEMBER_ELECTION_GOVERNOR as `0x${string}`;

interface NomineeVoteFormProps {
  proposalId: string;
  nominees: SerializableMemberNominee[];
  fullWeightDeadline: number;
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
    abi: erc20VotesAbi,
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
      <VotingPowerSummary
        totalVotingPower={totalVotingPower}
        usedVotes={usedVotes}
        availableVotes={availableVotes}
      />

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
            <ElectionVoteRow
              key={nominee.address}
              proposalId={proposalId}
              targetAddress={nominee.address}
              governorAddress={MEMBER_GOVERNOR_ADDRESS}
              availableVotes={availableVotes}
              onVoteSuccess={refetchUsedVotes}
              infoSlot={<NomineeInfo nominee={nominee} />}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NomineeInfo({
  nominee,
}: {
  nominee: SerializableMemberNominee;
}): React.ReactElement {
  return (
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
  );
}
