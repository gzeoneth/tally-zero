import DelegateSearch from "@/components/container/DelegateSearch";
import { Suspense } from "react";

export const metadata = {
  title: "Delegates | Arbitrum Governance",
  description: "View voting power distribution across Arbitrum DAO delegates",
};

export default function DelegatesPage() {
  return (
    <div className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16">
      <div className="container flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Delegates</h1>
          <p className="text-muted-foreground">
            View voting power distribution across Arbitrum DAO delegates
          </p>
        </div>
        <Suspense fallback={<DelegateSearchSkeleton />}>
          <DelegateSearch />
        </Suspense>
      </div>
    </div>
  );
}

function DelegateSearchSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
      <div className="h-12 bg-muted animate-pulse rounded-lg" />
      <div className="h-96 bg-muted animate-pulse rounded-lg" />
    </div>
  );
}
