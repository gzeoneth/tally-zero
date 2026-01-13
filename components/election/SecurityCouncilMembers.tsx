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
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
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

const COHORT_STYLES = {
  first: {
    container: "border-blue-500/30 bg-blue-500/10",
    badge: "bg-blue-500",
  },
  second: {
    container: "border-purple-500/30 bg-purple-500/10",
    badge: "bg-purple-500",
  },
} as const;

function CohortSection({
  title,
  members,
  variant,
}: {
  title: string;
  members: string[];
  variant: keyof typeof COHORT_STYLES;
}): React.ReactElement {
  const styles = COHORT_STYLES[variant];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{title}</h4>
        <Badge variant="secondary" className={styles.badge}>
          {members.length} members
        </Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {members.map((address) => (
          <div
            key={address}
            className={`flex items-center gap-2 rounded-lg border p-2 ${styles.container}`}
          >
            <Users className="h-4 w-4 text-muted-foreground" />
            <a
              href={getAddressExplorerUrl(address)}
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

const SKELETON_COHORTS = 2;
const SKELETON_MEMBERS_PER_COHORT = 6;

function SecurityCouncilMembersSkeleton(): React.ReactElement {
  return (
    <Card variant="glass">
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2 h-4 w-32" />
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.from({ length: SKELETON_COHORTS }, (_, cohortIndex) => (
          <div key={cohortIndex} className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: SKELETON_MEMBERS_PER_COHORT }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
