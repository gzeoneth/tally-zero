"use client";

import { useProposalStages } from "@/hooks/use-proposal-stages";
import { getStageMetadata, type TrackedStage } from "@gzeoneth/gov-tracker";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

interface ProposalStagesProps {
  txHash: string;
}

function getExplorerUrl(chain: string, hash: string): string {
  switch (chain) {
    case "ARBITRUM":
      return `https://arbiscan.io/tx/${hash}`;
    case "ETHEREUM":
      return `https://etherscan.io/tx/${hash}`;
    case "NOVA":
      return `https://nova.arbiscan.io/tx/${hash}`;
    default:
      return `https://arbiscan.io/tx/${hash}`;
  }
}

function StageIcon({
  status,
}: {
  status: TrackedStage["status"];
}): React.ReactElement {
  switch (status) {
    case "COMPLETED":
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "FAILED":
    case "CANCELED":
      return <XCircle className="h-4 w-4 text-red-600" />;
    case "READY":
      return <Clock className="h-4 w-4 text-blue-600 animate-pulse" />;
    case "PENDING":
      return <Clock className="h-4 w-4 text-yellow-600" />;
    default:
      return <Clock className="h-4 w-4 text-gray-400" />;
  }
}

export function ProposalStages({
  txHash,
}: ProposalStagesProps): React.ReactElement {
  const { stages, isLoading, error } = useProposalStages(txHash);

  if (error) {
    return (
      <div className="p-4 text-red-500 text-sm">
        Error loading stages: {error}
      </div>
    );
  }

  if (isLoading && stages.length === 0) {
    return (
      <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading governance stages...
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No stages found for this proposal.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <h3 className="font-semibold text-sm">Governance Lifecycle</h3>
      <div className="space-y-2">
        {stages.map((stage) => {
          const meta = getStageMetadata(stage.type);
          const chain =
            typeof meta?.chain === "string" ? meta.chain : "ARBITRUM";

          return (
            <div key={stage.type} className="flex gap-3 items-start">
              <div className="mt-0.5">
                <StageIcon status={stage.status} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">
                  {meta?.title || stage.type}
                </div>
                {meta?.description && (
                  <div className="text-xs text-muted-foreground">
                    {meta.description}
                  </div>
                )}
                {stage.transactions && stage.transactions.length > 0 && (
                  <div className="flex flex-col gap-1 mt-1">
                    {stage.transactions.map((tx) => {
                      const txChain = tx.chain?.toUpperCase() || chain;
                      return (
                        <div key={tx.hash} className="flex items-center gap-2">
                          {tx.description && (
                            <span className="text-xs text-muted-foreground">
                              {tx.description}:
                            </span>
                          )}
                          <a
                            href={getExplorerUrl(txChain, tx.hash)}
                            className="text-xs text-blue-600 hover:underline font-mono truncate"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {tx.hash}
                          </a>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Tracking in progress...
        </div>
      )}
    </div>
  );
}
