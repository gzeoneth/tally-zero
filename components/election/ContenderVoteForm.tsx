"use client";

import { useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";

import type { SerializableContender } from "@gzeoneth/gov-tracker";
import {
  erc20VotesAbi,
  nomineeElectionGovernorReadAbi,
} from "@gzeoneth/gov-tracker";
import { Wallet } from "lucide-react";

import { useElectionContracts } from "@/hooks/use-election-contracts";
import { formatVotingPower } from "@/lib/format-utils";

import { ElectionVoteRow } from "./ElectionVoteRow";
import { VotingPowerSummary } from "./VotingPowerSummary";

interface ContenderVoteFormProps {
  proposalId: string;
  contenders: SerializableContender[];
  quorumThreshold: string;
}

export function ContenderVoteForm({
  proposalId,
  contenders,
  quorumThreshold,
}: ContenderVoteFormProps): React.ReactElement {
  const { address, isConnected } = useAccount();
  const { nomineeGovernor, arbToken, chainId } = useElectionContracts();
  const governorAddress = nomineeGovernor as `0x${string}`;

  const { data: snapshotBlock } = useReadContract({
    address: governorAddress,
    abi: nomineeElectionGovernorReadAbi,
    functionName: "proposalSnapshot",
    args: [BigInt(proposalId)],
  });

  const { data: totalVotingPower } = useReadContract({
    address: arbToken as `0x${string}`,
    abi: erc20VotesAbi,
    functionName: "getPastVotes",
    args: address && snapshotBlock ? [address, snapshotBlock] : undefined,
    query: { enabled: isConnected && !!address && !!snapshotBlock },
  });

  const { data: usedVotes, refetch: refetchUsedVotes } = useReadContract({
    address: governorAddress,
    abi: nomineeElectionGovernorReadAbi,
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

  if (!isConnected) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <Wallet className="h-4 w-4" />
        Connect your wallet to vote for contenders
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

      <div className="text-sm text-muted-foreground">
        Quorum threshold: {formatVotingPower(quorumThreshold)} ARB per contender
      </div>

      {contenders.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          No contenders registered yet
        </div>
      ) : (
        <div className="space-y-3">
          {contenders.map((contender) => (
            <ElectionVoteRow
              key={contender.address}
              proposalId={proposalId}
              targetAddress={contender.address}
              governorAddress={governorAddress}
              chainId={chainId}
              availableVotes={availableVotes}
              onVoteSuccess={refetchUsedVotes}
            />
          ))}
        </div>
      )}
    </div>
  );
}
