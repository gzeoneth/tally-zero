"use client";

import { formatEtaTimestamp } from "@/lib/date-utils";

import {
  RetryableCreationDetails,
  RetryableRedemptionDetails,
} from "./RetryableDetails";

export interface StageDataDisplayProps {
  data: Record<string, unknown>;
}

/**
 * Displays stage-specific data like ETA, notes, and retryable ticket details
 */
export function StageDataDisplay({ data }: StageDataDisplayProps) {
  return (
    <div className="mt-2 text-xs">
      {"eta" in data && data.eta ? (
        <p className="text-muted-foreground">
          ETA: {formatEtaTimestamp(String(data.eta))}
        </p>
      ) : null}
      {"note" in data && data.note ? (
        <p className="text-muted-foreground italic">{String(data.note)}</p>
      ) : null}
      {"message" in data && data.message && !("note" in data && data.note) ? (
        <p className="text-muted-foreground italic">{String(data.message)}</p>
      ) : null}
      {"creationDetails" in data &&
      Array.isArray(data.creationDetails) &&
      data.creationDetails.length > 0 ? (
        <RetryableCreationDetails details={data.creationDetails} />
      ) : null}
      {"redemptionDetails" in data &&
      Array.isArray(data.redemptionDetails) &&
      data.redemptionDetails.length > 0 ? (
        <RetryableRedemptionDetails details={data.redemptionDetails} />
      ) : null}
    </div>
  );
}
