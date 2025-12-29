"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { formatVotingPower } from "@/lib/format-utils";

export interface DelegateStatsCardsProps {
  delegateCount: number;
  totalVotingPower: string;
  totalSupply: string;
  delegatedPercentage: string;
}

export function DelegateStatsCards({
  delegateCount,
  totalVotingPower,
  totalSupply,
  delegatedPercentage,
}: DelegateStatsCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Total Delegates</CardDescription>
          <CardTitle className="text-3xl">
            {delegateCount.toLocaleString()}
          </CardTitle>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Total Voting Power</CardDescription>
          <CardTitle className="text-3xl">
            {formatVotingPower(totalVotingPower)} ARB
          </CardTitle>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>ARB Total Supply</CardDescription>
          <CardTitle className="text-3xl">
            {formatVotingPower(totalSupply)} ARB
          </CardTitle>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Delegated</CardDescription>
          <CardTitle className="text-3xl">{delegatedPercentage}%</CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}
