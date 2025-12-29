"use client";

export interface SnapshotBlockNoticeProps {
  snapshotBlock: number;
  cacheAge?: string;
}

export function SnapshotBlockNotice({
  snapshotBlock,
  cacheAge,
}: SnapshotBlockNoticeProps) {
  if (snapshotBlock <= 0) return null;

  return (
    <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
      <p className="text-sm text-blue-800 dark:text-blue-200">
        Delegate list indexed up to block {snapshotBlock.toLocaleString()}. New
        delegates since then may not appear.
        {cacheAge && ` Cache age: ${cacheAge}`}
      </p>
    </div>
  );
}
