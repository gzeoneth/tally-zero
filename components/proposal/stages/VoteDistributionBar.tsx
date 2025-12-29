"use client";

export interface VoteDistributionBarProps {
  forVotes: string;
  againstVotes: string;
  abstainVotes: string;
}

/**
 * Horizontal bar showing vote distribution (for/against/abstain)
 */
export function VoteDistributionBar({
  forVotes,
  againstVotes,
  abstainVotes,
}: VoteDistributionBarProps) {
  const forNum = parseFloat(forVotes) || 0;
  const againstNum = parseFloat(againstVotes) || 0;
  const abstainNum = parseFloat(abstainVotes) || 0;
  const total = forNum + againstNum + abstainNum;

  if (total === 0) return null;

  const forPct = (forNum / total) * 100;
  const againstPct = (againstNum / total) * 100;
  const abstainPct = (abstainNum / total) * 100;

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">Votes</span>
      <div className="flex h-2 rounded-full overflow-hidden bg-secondary">
        {forPct > 0 && (
          <div
            className="bg-green-500 dark:bg-green-400 transition-all"
            style={{ width: `${forPct}%` }}
          />
        )}
        {againstPct > 0 && (
          <div
            className="bg-red-500 dark:bg-red-400 transition-all"
            style={{ width: `${againstPct}%` }}
          />
        )}
        {abstainPct > 0 && (
          <div
            className="bg-gray-400 dark:bg-gray-500 transition-all"
            style={{ width: `${abstainPct}%` }}
          />
        )}
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 dark:bg-green-400" />
          <span className="text-green-600 dark:text-green-400">
            {forPct.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 dark:bg-red-400" />
          <span className="text-red-600 dark:text-red-400">
            {againstPct.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500" />
          <span className="text-muted-foreground">
            {abstainPct.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}
