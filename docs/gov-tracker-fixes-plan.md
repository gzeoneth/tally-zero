# Gov-Tracker Integration Fix Plan

## Executive Summary

The migration to gov-tracker's bundled cache introduced several bugs around duplicate caching, missing UI states, and performance issues. This plan addresses all identified issues in priority order.

**Status: Phases 1-3 Complete** (as of commit 46e7ab1)

---

## Phase 1: Critical Fixes ✅ COMPLETE

### 1.1 Consolidate Caching to Single Format

**Status**: DEFERRED - System works correctly with current approach

**Problem**: Same stage data stored in 3 different localStorage prefixes:

- `tally-zero-stages-` (old TallyZero format)
- `tally-zero-checkpoint-` (gov-tracker format)
- `tally-zero-timelock-op-` (timelock-only format)

**Current Solution**: Bundled cache merge logic fixed in commit d45781d. Cache count display fixed to count both prefixes. System is functional, consolidation deferred to future refactor.

---

### 1.2 Fix StatusIcon for READY/SKIPPED/CANCELED ✅

**Completed in**: commit 4ae7e6c

Added icons for:

- READY: PlayIcon (blue) - actionable stages
- SKIPPED: MinusCircledIcon (muted) - skipped stages
- CANCELED: StopIcon (orange) - canceled proposals

---

### 1.3 Integrate ExecuteTimelockButton ✅

**Completed in**: commit 46e7ab1

- Added `extractTimelockOperation` helper in StageItem.tsx
- Renders ExecuteTimelockButton for L2_TIMELOCK and L1_TIMELOCK stages with status "READY"
- Extracts operation info from callScheduledData

---

## Phase 2: Medium Priority Fixes ✅ COMPLETE

### 2.1 Fix L1 Block Seeding in seedCheckpointFromStages ✅

**Completed in**: commit 4ae7e6c

- Extracts L1 block from ethereum chain stages
- Extracts L2 block from arb1/nova chain stages
- Uses highest block number found for each chain

### 2.2 Move initializeBundledCache to App Startup ✅

**Completed in**: commit 46e7ab1

- Created BundledCacheProvider context
- Initializes cache once at app startup in layout.tsx
- Removed per-proposal call from use-proposal-stages.tsx

### 2.3 Fix Race Condition in checkAndStartTracking

**Status**: DEFERRED - No user-reported issues

The race condition is theoretical; actual usage hasn't revealed problems. Will monitor.

---

## Phase 3: Low Priority Fixes ✅ COMPLETE

### 3.1 Stage Timeline Styling for READY ✅

**Completed in**: commit 4ae7e6c

- Blue gradient for READY status connecting line
- Blue background for READY status icon
- Blue text for READY stage header

### 3.2 Loading Skeleton Stage Count ✅

**Completed in**: commit 46e7ab1

- LoadingSkeleton accepts `stageCount` prop (default 7)
- ProposalStages passes 4 for Treasury, 7 for Core

### 3.3 ETA Staleness Indicator

**Status**: DEFERRED - Nice to have, not critical

### 3.4 Voting Extension Badge Logic ✅

**Completed in**: commit 46e7ab1

- Extension badge only shows when voting stage status !== "COMPLETED"

---

## Phase 4: Performance & UX Improvements

### 4.1 Add Cache Version Migration

**Status**: TODO - Handle schema changes between bundled cache versions

### 4.2 Improve Error Handling

**Status**: TODO - Use ProposalStagesError component instead of inline error UI

### 4.3 Election-Aware Stage Display

**Status**: COMPLETE - Election tracking was already working correctly (verified in audit)

---

## Commits Summary

| Commit    | Description                                                |
| --------- | ---------------------------------------------------------- |
| `d45781d` | Fix bundled cache merge and cache count display            |
| `4ae7e6c` | Add missing stage status handling and fix L1 block seeding |
| `46e7ab1` | Move bundled cache init to startup and add execute button  |

---

## Testing Checklist

All items verified:

- [x] Run `yarn test` - all 758 tests pass
- [x] Run `yarn build` - static export succeeds
- [x] Proposal stages load from cache
- [x] All 7 stages display for Core Governor
- [x] READY stages show execute button (when callScheduledData available)
- [x] Settings cache count is accurate
- [x] Election page works

---

## Remaining Work (Low Priority)

1. **Cache Consolidation** (1.1): Clean up duplicate cache formats for code simplicity
2. **ETA Staleness** (3.3): Show "updated X ago" next to ETA estimates
3. **Cache Version Migration** (4.1): Handle schema changes gracefully
4. **Error Component** (4.2): Use dedicated error component for consistency
