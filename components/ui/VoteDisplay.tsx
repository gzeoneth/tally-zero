import { formatVotingPower } from "@/lib/format-utils";
import { ProposalVotes } from "@/types/proposal";

interface VoteDisplayProps {
  votes?: ProposalVotes | null;
}

export function VoteDisplay({ votes }: VoteDisplayProps) {
  // Check if votes is actually provided
  if (!votes || !votes.forVotes || !votes.againstVotes || !votes.abstainVotes) {
    return <div className="text-sm text-muted-foreground">No vote data</div>;
  }

  const formatQuorum = (value: string | undefined) => {
    if (!value || value === "0") return "N/A";
    return formatVotingPower(value);
  };

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-green-600 dark:text-green-400 font-medium">
          For:
        </span>
        <span>{formatVotingPower(votes.forVotes)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-red-600 dark:text-red-400 font-medium">
          Against:
        </span>
        <span>{formatVotingPower(votes.againstVotes)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-600 dark:text-gray-400 font-medium">
          Abstain:
        </span>
        <span>{formatVotingPower(votes.abstainVotes)}</span>
      </div>
      <div className="flex items-center gap-2 pt-1 border-t">
        <span className="text-muted-foreground font-medium">Quorum:</span>
        <span>{formatQuorum(votes.quorum)}</span>
      </div>
    </div>
  );
}
