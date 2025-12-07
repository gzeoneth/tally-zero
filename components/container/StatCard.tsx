"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { Stat } from "@/types/index";
import { Icons } from "@components/Icons";
import { Card, CardContent, CardHeader, CardTitle } from "@components/ui/Card";
import { cn } from "@lib/utils";

function Step({ children, stat }: { children?: React.ReactNode; stat: Stat }) {
  return (
    <Card className="transition-all duration-200">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
        <Icons.arrowRight className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function StatCards() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center justify-between mb-2">
        <Collapsible.Trigger asChild>
          <button
            className={cn(
              "flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
            )}
          >
            {isOpen ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Hide getting started guide
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                Show getting started guide
              </>
            )}
          </button>
        </Collapsible.Trigger>
      </div>

      <Collapsible.Content className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
        <div className="flex flex-col gap-4 md:flex-row md:items-stretch md:grid md:grid-cols-3 pb-4">
          <Step
            stat={{
              title: "Enter Governor Address",
            }}
          >
            <span className="text-sm pl-1 font-normal text-muted-foreground">
              You can choose one of the DAOs from our list, or enter the
              governor address
              <br />
              <span className="flex items-center space-x-2">
                Click on{" "}
                <Icons.orderbook className="mx-1 w-6 h-6 bg-gray-200 text-black rounded-md p-1" />
                to see the list of DAOs.
              </span>
            </span>
          </Step>
          <Step
            stat={{
              title: "Connect to contract",
            }}
          >
            <span className="text-sm pl-1 font-normal text-muted-foreground">
              You can connect to the contract by clicking on the button below.{" "}
              <br />
              <span className="flex items-center space-x-2">
                Click on{" "}
                <Icons.search className="mx-1 w-6 h-6 bg-gray-200 text-black rounded-md p-1" />
                to connect to the contract.
              </span>
            </span>
          </Step>
          <Step
            stat={{
              title: "Vote on proposals",
            }}
          >
            <span className="text-sm pl-1 font-normal text-muted-foreground">
              You can vote on the proposals by filling the form of the chosen
              active proposal. <br />
              <span className="flex items-center space-x-2">
                Click on{" "}
                <Icons.check className="mx-1 w-6 h-6 bg-gray-200 text-black rounded-md p-1" />
                to vote on the proposals.
              </span>
            </span>
          </Step>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
