import { ProposalVotes } from "@/types/proposal";
import { ethers } from "ethers";

interface VoteDisplayProps {
  votes?: ProposalVotes | null;
}

export function VoteDisplay({ votes }: VoteDisplayProps) {
  // Check if votes is actually provided
  if (!votes || !votes.forVotes || !votes.againstVotes || !votes.abstainVotes) {
    return <div className="text-sm text-muted-foreground">No vote data</div>;
  }

  const formatVotes = (value: string) => {
    try {
      const bn = ethers.BigNumber.from(value);
      const formatted = ethers.utils.formatEther(bn);
      const num = parseFloat(formatted);

      // Format with appropriate decimals
      if (num === 0) return "0";
      if (num < 0.01) return "<0.01";
      if (num < 1) return num.toFixed(2);
      if (num < 1000) return num.toFixed(1);
      if (num < 1000000) return `${(num / 1000).toFixed(1)}K`;
      return `${(num / 1000000).toFixed(1)}M`;
    } catch {
      return "0";
    }
  };

  const formatQuorum = (value: string | undefined) => {
    if (!value || value === "0") return "N/A";
    return formatVotes(value);
  };

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-green-600 dark:text-green-400 font-medium">
          For:
        </span>
        <span>{formatVotes(votes.forVotes)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-red-600 dark:text-red-400 font-medium">
          Against:
        </span>
        <span>{formatVotes(votes.againstVotes)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-600 dark:text-gray-400 font-medium">
          Abstain:
        </span>
        <span>{formatVotes(votes.abstainVotes)}</span>
      </div>
      <div className="flex items-center gap-2 pt-1 border-t">
        <span className="text-muted-foreground font-medium">Quorum:</span>
        <span>{formatQuorum(votes.quorum)}</span>
      </div>
    </div>
  );
}
