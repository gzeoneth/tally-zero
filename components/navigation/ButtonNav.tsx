"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@lib/utils";

import { Icons } from "@components/Icons";
import { buttonVariants } from "@components/ui/Button";

const Skeleton = ({ className }: { className?: string }) => (
  <div aria-live="polite" aria-busy="true" className={className}>
    <span className="inline-flex w-full h-[38px] animate-pulse select-none rounded-md bg-gray-300 leading-none">
      ‌
    </span>
    <br />
  </div>
);

const LoadingSkeleton = ({ compact = false }: { compact?: boolean }) => (
  <div className="inline-flex items-center justify-center transition-colors h-10 px-2 sm:px-4 py-2">
    <Skeleton
      className={cn(
        "max-w-full",
        compact ? "w-[80px]" : "w-[120px] sm:w-[158px]"
      )}
    />
  </div>
);

export function ButtonNav() {
  const pathname = usePathname();
  const isExplore = pathname === "/explore";
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <nav className="flex-shrink-0">
      {isExplore ? (
        <div className="flex items-center gap-1 sm:gap-2 px-0 sm:px-4 py-2">
          {loading ? (
            <div className="flex items-center gap-1 sm:gap-2">
              <LoadingSkeleton compact />
              <LoadingSkeleton compact />
            </div>
          ) : (
            <>
              <appkit-network-button />
              <appkit-button />
            </>
          )}
        </div>
      ) : (
        <Link
          href="/explore"
          className={cn(
            buttonVariants({ variant: "default", size: "sm" }),
            "px-3 sm:px-4 min-h-[44px]"
          )}
        >
          <Icons.search className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Start exploring</span>
        </Link>
      )}
    </nav>
  );
}
