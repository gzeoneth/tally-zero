import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { z } from "zod";

import VoteForm from "@components/form/VoteForm";
import ProposalStages from "@components/proposal/ProposalStages";
import ProposalStagesError from "@components/proposal/ProposalStagesError";
import { Badge } from "@components/ui/Badge";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@components/ui/Dialog";
import {
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@components/ui/Drawer";
import { ErrorBoundary } from "@components/ui/ErrorBoundary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/Tabs";

import { CORE_GOVERNOR, TREASURY_GOVERNOR } from "@config/arbitrum-governance";
import { proposalSchema } from "@config/schema";
import { cn } from "@lib/utils";
import { formatEther } from "viem";

import { useDecodedCalldata } from "@hooks/use-decoded-calldata";
import type { DecodedCalldata, DecodedParameter } from "@lib/calldata-decoder";

// Check if this is an Arbitrum Governor (Core or Treasury)
function isArbitrumGovernor(contractAddress: string): boolean {
  const lowerAddress = contractAddress.toLowerCase();
  return (
    lowerAddress === CORE_GOVERNOR.address.toLowerCase() ||
    lowerAddress === TREASURY_GOVERNOR.address.toLowerCase()
  );
}

// Display a single decoded parameter
function ParameterView({
  param,
  index,
}: {
  param: DecodedParameter;
  index: number;
}) {
  const truncateValue = (value: string, maxLength = 50): string => {
    if (value.length <= maxLength) return value;
    return value.slice(0, 24) + "..." + value.slice(-20);
  };

  // Check if this is a bytes[] with decoded nested array
  const hasNestedArray = param.nestedArray && param.nestedArray.length > 0;
  const hasNestedSingle = param.nested && param.nested.functionName;

  // Render the value - either as a link or plain text
  const renderValue = () => {
    const displayValue =
      param.isNested && !hasNestedArray
        ? truncateValue(param.value)
        : hasNestedArray
          ? `[${param.nestedArray!.length} calls]`
          : param.value;

    if (param.link && param.type === "address") {
      return (
        <span className="inline-flex items-center gap-1">
          <a
            href={param.link}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-blue-600 dark:text-blue-400 hover:underline"
          >
            {displayValue}
          </a>
          {param.chainLabel && (
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              {param.chainLabel}
            </Badge>
          )}
        </span>
      );
    }

    return <span className="font-mono break-all">{displayValue}</span>;
  };

  return (
    <div className="text-xs space-y-1">
      <div className="flex items-start gap-2">
        <span className="text-muted-foreground font-mono shrink-0">
          {param.name !== `arg${index}` ? param.name : `[${index}]`}{" "}
          {param.type}:
        </span>
        {renderValue()}
      </div>

      {/* Nested single bytes calldata */}
      {hasNestedSingle && (
        <div className="ml-4 pl-2 border-l-2 border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20 rounded p-2 mt-1">
          <span className="text-[10px] text-blue-600 dark:text-blue-400 block mb-1">
            Nested call:
          </span>
          <DecodedCalldataView decoded={param.nested!} isDecoding={false} />
        </div>
      )}

      {/* Nested bytes[] array - each element is a decoded call */}
      {hasNestedArray && (
        <div className="ml-4 space-y-2 mt-1">
          {param.nestedArray!.map((nestedCall, nestedIdx) => (
            <div
              key={nestedIdx}
              className={cn(
                "pl-2 border-l-2 rounded p-2",
                nestedCall.functionName?.startsWith("Retryable Ticket")
                  ? "border-orange-500/30 bg-orange-50/50 dark:bg-orange-950/20"
                  : "border-purple-500/30 bg-purple-50/50 dark:bg-purple-950/20"
              )}
            >
              <span
                className={cn(
                  "text-[10px] block mb-1",
                  nestedCall.functionName?.startsWith("Retryable Ticket")
                    ? "text-orange-600 dark:text-orange-400"
                    : "text-purple-600 dark:text-purple-400"
                )}
              >
                Batch action [{nestedIdx}]:
              </span>
              {nestedCall.functionName ? (
                <DecodedCalldataView decoded={nestedCall} isDecoding={false} />
              ) : (
                <code className="text-[10px] text-muted-foreground break-all">
                  {truncateValue(nestedCall.raw, 80)}
                </code>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Display decoded calldata
function DecodedCalldataView({
  decoded,
  isDecoding,
}: {
  decoded: DecodedCalldata | null;
  isDecoding: boolean;
}) {
  if (isDecoding) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="animate-pulse">Decoding...</span>
      </div>
    );
  }

  if (!decoded || decoded.decodingSource === "failed") {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Function signature badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="font-mono text-xs">
          {decoded.functionName}()
        </Badge>
        <span className="text-[10px] text-muted-foreground">
          {decoded.decodingSource === "local" ? "(local)" : "(4byte)"}
        </span>
      </div>

      {/* Decoded parameters */}
      {decoded.parameters && decoded.parameters.length > 0 && (
        <div className="space-y-1.5 pl-2 border-l-2 border-border">
          {decoded.parameters.map((param, idx) => (
            <ParameterView key={idx} param={param} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
}

// Single action view with calldata decoding
function ActionView({
  index,
  target,
  value,
  calldata,
}: {
  index: number;
  target: string;
  value: string;
  calldata: string;
}) {
  const ethValue = formatEther(BigInt(value));
  const hasValue = ethValue !== "0";
  const hasCalldata = calldata !== "0x" && calldata !== "";

  const { decoded, isDecoding } = useDecodedCalldata({
    calldata,
    targetAddress: target,
    enabled: hasCalldata,
  });

  const showDecoded = decoded && decoded.decodingSource !== "failed";

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 text-sm">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Action {index + 1}
        </span>
        {hasValue && (
          <span className="text-xs font-semibold text-green-600 dark:text-green-400">
            {ethValue} ETH
          </span>
        )}
      </div>

      {/* Target address */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">To:</span>
        <code className="text-xs font-mono truncate">{target}</code>
      </div>

      {/* Calldata section */}
      {hasCalldata && (
        <div className="space-y-2">
          {/* Decoded view */}
          {(showDecoded || isDecoding) && (
            <DecodedCalldataView decoded={decoded} isDecoding={isDecoding} />
          )}

          {/* Raw data toggle */}
          <details className="group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
              {showDecoded
                ? "Raw calldata"
                : `Calldata (${calldata.length} bytes)`}
              {!showDecoded && !isDecoding && (
                <Badge variant="outline" className="text-[10px] ml-1">
                  Unknown
                </Badge>
              )}
            </summary>
            <code className="text-xs font-mono break-all block bg-muted/50 p-2 rounded mt-1 max-h-24 overflow-y-auto">
              {calldata}
            </code>
          </details>
        </div>
      )}

      {!hasCalldata && (
        <span className="text-xs text-muted-foreground italic">
          No calldata
        </span>
      )}
    </div>
  );
}

function PayloadView({
  targets,
  values,
  calldatas,
}: {
  targets: string[];
  values: string[];
  calldatas: string[];
}) {
  if (targets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No actions in this proposal.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {targets.map((target, idx) => (
        <ActionView
          key={idx}
          index={idx}
          target={target}
          value={values[idx] || "0"}
          calldata={calldatas[idx] || "0x"}
        />
      ))}
    </div>
  );
}

interface StateValue {
  value: string;
  label: string;
  bgColor: string;
  icon: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
}

export default function VoteModel({
  proposal,
  stateValue,
  isDesktop,
  defaultTab = "description",
}: {
  proposal: z.infer<typeof proposalSchema>;
  stateValue: StateValue;
  isDesktop: boolean;
  defaultTab?: "description" | "payload" | "stages" | "vote";
}) {
  const showStagesTab = isArbitrumGovernor(proposal.contractAddress);

  if (isDesktop) {
    return (
      <DialogContent className="sm:max-w-[800px] max-w-sm max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            <div className="flex items-center justify-between pb-2">
              <span>Proposal</span>
              <Badge
                className={cn(
                  "text-xs font-semibold inline-flex items-center",
                  stateValue.bgColor
                )}
              >
                <stateValue.icon
                  className="mr-1"
                  style={{ strokeWidth: "2" }}
                />
                {stateValue.label}
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs
          defaultValue={defaultTab}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="flex-shrink-0 w-full justify-start">
            <TabsTrigger value="description">Description</TabsTrigger>
            <TabsTrigger value="payload">Payload</TabsTrigger>
            {showStagesTab && (
              <TabsTrigger value="stages">Lifecycle</TabsTrigger>
            )}
            <TabsTrigger value="vote">Vote</TabsTrigger>
          </TabsList>

          <TabsContent
            value="description"
            className="flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col"
          >
            <DialogDescription asChild>
              <div className="max-h-[50vh] overflow-y-auto text-left bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-2 text-foreground">
                  Description
                </h3>
                <div className="text-sm break-words prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-ul:text-muted-foreground prose-ol:text-muted-foreground prose-li:text-muted-foreground">
                  <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                    {proposal.description}
                  </ReactMarkdown>
                </div>
              </div>
            </DialogDescription>
          </TabsContent>

          <TabsContent
            value="payload"
            className="flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col"
          >
            <div className="max-h-[50vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3 text-foreground">
                Proposal Actions ({proposal.targets.length})
              </h3>
              <PayloadView
                targets={proposal.targets}
                values={proposal.values}
                calldatas={proposal.calldatas}
              />
            </div>
          </TabsContent>

          {showStagesTab && proposal.creationTxHash && (
            <TabsContent
              value="stages"
              className="flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col"
            >
              <div className="max-h-[50vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 rounded-lg">
                <ErrorBoundary
                  fallback={(error, reset) => (
                    <ProposalStagesError error={error} onReset={reset} />
                  )}
                >
                  <ProposalStages
                    proposalId={proposal.id}
                    creationTxHash={proposal.creationTxHash}
                    governorAddress={proposal.contractAddress}
                  />
                </ErrorBoundary>
              </div>
            </TabsContent>
          )}

          {showStagesTab && !proposal.creationTxHash && (
            <TabsContent
              value="stages"
              className="flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col"
            >
              <div className="max-h-[50vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  Stage tracking is not available for this proposal. The
                  creation transaction hash was not found.
                </p>
              </div>
            </TabsContent>
          )}

          <TabsContent
            value="vote"
            className="flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col"
          >
            <div className="pt-4">
              <VoteForm proposal={proposal} />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    );
  }

  return (
    <>
      <DrawerContent className="sm:max-w-[700px] px-4 py-4 max-h-[85vh]">
        <DrawerHeader className="flex-shrink-0">
          <DrawerTitle>
            <div className="flex items-center justify-between py-2">
              <span>Proposal</span>
              <Badge
                className={cn(
                  "text-xs font-semibold inline-flex items-center",
                  stateValue.bgColor
                )}
              >
                <stateValue.icon
                  className="mr-1"
                  style={{ strokeWidth: "2" }}
                />
                {stateValue.label}
              </Badge>
            </div>
          </DrawerTitle>
        </DrawerHeader>

        <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col">
          <TabsList className="flex-shrink-0 w-full justify-start">
            <TabsTrigger value="description">Description</TabsTrigger>
            <TabsTrigger value="payload">Payload</TabsTrigger>
            {showStagesTab && (
              <TabsTrigger value="stages">Lifecycle</TabsTrigger>
            )}
            <TabsTrigger value="vote">Vote</TabsTrigger>
          </TabsList>

          <TabsContent value="description" className="flex-1 min-h-0">
            <DrawerDescription asChild>
              <div className="max-h-[40vh] overflow-y-auto text-left bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                <h3 className="text-sm font-semibold mb-2 text-foreground">
                  Description
                </h3>
                <div className="text-sm break-words prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground">
                  <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                    {proposal.description}
                  </ReactMarkdown>
                </div>
              </div>
            </DrawerDescription>
          </TabsContent>

          <TabsContent value="payload" className="flex-1 min-h-0">
            <div className="max-h-[40vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
              <h3 className="text-sm font-semibold mb-3 text-foreground">
                Proposal Actions ({proposal.targets.length})
              </h3>
              <PayloadView
                targets={proposal.targets}
                values={proposal.values}
                calldatas={proposal.calldatas}
              />
            </div>
          </TabsContent>

          {showStagesTab && proposal.creationTxHash && (
            <TabsContent value="stages" className="flex-1 min-h-0">
              <div className="max-h-[40vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 rounded-lg">
                <ErrorBoundary
                  fallback={(error, reset) => (
                    <ProposalStagesError error={error} onReset={reset} />
                  )}
                >
                  <ProposalStages
                    proposalId={proposal.id}
                    creationTxHash={proposal.creationTxHash}
                    governorAddress={proposal.contractAddress}
                  />
                </ErrorBoundary>
              </div>
            </TabsContent>
          )}

          {showStagesTab && !proposal.creationTxHash && (
            <TabsContent value="stages" className="flex-1 min-h-0">
              <div className="max-h-[40vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  Stage tracking is not available for this proposal.
                </p>
              </div>
            </TabsContent>
          )}

          <TabsContent value="vote" className="flex-1 min-h-0">
            <div className="pt-4">
              <VoteForm proposal={proposal} />
            </div>
          </TabsContent>
        </Tabs>
      </DrawerContent>
    </>
  );
}
