"use client";

import { memo } from "react";

interface LoadingSkeletonProps {
  stageCount?: number;
}

export const LoadingSkeleton = memo(function LoadingSkeleton({
  stageCount = 7,
}: LoadingSkeletonProps) {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: stageCount }, (_, i) => i + 1).map((i) => (
        <div key={i} className="flex gap-4">
          <div className="relative w-7 h-7 rounded-full glass-subtle overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite]" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="relative h-4 w-32 glass-subtle rounded-lg overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite]" />
            </div>
            <div className="relative h-3 w-48 glass-subtle rounded-lg overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});
