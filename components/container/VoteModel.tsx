import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { z } from "zod";

import VoteForm from "@components/form/VoteForm";
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

import { proposalSchema } from "@config/schema";
import { cn } from "@lib/utils";

export default function VoteModel({
  proposal,
  stateValue,
  isDesktop,
}: {
  proposal: z.infer<typeof proposalSchema>;
  stateValue: any;
  isDesktop: boolean;
}) {
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
        </DialogHeader>
        <div className="flex-shrink-0 pt-4 border-t">
          <VoteForm proposal={proposal} />
        </div>
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
        </DrawerHeader>
        <div className="flex-shrink-0 pt-4 border-t">
          <VoteForm proposal={proposal} />
        </div>
      </DrawerContent>
    </>
  );
}
