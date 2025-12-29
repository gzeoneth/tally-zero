"use client";

import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  useProposalVotes,
  type ProposalVote,
  type ProposalVotesResult,
  type VoteSupport,
} from "@/hooks/use-proposal-votes";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";
import {
  CheckCircledIcon,
  CrossCircledIcon,
  ExternalLinkIcon,
  MinusCircledIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { Users } from "lucide-react";
import { useState } from "react";

export function ProposalVoteBreakdown() {
  const [proposalIdInput, setProposalIdInput] = useState("");
  const [activeProposalId, setActiveProposalId] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const { result, isLoading, error, refetch } = useProposalVotes({
    proposalId: activeProposalId,
    enabled: activeProposalId.length > 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (proposalIdInput) {
      setActiveProposalId(proposalIdInput);
    }
  };

  const handleClear = () => {
    setProposalIdInput("");
    setActiveProposalId("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Users className="mr-2 h-4 w-4" />
          Proposal Vote Breakdown
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Proposal Vote Breakdown</DialogTitle>
          <DialogDescription>
            View all individual votes on a specific proposal.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="breakdownProposalId">Proposal ID</Label>
            <Input
              id="breakdownProposalId"
              type="text"
              placeholder="Enter proposal ID..."
              value={proposalIdInput}
              onChange={(e) => setProposalIdInput(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={isLoading || !proposalIdInput}
              className="flex-1"
            >
              {isLoading ? (
                <ReloadIcon className="h-4 w-4 animate-spin" />
              ) : (
                "Load Votes"
              )}
            </Button>
            {activeProposalId && (
              <Button type="button" variant="outline" onClick={handleClear}>
                Clear
              </Button>
            )}
          </div>
        </form>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {result && (
          <VoteBreakdownContent
            result={result}
            isLoading={isLoading}
            onRefresh={refetch}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export interface VoteBreakdownContentProps {
  result: ProposalVotesResult;
  isLoading: boolean;
  onRefresh: () => void;
}

export function VoteBreakdownContent({
  result,
  isLoading,
  onRefresh,
}: VoteBreakdownContentProps) {
  const total =
    BigInt(result.forVotes) +
    BigInt(result.againstVotes) +
    BigInt(result.abstainVotes);
  const zero = BigInt(0);
  const multiplier = BigInt(1000);

  const forPct =
    total > zero
      ? Number((BigInt(result.forVotes) * multiplier) / total) / 10
      : 0;
  const againstPct =
    total > zero
      ? Number((BigInt(result.againstVotes) * multiplier) / total) / 10
      : 0;
  const abstainPct =
    total > zero
      ? Number((BigInt(result.abstainVotes) * multiplier) / total) / 10
      : 0;

  return (
    <div className="space-y-4 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <a
          href={`https://arbiscan.io/address/${result.governorAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          {result.governorName}
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
        >
          {isLoading ? (
            <ReloadIcon className="h-4 w-4 animate-spin" />
          ) : (
            <ReloadIcon className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Vote Stats */}
      <div className="glass-subtle rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Vote Summary
          </span>
          <span className="text-xs text-muted-foreground">
            {result.totalVotes} voters
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-green-600 dark:text-green-400">
              {formatVotingPower(result.forVotes)}
            </div>
            <div className="text-xs text-muted-foreground">
              For ({result.forCount})
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-red-600 dark:text-red-400">
              {formatVotingPower(result.againstVotes)}
            </div>
            <div className="text-xs text-muted-foreground">
              Against ({result.againstCount})
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
              {formatVotingPower(result.abstainVotes)}
            </div>
            <div className="text-xs text-muted-foreground">
              Abstain ({result.abstainCount})
            </div>
          </div>
        </div>
        {/* Distribution bar */}
        <div className="h-2 rounded-full overflow-hidden bg-secondary flex">
          {forPct > 0 && (
            <div
              className="bg-green-500 transition-all"
              style={{ width: `${forPct}%` }}
              title={`For: ${forPct.toFixed(1)}%`}
            />
          )}
          {againstPct > 0 && (
            <div
              className="bg-red-500 transition-all"
              style={{ width: `${againstPct}%` }}
              title={`Against: ${againstPct.toFixed(1)}%`}
            />
          )}
          {abstainPct > 0 && (
            <div
              className="bg-yellow-500 transition-all"
              style={{ width: `${abstainPct}%` }}
              title={`Abstain: ${abstainPct.toFixed(1)}%`}
            />
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs text-center text-muted-foreground">
          <span>{forPct.toFixed(1)}%</span>
          <span>{againstPct.toFixed(1)}%</span>
          <span>{abstainPct.toFixed(1)}%</span>
        </div>
      </div>

      {/* Vote List */}
      {result.votes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No votes found for this proposal
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1">
          {result.votes.map((vote, index) => (
            <VoteRow key={`${vote.voter}-${index}`} vote={vote} />
          ))}
        </div>
      )}
    </div>
  );
}

function VoteRow({ vote }: { vote: ProposalVote }) {
  const txUrl = `https://arbiscan.io/tx/${vote.txHash}`;
  const voterUrl = `https://arbiscan.io/address/${vote.voter}`;

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
      {/* Vote Badge */}
      <VoteBadge support={vote.support} />

      {/* Voter Info */}
      <div className="flex-1 min-w-0">
        {vote.voterLabel ? (
          <>
            <div className="font-medium text-sm truncate">
              {vote.voterLabel}
            </div>
            <a
              href={voterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-muted-foreground hover:text-foreground truncate block"
            >
              {shortenAddress(vote.voter, 4)}
            </a>
          </>
        ) : (
          <a
            href={voterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm text-muted-foreground hover:text-foreground truncate block"
          >
            {shortenAddress(vote.voter, 6)}
          </a>
        )}
      </div>

      {/* Voting Power */}
      <div className="text-right">
        <div className="font-semibold text-sm tabular-nums">
          {formatVotingPower(vote.weight)}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">ARB</div>
      </div>

      {/* Link */}
      <a
        href={txUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground p-1"
        title="View transaction"
      >
        <ExternalLinkIcon className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function VoteBadge({ support }: { support: VoteSupport }) {
  switch (support) {
    case "for":
      return (
        <div className="w-7 h-7 rounded-full flex items-center justify-center bg-green-500/20 text-green-600">
          <CheckCircledIcon className="h-4 w-4" />
        </div>
      );
    case "against":
      return (
        <div className="w-7 h-7 rounded-full flex items-center justify-center bg-red-500/20 text-red-600">
          <CrossCircledIcon className="h-4 w-4" />
        </div>
      );
    case "abstain":
      return (
        <div className="w-7 h-7 rounded-full flex items-center justify-center bg-yellow-500/20 text-yellow-600">
          <MinusCircledIcon className="h-4 w-4" />
        </div>
      );
  }
}
