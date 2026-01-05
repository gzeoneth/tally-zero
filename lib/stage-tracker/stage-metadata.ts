/**
 * Stage metadata definitions for proposal lifecycle tracking
 *
 * Re-exports metadata utilities from @gzeoneth/gov-tracker and provides
 * backwards-compatible interfaces for existing UI components.
 */

// Re-export from gov-tracker
export {
  getStageMetadata,
  getAllStageMetadata,
  getActionableStages,
  formatStageTitle,
  getTotalExpectedDuration,
  type StageMetadata,
} from "@gzeoneth/gov-tracker";
