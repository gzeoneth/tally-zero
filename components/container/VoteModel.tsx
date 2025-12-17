"use client";

import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

import { proposalSanitizeSchema } from "@lib/sanitize-schema";
import { useCallback, useState } from "react";
import { z } from "zod";

import VoteForm from "@components/form/VoteForm";
import ProposalStages from "@components/proposal/ProposalStages";
import ProposalStagesError from "@components/proposal/ProposalStagesError";
import { Badge } from "@components/ui/Badge";
import { Button } from "@components/ui/Button";
import { CopyableText } from "@components/ui/CopyableText";
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
import { Input } from "@components/ui/Input";
import { Label } from "@components/ui/Label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/Tabs";

import { CORE_GOVERNOR, TREASURY_GOVERNOR } from "@config/arbitrum-governance";
import { proposalSchema } from "@config/schema";
import { cn } from "@lib/utils";
import { formatEther } from "viem";

import { useNerdMode } from "@context/NerdModeContext";
import { useDecodedCalldata } from "@hooks/use-decoded-calldata";
import type { DecodedCalldata, DecodedParameter } from "@lib/calldata-decoder";
import {
  CheckIcon,
  CopyIcon,
  Pencil1Icon,
  ResetIcon,
} from "@radix-ui/react-icons";

// Raw calldata display with copy button
function RawCalldataDisplay({
  calldata,
  nerdMode,
  isOverridden,
  onEdit,
  onReset,
}: {
  calldata: string;
  nerdMode: boolean;
  isOverridden: boolean;
  onEdit: () => void;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(calldata);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = calldata;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [calldata]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <code className="text-xs font-mono break-all block bg-muted/50 p-2 pr-8 rounded max-h-24 overflow-y-auto">
          {calldata}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-2 right-2 p-1 hover:bg-muted rounded transition-colors"
          title="Copy to clipboard"
        >
          {copied ? (
            <CheckIcon className="w-3 h-3 text-green-500" />
          ) : (
            <CopyIcon className="w-3 h-3 text-muted-foreground hover:text-foreground" />
          )}
        </button>
      </div>
      {nerdMode && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil1Icon className="w-3 h-3 mr-1" />
            Edit
          </Button>
          {isOverridden && (
            <Button size="sm" variant="outline" onClick={onReset}>
              <ResetIcon className="w-3 h-3 mr-1" />
              Reset
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Check if this is an Arbitrum Governor (Core or Treasury)
function isArbitrumGovernor(contractAddress: string): boolean {
  const lowerAddress = contractAddress.toLowerCase();
  return (
    lowerAddress === CORE_GOVERNOR.address.toLowerCase() ||
    lowerAddress === TREASURY_GOVERNOR.address.toLowerCase()
  );
}

function truncateValue(value: string, maxLength = 50): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, 24) + "..." + value.slice(-20);
}

// Display a single decoded parameter
function ParameterView({
  param,
  index,
}: {
  param: DecodedParameter;
  index: number;
}) {
  // Check if this is a bytes[] with decoded nested array
  const hasNestedArray = param.nestedArray && param.nestedArray.length > 0;
  const hasNestedSingle = param.nested && param.nested.functionName;

  // Render the value - either as a link or plain text
  const renderValue = () => {
    const isTruncatable =
      param.isNested && !hasNestedArray && param.value.length > 50;
    const displayValue =
      param.isNested && !hasNestedArray
        ? truncateValue(param.value)
        : hasNestedArray
          ? `[${param.nestedArray!.length} calls]`
          : param.value;

    if (param.link && param.type === "address") {
      // Show label as primary text if available, address as title
      const linkText = param.addressLabel || displayValue;
      const titleText = param.addressLabel ? displayValue : undefined;

      return (
        <span className="inline-flex items-center gap-1 flex-wrap">
          <a
            href={param.link}
            target="_blank"
            rel="noopener noreferrer"
            title={titleText}
            className={cn(
              "text-blue-600 dark:text-blue-400 hover:underline",
              param.addressLabel ? "font-medium" : "font-mono"
            )}
          >
            {linkText}
          </a>
          {param.chainLabel && (
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              {param.chainLabel}
            </Badge>
          )}
        </span>
      );
    }

    // Use CopyableText for truncated values to allow copying the original
    if (isTruncatable) {
      return (
        <CopyableText
          value={param.value}
          displayText={displayValue}
          className="text-xs"
        />
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
                <CopyableText
                  value={nestedCall.raw}
                  displayText={
                    nestedCall.raw.length > 80
                      ? truncateValue(nestedCall.raw, 80)
                      : undefined
                  }
                  className="text-[10px] text-muted-foreground"
                />
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

// Single action view with calldata decoding and optional editing
function ActionView({
  index,
  target,
  value,
  calldata,
  nerdMode = false,
  overriddenCalldata,
  onCalldataChange,
}: {
  index: number;
  target: string;
  value: string;
  calldata: string;
  nerdMode?: boolean;
  overriddenCalldata?: string;
  onCalldataChange?: (newCalldata: string | undefined) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(overriddenCalldata || calldata);

  const effectiveCalldata = overriddenCalldata ?? calldata;
  const isOverridden = overriddenCalldata !== undefined;

  const ethValue = formatEther(BigInt(value));
  const hasValue = ethValue !== "0";
  const hasCalldata = effectiveCalldata !== "0x" && effectiveCalldata !== "";

  const { decoded, isDecoding } = useDecodedCalldata({
    calldata: effectiveCalldata,
    targetAddress: target,
    enabled: hasCalldata,
  });

  const showDecoded = decoded && decoded.decodingSource !== "failed";

  const handleSaveEdit = useCallback(() => {
    if (editValue !== calldata) {
      onCalldataChange?.(editValue);
    } else {
      onCalldataChange?.(undefined);
    }
    setIsEditing(false);
  }, [editValue, calldata, onCalldataChange]);

  const handleResetOverride = useCallback(() => {
    onCalldataChange?.(undefined);
    setEditValue(calldata);
    setIsEditing(false);
  }, [calldata, onCalldataChange]);

  const handleCancelEdit = useCallback(() => {
    setEditValue(overriddenCalldata || calldata);
    setIsEditing(false);
  }, [overriddenCalldata, calldata]);

  return (
    <div
      className={cn(
        "border rounded-lg p-3 space-y-2 text-sm",
        isOverridden
          ? "border-orange-500 bg-orange-50/30 dark:bg-orange-950/10"
          : "border-border"
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Action {index + 1}
          {isOverridden && (
            <Badge
              variant="outline"
              className="ml-2 text-[10px] border-orange-500 text-orange-600"
            >
              Override
            </Badge>
          )}
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
        <CopyableText value={target} className="text-xs" maxLength={42} />
      </div>

      {/* Calldata section */}
      {hasCalldata && (
        <div className="space-y-2">
          {/* Decoded view */}
          {(showDecoded || isDecoding) && !isEditing && (
            <DecodedCalldataView decoded={decoded} isDecoding={isDecoding} />
          )}

          {/* Editing mode */}
          {nerdMode && isEditing ? (
            <div className="space-y-2">
              <Label className="text-xs">Edit Calldata (hex)</Label>
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="0x..."
                className="font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={
                    !editValue.startsWith("0x") || editValue.length < 10
                  }
                >
                  Save Override
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Raw data - always visible in nerd mode, collapsible otherwise */}
              <details className="group" open={nerdMode || isOverridden}>
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
                  {showDecoded
                    ? "Raw calldata"
                    : `Calldata (${effectiveCalldata.length} bytes)`}
                  {!showDecoded && !isDecoding && (
                    <Badge variant="outline" className="text-[10px] ml-1">
                      Unknown
                    </Badge>
                  )}
                </summary>
                <div className="mt-1 space-y-2">
                  <RawCalldataDisplay
                    calldata={effectiveCalldata}
                    nerdMode={nerdMode}
                    isOverridden={isOverridden}
                    onEdit={() => {
                      setEditValue(effectiveCalldata);
                      setIsEditing(true);
                    }}
                    onReset={handleResetOverride}
                  />
                </div>
              </details>
            </>
          )}
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

type CalldataOverrides = Record<number, string>;

function PayloadView({
  targets,
  values,
  calldatas,
  nerdMode = false,
  calldataOverrides,
  onCalldataOverrideChange,
}: {
  targets: string[];
  values: string[];
  calldatas: string[];
  nerdMode?: boolean;
  calldataOverrides?: CalldataOverrides;
  onCalldataOverrideChange?: (
    index: number,
    newCalldata: string | undefined
  ) => void;
}) {
  if (targets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No actions in this proposal.
      </p>
    );
  }

  const hasOverrides =
    calldataOverrides && Object.keys(calldataOverrides).length > 0;

  return (
    <div className="space-y-3">
      {/* Override info banner */}
      {nerdMode && hasOverrides && (
        <div className="bg-orange-100 dark:bg-orange-950/30 border border-orange-500 rounded-lg p-3 text-xs text-orange-700 dark:text-orange-300">
          You have calldata overrides active.
        </div>
      )}

      {targets.map((target, idx) => (
        <ActionView
          key={idx}
          index={idx}
          target={target}
          value={values[idx] || "0"}
          calldata={calldatas[idx] || "0x"}
          nerdMode={nerdMode}
          overriddenCalldata={calldataOverrides?.[idx]}
          onCalldataChange={(newCalldata) =>
            onCalldataOverrideChange?.(idx, newCalldata)
          }
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

  const { nerdMode } = useNerdMode();
  const [calldataOverrides, setCalldataOverrides] = useState<CalldataOverrides>(
    {}
  );

  const handleCalldataOverrideChange = useCallback(
    (index: number, newCalldata: string | undefined) => {
      setCalldataOverrides((prev) => {
        if (newCalldata === undefined) {
          const next = { ...prev };
          delete next[index];
          return next;
        }
        return { ...prev, [index]: newCalldata };
      });
    },
    []
  );

  const effectiveCalldatas = proposal.calldatas.map(
    (calldata, idx) => calldataOverrides[idx] ?? calldata
  );

  const hasCalldataOverrides = Object.keys(calldataOverrides).length > 0;

  if (isDesktop) {
    return (
      <DialogContent className="sm:max-w-[1000px] max-w-sm max-h-[90vh] flex flex-col">
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
              <div className="max-h-[60vh] overflow-y-auto text-left bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-2 text-foreground">
                  Description
                </h3>
                <div className="text-sm break-words prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-ul:text-muted-foreground prose-ol:text-muted-foreground prose-li:text-muted-foreground">
                  <ReactMarkdown
                    rehypePlugins={[
                      [rehypeSanitize, proposalSanitizeSchema],
                      rehypeRaw,
                    ]}
                  >
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
            <div className="max-h-[60vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Proposal Actions ({proposal.targets.length})
                </h3>
                {nerdMode && (
                  <Badge variant="outline" className="text-[10px]">
                    Nerd Mode
                  </Badge>
                )}
              </div>
              <PayloadView
                targets={proposal.targets}
                values={proposal.values}
                calldatas={proposal.calldatas}
                nerdMode={nerdMode}
                calldataOverrides={calldataOverrides}
                onCalldataOverrideChange={handleCalldataOverrideChange}
              />
            </div>
          </TabsContent>

          {showStagesTab && proposal.creationTxHash && (
            <TabsContent
              value="stages"
              className="flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col"
            >
              <div className="max-h-[60vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 rounded-lg">
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
              <div className="max-h-[60vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
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
              {nerdMode && hasCalldataOverrides && (
                <div className="mb-4 bg-orange-100 dark:bg-orange-950/30 border border-orange-500 rounded-lg p-3 text-xs text-orange-700 dark:text-orange-300">
                  You have calldata overrides active in the Payload tab.
                </div>
              )}
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
              <div className="max-h-[50vh] overflow-y-auto text-left bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                <h3 className="text-sm font-semibold mb-2 text-foreground">
                  Description
                </h3>
                <div className="text-sm break-words prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground">
                  <ReactMarkdown
                    rehypePlugins={[
                      [rehypeSanitize, proposalSanitizeSchema],
                      rehypeRaw,
                    ]}
                  >
                    {proposal.description}
                  </ReactMarkdown>
                </div>
              </div>
            </DrawerDescription>
          </TabsContent>

          <TabsContent value="payload" className="flex-1 min-h-0">
            <div className="max-h-[50vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Proposal Actions ({proposal.targets.length})
                </h3>
                {nerdMode && (
                  <Badge variant="outline" className="text-[10px]">
                    Nerd Mode
                  </Badge>
                )}
              </div>
              <PayloadView
                targets={proposal.targets}
                values={proposal.values}
                calldatas={proposal.calldatas}
                nerdMode={nerdMode}
                calldataOverrides={calldataOverrides}
                onCalldataOverrideChange={handleCalldataOverrideChange}
              />
            </div>
          </TabsContent>

          {showStagesTab && proposal.creationTxHash && (
            <TabsContent value="stages" className="flex-1 min-h-0">
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
            <TabsContent value="stages" className="flex-1 min-h-0">
              <div className="max-h-[50vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  Stage tracking is not available for this proposal.
                </p>
              </div>
            </TabsContent>
          )}

          <TabsContent value="vote" className="flex-1 min-h-0">
            <div className="pt-4">
              {nerdMode && hasCalldataOverrides && (
                <div className="mb-4 bg-orange-100 dark:bg-orange-950/30 border border-orange-500 rounded-lg p-3 text-xs text-orange-700 dark:text-orange-300">
                  You have calldata overrides active in the Payload tab.
                </div>
              )}
              <VoteForm proposal={proposal} />
            </div>
          </TabsContent>
        </Tabs>
      </DrawerContent>
    </>
  );
}
