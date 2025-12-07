import Search from "@/components/container/Search";
import { Suspense } from "react";

export const metadata = {
  title: "Arbitrum Governance",
};

export default function IndexPage() {
  return (
    <div className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16">
      <div className="container flex flex-col gap-4">
        <Suspense fallback={<div>Loading...</div>}>
          <Search />
        </Suspense>
      </div>
    </div>
  );
}
