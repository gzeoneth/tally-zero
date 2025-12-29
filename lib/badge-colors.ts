/**
 * Centralized color definitions for badges, votes, and status indicators.
 * Use these constants to maintain consistency across the UI.
 */

// Vote type colors - using emerald/rose for semantic meaning
export const VOTE_COLORS = {
  for: {
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500 dark:bg-emerald-400",
    dot: "bg-emerald-500 dark:bg-emerald-400",
  },
  against: {
    text: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500 dark:bg-rose-400",
    dot: "bg-rose-500 dark:bg-rose-400",
  },
  abstain: {
    text: "text-muted-foreground",
    bg: "bg-gray-400 dark:bg-gray-500",
    dot: "bg-gray-400 dark:bg-gray-500",
  },
} as const;

// Status badge colors (background + text for badges)
export const STATUS_BADGE_COLORS = {
  success:
    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  warning:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  muted: "bg-muted text-muted-foreground",
} as const;

// Status indicator text colors (without background)
export const STATUS_TEXT_COLORS = {
  success: "text-green-600 dark:text-green-400",
  warning: "text-yellow-600 dark:text-yellow-400",
  error: "text-red-600 dark:text-red-400",
  info: "text-blue-600 dark:text-blue-400",
  muted: "text-muted-foreground",
} as const;

// Status icon colors
export const STATUS_ICON_COLORS = {
  success: "text-green-500",
  warning: "text-yellow-500",
  error: "text-red-500",
  info: "text-blue-500",
  muted: "text-muted-foreground",
} as const;

export type VoteType = keyof typeof VOTE_COLORS;
export type StatusType = keyof typeof STATUS_BADGE_COLORS;
