import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { z } from "zod";

import VoteForm from "@components/form/VoteForm";
import ProposalStages from "@components/proposal/ProposalStages";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/Tabs";

import { CORE_GOVERNOR, TREASURY_GOVERNOR } from "@config/arbitrum-governance";
import { proposalSchema } from "@config/schema";
import { cn } from "@lib/utils";

// Check if this is an Arbitrum Governor (Core or Treasury)
function isArbitrumGovernor(contractAddress: string): boolean {
  const lowerAddress = contractAddress.toLowerCase();
  return (
    lowerAddress === CORE_GOVERNOR.address.toLowerCase() ||
    lowerAddress === TREASURY_GOVERNOR.address.toLowerCase()
  );
}

export default function VoteModel({
  proposal,
  stateValue,
  isDesktop,
}: {
  proposal: z.infer<typeof proposalSchema>;
  stateValue: any;
  isDesktop: boolean;
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
          defaultValue="description"
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="flex-shrink-0 w-full justify-start">
            <TabsTrigger value="description">Description</TabsTrigger>
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

          {showStagesTab && proposal.creationTxHash && (
            <TabsContent
              value="stages"
              className="flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col"
            >
              <div className="max-h-[50vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 rounded-lg">
                <ProposalStages
                  proposalId={proposal.id}
                  creationTxHash={proposal.creationTxHash}
                  governorAddress={proposal.contractAddress}
                />
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

        <Tabs defaultValue="description" className="flex-1 flex flex-col">
          <TabsList className="flex-shrink-0 w-full justify-start">
            <TabsTrigger value="description">Description</TabsTrigger>
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

          {showStagesTab && proposal.creationTxHash && (
            <TabsContent value="stages" className="flex-1 min-h-0">
              <div className="max-h-[40vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 rounded-lg">
                <ProposalStages
                  proposalId={proposal.id}
                  creationTxHash={proposal.creationTxHash}
                  governorAddress={proposal.contractAddress}
                />
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
