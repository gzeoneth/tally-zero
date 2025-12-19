"use client";

import { ExternalLinkIcon } from "@radix-ui/react-icons";

import { Badge } from "@/components/ui/Badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  useTopDelegatesNotVoted,
  type DelegateNotVoted,
} from "@/hooks/use-top-delegates-not-voted";

interface TopDelegatesNotVotedProps {
  proposalId: string;
  governorAddress: string;
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatVotingPower(votingPowerWei: string): string {
  const power = BigInt(votingPowerWei);
  const arbTokens = power / BigInt(10 ** 18);

  if (arbTokens >= BigInt(1_000_000)) {
    return `${(Number(arbTokens) / 1_000_000).toFixed(1)}M`;
  }
  if (arbTokens >= BigInt(1_000)) {
    return `${(Number(arbTokens) / 1_000).toFixed(1)}K`;
  }
  return arbTokens.toString();
}

function DelegateBadge({ delegate }: { delegate: DelegateNotVoted }) {
  const displayName = delegate.label || shortenAddress(delegate.address);
  const votingPower = formatVotingPower(delegate.votingPower);
  const arbiscanUrl = `https://arbiscan.io/address/${delegate.address}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded-full"
        >
          <Badge
            variant="outline"
            className="text-xs py-0 px-1.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
          >
            {displayName} · {votingPower}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="space-y-2">
          <div className="text-sm font-medium">
            {delegate.label || "Delegate"}
          </div>
          <div className="font-mono text-xs text-muted-foreground break-all">
            {delegate.address}
          </div>
          <div className="text-xs text-muted-foreground">
            Voting power: {votingPower} ARB
          </div>
          <a
            href={arbiscanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            View on Arbiscan
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TopDelegatesNotVoted({
  proposalId,
  governorAddress,
}: TopDelegatesNotVotedProps) {
  const { delegatesNotVoted, isLoading, error, allTopDelegatesVoted } =
    useTopDelegatesNotVoted({ proposalId, governorAddress, limit: 5 });

  if (isLoading) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <span className="text-xs text-muted-foreground">Didn&apos;t vote:</span>
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    );
  }

  if (error || delegatesNotVoted.length === 0) {
    return null;
  }

  if (allTopDelegatesVoted) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <Badge
          variant="secondary"
          className="text-xs py-0 px-1.5 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
        >
          Top delegates have voted
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <span className="text-xs text-muted-foreground">Didn&apos;t vote:</span>
      {delegatesNotVoted.map((delegate) => (
        <DelegateBadge key={delegate.address} delegate={delegate} />
      ))}
    </div>
  );
}
