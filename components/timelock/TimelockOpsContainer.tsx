"use client";

import RpcStatus from "@/components/container/RpcStatus";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { useRpcHealthOrchestration } from "@/hooks/use-rpc-health-orchestration";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import {
  useTimelockOpsDiscovery,
  type TimelockOpWithStatus,
} from "@/hooks/use-timelock-ops-discovery";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { TimelockOpDetail } from "./TimelockOpDetail";

function truncateHash(hash: string, start = 10, end = 8): string {
  if (hash.length <= start + end) return hash;
  return `${hash.slice(0, start)}...${hash.slice(-end)}`;
}

function TimelockOpsList({
  operations,
  showOrphansOnly,
  onSelectOperation,
}: {
  operations: TimelockOpWithStatus[];
  showOrphansOnly: boolean;
  onSelectOperation: (op: TimelockOpWithStatus) => void;
}) {
  const filteredOps = useMemo(
    () =>
      showOrphansOnly ? operations.filter((op) => op.isOrphan) : operations,
    [operations, showOrphansOnly]
  );

  if (filteredOps.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No {showOrphansOnly ? "orphan " : ""}timelock operations found
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl overflow-clip">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Operation ID</TableHead>
            <TableHead>Timelock</TableHead>
            <TableHead>Block</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Transaction</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredOps.map((op) => (
            <TableRow
              key={`${op.operationId}-${op.queueBlock}`}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onSelectOperation(op)}
            >
              <TableCell className="font-mono text-sm">
                {truncateHash(op.operationId)}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    op.timelockName === "Core Timelock"
                      ? "default"
                      : "secondary"
                  }
                >
                  {op.timelockName}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-sm">
                {op.queueBlock.toLocaleString()}
              </TableCell>
              <TableCell>
                {op.isOrphan ? (
                  <Badge variant="outline" className="bg-yellow-500/10">
                    Orphan
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-green-500/10">
                    Linked
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <a
                  href={`https://arbiscan.io/tx/${op.scheduledTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  {truncateHash(op.scheduledTxHash, 8, 6)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function TimelockOpsContainer() {
  const { l1Rpc, l2Rpc, isHydrated: rpcSettingsHydrated } = useRpcSettings();
  const { autoStarted, rpcHealthy, handleRpcHealthChecked } =
    useRpcHealthOrchestration();

  const { operations, isLoading, error, progress, refetch } =
    useTimelockOpsDiscovery({
      enabled: autoStarted && rpcHealthy === true,
    });

  const [selectedOp, setSelectedOp] = useState<TimelockOpWithStatus | null>(
    null
  );
  const [showOrphansOnly, setShowOrphansOnly] = useState(true);

  const customRpcUrls = useMemo(
    () => ({
      arb1: l2Rpc,
      l1: l1Rpc,
    }),
    [l2Rpc, l1Rpc]
  );

  const orphanCount = operations.filter((op) => op.isOrphan).length;

  const progressMessage = useMemo(() => {
    if (progress === 0) return "Connecting to Arbitrum...";
    if (progress < 60)
      return `Discovering timelock operations... ${Math.round(progress)}%`;
    if (progress < 90)
      return `Checking operation status... ${Math.round(progress)}%`;
    return "Finalizing...";
  }, [progress]);

  // Detail view for selected operation
  if (selectedOp) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          onClick={() => setSelectedOp(null)}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to list
        </Button>
        <TimelockOpDetail operation={selectedOp} />
        <RpcStatus
          customUrls={customRpcUrls}
          onHealthChecked={handleRpcHealthChecked}
          autoCheck={rpcSettingsHydrated}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rpcHealthy === false && (
        <Card className="border-red-200/50 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="pt-6">
            <p className="text-sm text-red-600 dark:text-red-400">
              Cannot connect to Arbitrum RPC. Please check your connection or
              try a different RPC URL in settings.
            </p>
          </CardContent>
        </Card>
      )}

      {rpcHealthy === true && autoStarted && progress < 100 && !error && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="glass rounded-2xl p-8 w-full max-w-lg space-y-6">
            <div className="flex items-center justify-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-purple-600 dark:text-purple-400 animate-pulse"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <Progress
                value={progress}
                variant="glass"
                indicatorVariant="gradient"
              />
              <p className="text-sm text-muted-foreground text-center">
                {progressMessage}
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <Card className="border-red-200/50 dark:border-red-800/50">
          <CardContent className="pt-6">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {progress === 100 && !error && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">
                Found {operations.length} operations ({orphanCount} orphan)
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOrphansOnly(!showOrphansOnly)}
              >
                {showOrphansOnly ? "Show All" : "Show Orphans Only"}
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refetch}
              disabled={isLoading}
              className="gap-2"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>

          <TimelockOpsList
            operations={operations}
            showOrphansOnly={showOrphansOnly}
            onSelectOperation={setSelectedOp}
          />
        </>
      )}

      <RpcStatus
        customUrls={customRpcUrls}
        onHealthChecked={handleRpcHealthChecked}
        autoCheck={rpcSettingsHydrated}
      />
    </div>
  );
}
