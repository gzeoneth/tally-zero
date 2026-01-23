"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { useTimelockOperation } from "@/hooks/use-timelock-operation";
import type { TimelockOpWithStatus } from "@/hooks/use-timelock-ops-discovery";
import { truncateMiddle } from "@/lib/text-utils";
import { ExternalLink, RefreshCw } from "lucide-react";
import { TimelockStagesDisplay } from "./TimelockStagesDisplay";

interface TimelockOpDetailProps {
  operation: TimelockOpWithStatus;
}

export function TimelockOpDetail({ operation }: TimelockOpDetailProps) {
  const { stages, isLoading, isTracking, error, refetch } =
    useTimelockOperation({
      txHash: operation.scheduledTxHash,
      enabled: true,
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              Timelock Operation Details
            </CardTitle>
            <div className="flex items-center gap-2">
              {operation.isOrphan ? (
                <Badge variant="outline" className="bg-yellow-500/10">
                  Orphan
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-green-500/10">
                  Linked
                </Badge>
              )}
              <Badge
                variant={
                  operation.timelockName === "Core Timelock"
                    ? "default"
                    : "secondary"
                }
              >
                {operation.timelockName}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Operation ID</p>
              <p className="font-mono text-sm break-all">
                {operation.operationId}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Queue Block</p>
              <p className="font-mono text-sm">
                {operation.queueBlock.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Timelock Address</p>
              <a
                href={`https://arbiscan.io/address/${operation.timelockAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-sm hover:underline"
              >
                {truncateMiddle(operation.timelockAddress)}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Transaction</p>
              <a
                href={`https://arbiscan.io/tx/${operation.scheduledTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-sm hover:underline"
              >
                {truncateMiddle(operation.scheduledTxHash)}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Lifecycle Stages</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={refetch}
              disabled={isLoading || isTracking}
              className="gap-2"
            >
              <RefreshCw
                className={`h-4 w-4 ${isTracking ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isTracking && stages.length === 0 && (
            <div className="space-y-3">
              <Progress
                value={50}
                variant="glass"
                indicatorVariant="gradient"
              />
              <p className="text-sm text-muted-foreground text-center">
                Tracking operation lifecycle...
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {stages.length > 0 && (
            <TimelockStagesDisplay stages={stages} isLoading={isTracking} />
          )}

          {!isTracking && stages.length === 0 && !error && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No lifecycle stages found
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
