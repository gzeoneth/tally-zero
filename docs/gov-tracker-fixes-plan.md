# Gov-Tracker Integration Fix Plan

## Executive Summary

The migration to gov-tracker's bundled cache introduced several bugs around duplicate caching, missing UI states, and performance issues. This plan addresses all identified issues in priority order.

---

## Phase 1: Critical Fixes (Must Complete)

### 1.1 Consolidate Caching to Single Format

**Problem**: Same stage data stored in 3 different localStorage prefixes:

- `tally-zero-stages-` (old TallyZero format)
- `tally-zero-checkpoint-` (gov-tracker format)
- `tally-zero-timelock-op-` (timelock-only format)

**Solution**: Remove old cache formats, use only gov-tracker checkpoints

**Files to modify**:

- `lib/unified-cache.ts` - Remove, redirect to gov-tracker cache
- `lib/stages-cache.ts` - Remove, redirect to gov-tracker cache
- `lib/gov-tracker-cache.ts` - Enhance to be single source of truth
- `hooks/use-proposal-stages.tsx` - Simplify to only use checkpoint cache
- `components/container/settings/settings-utils.ts` - Already updated to count both

**Implementation**:

1. Create `getCachedCheckpoint(proposalId, governorAddress)` in gov-tracker-cache.ts
2. Create `saveCachedCheckpoint(proposalId, checkpoint)` wrapper
3. Update useProposalStages to read/write only via gov-tracker-cache
4. Remove unified-cache.ts dependency
5. Keep stages-cache.ts as thin wrapper for backward compat during transition

---

### 1.2 Fix StatusIcon for READY/SKIPPED/CANCELED

**Problem**: StatusIcon only handles COMPLETED, PENDING, FAILED - misses READY, SKIPPED, CANCELED

**Files to modify**:

- `components/proposal/stages/StatusIcon.tsx`

**Implementation**:

```typescript
case "READY":
  return <PlayCircledIcon className="h-5 w-5 text-blue-500" />; // Actionable
case "SKIPPED":
  return <SkipIcon className="h-5 w-5 text-muted-foreground/50" />; // Dimmed
case "CANCELED":
  return <StopCircledIcon className="h-5 w-5 text-orange-500" />; // Warning
```

---

### 1.3 Integrate ExecuteTimelockButton

**Problem**: Component exists but never rendered - users can't execute ready stages

**Files to modify**:

- `components/proposal/stages/StageItem.tsx`
- `components/proposal/stages/StageDataDisplay.tsx`

**Implementation**:

1. Import ExecuteTimelockButton in StageDataDisplay
2. Render for stages with status === "READY" and proper stage types (L2_TIMELOCK, L1_TIMELOCK)
3. Pass required props (timelockAddress, operationId, salt)

---

## Phase 2: Medium Priority Fixes

### 2.1 Fix L1 Block Seeding in seedCheckpointFromStages

**Problem**: Always sets `lastProcessedBlock.l1: 0`

**Files to modify**:

- `lib/gov-tracker-cache.ts`

**Implementation**:

```typescript
// Extract L1 block from L1 stages if present
const l1Stage = stages.find(s =>
  s.chain === "ethereum" && s.transactions?.length > 0
);
lastProcessedBlock: {
  l1: l1Stage?.transactions?.[0]?.blockNumber ?? 0,
  l2: lastTx?.blockNumber ?? 0,
}
```

---

### 2.2 Move initializeBundledCache to App Startup

**Problem**: Called per-proposal in useProposalStages instead of once at startup

**Files to modify**:

- `hooks/use-proposal-stages.tsx` - Remove call
- `context/AppProvider.tsx` or `app/layout.tsx` - Add startup initialization

**Implementation**:

1. Create `useBundledCacheInit` hook that runs once
2. Call in root layout/provider
3. Export `isBundledCacheReady` state for consumers

---

### 2.3 Fix Race Condition in checkAndStartTracking

**Problem**: Session status checked before cache load

**Files to modify**:

- `hooks/use-proposal-stages.tsx`

**Implementation**:

```typescript
const checkAndStartTracking = useCallback(() => {
  // Acquire lock first
  if (!trackerManager.canStartTracking(proposalId, governorAddress)) {
    return;
  }

  // Then load cache and update session atomically
  const unifiedResult = loadUnifiedStages(...);
  // ...
}, []);
```

---

## Phase 3: Low Priority Fixes

### 3.1 Stage Timeline Styling for READY

**Files**: `components/proposal/stages/StageItem.tsx`

- Add blue gradient for READY status connecting line
- Highlight READY stage header text

### 3.2 Loading Skeleton Stage Count

**Files**: `components/proposal/stages/LoadingSkeleton.tsx`

- Accept `stageCount` prop (default 7)
- ProposalStages passes correct count based on governor type

### 3.3 ETA Staleness Indicator

**Files**: `components/proposal/stages/StageDataDisplay.tsx`

- Show "updated X ago" next to ETA
- Use trackedAt timestamp from stage data

### 3.4 Voting Extension Badge Logic

**Files**: `components/proposal/stages/VotingStageContent.tsx`

- Only show extension badge when status !== "COMPLETED"

---

## Phase 4: Performance & UX Improvements

### 4.1 Add Cache Version Migration

Handle schema changes between bundled cache versions gracefully.

### 4.2 Improve Error Handling

Use the dedicated `ProposalStagesError` component instead of inline error UI.

### 4.3 Election-Aware Stage Display

Detect election proposals and show appropriate stage count/types.

---

## Testing Checklist

After each phase:

- [ ] Run `yarn test` - all 758 tests pass
- [ ] Run `yarn build` - static export succeeds
- [ ] Test with agent-browser:
  - [ ] Proposal stages load from cache
  - [ ] All 7 stages display for Core Governor
  - [ ] READY stages show execute button
  - [ ] Settings cache count is accurate
  - [ ] Election page works

---

## Files Summary

| File                                                | Phase         | Action              |
| --------------------------------------------------- | ------------- | ------------------- |
| `lib/unified-cache.ts`                              | 1.1           | Remove/deprecate    |
| `lib/stages-cache.ts`                               | 1.1           | Simplify to wrapper |
| `lib/gov-tracker-cache.ts`                          | 1.1, 2.1      | Enhance             |
| `hooks/use-proposal-stages.tsx`                     | 1.1, 2.2, 2.3 | Major refactor      |
| `components/proposal/stages/StatusIcon.tsx`         | 1.2           | Add cases           |
| `components/proposal/stages/StageItem.tsx`          | 1.3, 3.1      | Add button, styling |
| `components/proposal/stages/StageDataDisplay.tsx`   | 1.3, 3.3      | Add button, ETA     |
| `components/proposal/stages/LoadingSkeleton.tsx`    | 3.2           | Accept prop         |
| `components/proposal/stages/VotingStageContent.tsx` | 3.4           | Fix badge logic     |
| `context/AppProvider.tsx`                           | 2.2           | Init bundled cache  |
