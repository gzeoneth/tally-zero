"use client";

import { Shield, Users } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import type { SecurityCouncilMembers } from "@/hooks/use-security-council-members";
import { shortenAddress } from "@/lib/format-utils";

interface SecurityCouncilMembersCardProps {
  members: SecurityCouncilMembers | null;
  isLoading: boolean;
}

export function SecurityCouncilMembersCard({
  members,
  isLoading,
}: SecurityCouncilMembersCardProps): React.ReactElement | null {
  if (isLoading && !members) {
    return <SecurityCouncilMembersSkeleton />;
  }

  if (!members) {
    return null;
  }

  const totalMembers = members.firstCohort.length + members.secondCohort.length;

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Current Security Council
        </CardTitle>
        <CardDescription>
          {totalMembers} members across 2 cohorts
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <CohortSection
          title="First Cohort"
          members={members.firstCohort}
          variant="first"
        />
        <CohortSection
          title="Second Cohort"
          members={members.secondCohort}
          variant="second"
        />
      </CardContent>
    </Card>
  );
}

function CohortSection({
  title,
  members,
  variant,
}: {
  title: string;
  members: string[];
  variant: "first" | "second";
}): React.ReactElement {
  const colorClass =
    variant === "first"
      ? "border-blue-500/30 bg-blue-500/10"
      : "border-purple-500/30 bg-purple-500/10";
  const badgeClass = variant === "first" ? "bg-blue-500" : "bg-purple-500";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{title}</h4>
        <Badge variant="secondary" className={badgeClass}>
          {members.length} members
        </Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {members.map((address) => (
          <div
            key={address}
            className={`flex items-center gap-2 rounded-lg border p-2 ${colorClass}`}
          >
            <Users className="h-4 w-4 text-muted-foreground" />
            <a
              href={`https://arbiscan.io/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm hover:underline"
            >
              {shortenAddress(address)}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function SecurityCouncilMembersSkeleton(): React.ReactElement {
  return (
    <Card variant="glass">
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32 mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        {[1, 2].map((cohort) => (
          <div key={cohort} className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <div className="grid gap-2 sm:grid-cols-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
