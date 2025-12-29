/**
 * @fileoverview Incremental stage tracker for governance proposals
 *
 * This module has been refactored into smaller, focused files under lib/stage-tracker/
 * for better maintainability. This file re-exports the public API for backward compatibility.
 *
 * @see lib/stage-tracker/incremental-tracker.ts - Main tracker class
 * @see lib/stage-tracker/factory.ts - Factory functions for governor-specific trackers
 * @see lib/stage-tracker/stage-metadata.ts - Stage metadata utilities
 * @see lib/stage-tracker/stages/ - Individual stage tracking modules
 */

// Re-export everything from the modular implementation
export {
  // Main tracker class
  IncrementalStageTracker,
  STAGE_METADATA,
  // Factory functions
  createCoreGovernorTracker,
  createTreasuryGovernorTracker,
  // Stage metadata
  getAllStageMetadata,
  getStageMetadata,
  type StageMetadata,
  // Types
  type StageProgressCallback,
} from "./stage-tracker";
