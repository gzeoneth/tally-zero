import { ProposalVotes } from "@/types/proposal";
import { ethers } from "ethers";

interface QuickVotePreviewProps {
  votes?: ProposalVotes | null;
}

export function QuickVotePreview({ votes }: QuickVotePreviewProps) {
  // Check if votes is actually provided
  if (!votes || !votes.forVotes || !votes.againstVotes || !votes.abstainVotes) {
    return null;
  }

  try {
    const forVotesBN = ethers.BigNumber.from(votes.forVotes);
    const againstVotesBN = ethers.BigNumber.from(votes.againstVotes);
    const abstainVotesBN = ethers.BigNumber.from(votes.abstainVotes);

    const totalVotes = forVotesBN.add(againstVotesBN).add(abstainVotesBN);

    // If no votes cast yet, return null
    if (totalVotes.isZero()) {
      return (
        <div className="text-xs text-muted-foreground italic">No votes yet</div>
      );
    }

    // Calculate percentages
    const forPct = forVotesBN.mul(10000).div(totalVotes).toNumber() / 100;
    const againstPct =
      againstVotesBN.mul(10000).div(totalVotes).toNumber() / 100;
    const abstainPct =
      abstainVotesBN.mul(10000).div(totalVotes).toNumber() / 100;

    return (
      <div className="flex flex-col gap-1.5 w-full max-w-[200px]">
        {/* Stacked progress bar */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
          {forPct > 0 && (
            <div
              className="bg-green-500 dark:bg-green-400 transition-all"
              style={{ width: `${forPct}%` }}
              title={`For: ${forPct.toFixed(1)}%`}
            />
          )}
          {againstPct > 0 && (
            <div
              className="bg-red-500 dark:bg-red-400 transition-all"
              style={{ width: `${againstPct}%` }}
              title={`Against: ${againstPct.toFixed(1)}%`}
            />
          )}
          {abstainPct > 0 && (
            <div
              className="bg-gray-400 dark:bg-gray-500 transition-all"
              style={{ width: `${abstainPct}%` }}
              title={`Abstain: ${abstainPct.toFixed(1)}%`}
            />
          )}
        </div>

        {/* Percentage labels */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500 dark:bg-green-400" />
            <span className="font-medium text-green-700 dark:text-green-300">
              {forPct.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500 dark:bg-red-400" />
            <span className="font-medium text-red-700 dark:text-red-300">
              {againstPct.toFixed(1)}%
            </span>
          </div>
          {abstainPct > 1 && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500" />
              <span className="font-medium text-gray-600 dark:text-gray-400">
                {abstainPct.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error calculating vote percentages:", error);
    return null;
  }
}
