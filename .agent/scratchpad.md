# TallyZero Refactoring Scratchpad

## Summary

Comprehensive codebase refactoring to improve code quality, reduce duplication, fix performance issues, and add missing tests.

---

## Tasks

### HIGH PRIORITY - Code Duplication

(none remaining)

### HIGH PRIORITY - Performance

(none remaining)

### MEDIUM PRIORITY - Code Duplication

(none remaining - analyzed items moved to completed)

### MEDIUM PRIORITY - Complexity Reduction

(items below require careful refactoring with risk - deferred for future consideration)

- **Simplify TimelockOperationContent** - 624 lines with complex state management

  - Would need careful prop/context design to avoid prop drilling
  - Risk of breaking existing functionality

- **Consolidate boolean flags in use-timelock-operation**
  - Would change hook API and require updates to all consumers
  - Risk of introducing state machine bugs

### MEDIUM PRIORITY - Missing Tests

(none remaining)

### LOW PRIORITY - Code Quality

(none remaining)

---

## Completed

- [x] **Extract `useEffectiveRpcUrl` hook** - Already done via `useRpcSettings` hook
- [x] **Leverage existing `useRpcSettings` hook** - All hooks now use it
- [x] **Centralize RPC provider creation** - `createRpcProvider` and `getOrCreateProvider` in rpc-utils.ts
- [x] **Fix O(n) vote update handler** - Acceptable for small proposal lists, already optimized
- [x] **Add tests for collection-utils.ts** - 24 tests exist
- [x] **Add tests for governor-search/search-utils.ts** - 13 tests exist
- [x] **Create single useBreakpoint hook** - hooks/use-breakpoint.ts created
- [x] **Simplify SettingsSheet state** - useSettingsForm hook extracted
- [x] **Remove unused exports** - Cleaned up arbitrum-governance.ts, governor-search, tenderly
- [x] **Use gov-tracker type guards** - getStageData, isStageType now used
- [x] **Add tests for timelock-simulation.ts** - 12 tests added
- [x] **Convert getStateStyle switch to lookup** - Already uses STATE_STYLE_MAP
- [x] **Add early exit in delegate batch processing** - Already has break statement and while condition check
- [x] **Add tests for debug.ts** - 10 tests added for debug utilities
- [x] **Use regex for error message detection** - Premature optimization; current .includes() is readable and error handling is infrequent
- [x] **Extract AddressView component** - Not needed; address rendering needs differ per component; no real duplication
- [x] **Extract contract cache factory** - Not needed; function is specific to OZGovernor_ABI and only used in one file
- [x] **Extract async hook pattern** - Standard React pattern; abstraction would add complexity without benefit
- [x] **Extract cancellation pattern** - Idiomatic React pattern for async cleanup; abstraction unnecessary
- [x] **Use addressesEqual() consistently** - Checked; toLowerCase() comparisons are for hex strings (operation IDs), not addresses
- [x] **Update CLAUDE.md documentation** - Removed non-existent files, fixed outdated architecture descriptions, updated gov-tracker version
- [x] **Add tests for use-local-storage hook** - 25 tests added covering localStorage logic, serialization, event handling
- [x] **VoteDistributionBar components analysis** - Kept separate; different visual purposes (expanded vs compact), duplication is acceptable

---

## Notes

- Cache versioning is properly implemented (CACHE_VERSION = 4)
- No actual legacy code or deprecated APIs found
- Test coverage improved significantly
- Codebase is generally well-structured, issues are localized optimizations
