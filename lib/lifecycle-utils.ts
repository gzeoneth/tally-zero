export function formatStageName(stageName: string): string {
  return stageName
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatCurrentState(state: string | null): string {
  if (!state) return "Unknown";

  const stateMap: Record<string, string> = {
    active: "Active",
    pending: "Pending",
    succeeded: "Passed",
    defeated: "Defeated",
    queued: "Queued",
    executed: "Executed",
    canceled: "Canceled",
    expired: "Expired",
  };

  const normalized = state.toLowerCase();
  return stateMap[normalized] || state;
}

export type StateStyleColor =
  | "text-green-600 dark:text-green-400"
  | "text-blue-600 dark:text-blue-400"
  | "text-yellow-600 dark:text-yellow-400"
  | "text-red-600 dark:text-red-400"
  | "text-muted-foreground";

export type StateStyleIcon = "check" | "reload" | "clock" | "cross";

export function getStateStyle(state: string | null): {
  icon: StateStyleIcon;
  color: StateStyleColor;
} {
  const normalizedState = state?.toLowerCase();

  switch (normalizedState) {
    case "executed":
      return {
        icon: "check",
        color: "text-green-600 dark:text-green-400",
      };
    case "active":
    case "pending":
      return {
        icon: "reload",
        color: "text-blue-600 dark:text-blue-400",
      };
    case "queued":
    case "succeeded":
      return {
        icon: "clock",
        color: "text-yellow-600 dark:text-yellow-400",
      };
    case "defeated":
    case "canceled":
    case "expired":
      return {
        icon: "cross",
        color: "text-red-600 dark:text-red-400",
      };
    default:
      return {
        icon: "clock",
        color: "text-muted-foreground",
      };
  }
}
