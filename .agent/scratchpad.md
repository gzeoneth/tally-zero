# TallyZero Refactoring Scratchpad

## Summary

Comprehensive codebase refactoring to improve code quality, reduce duplication, fix performance issues, and add missing tests.

---

## Tasks

### HIGH PRIORITY - Code Duplication

- [ ] **Extract contract cache factory** - `createContractCache()` in search-utils.ts should be shared utility
  - Move to lib/contract-utils.ts

### HIGH PRIORITY - Performance

(none remaining)

### MEDIUM PRIORITY - Code Duplication

- [ ] **Extract async hook pattern** - 20+ locations have identical `useState(false)/setIsLoading/setError` pattern

  - Consider useAsync or useQuery pattern

- [ ] **Extract cancellation pattern** - 3 locations duplicate `let cancelled = false` with cleanup

- [ ] **Use addressesEqual() consistently** - 3+ locations do inline `.toLowerCase()` comparison

### MEDIUM PRIORITY - Complexity Reduction

- [ ] **Simplify TimelockOperationContent** - 624 lines with 5+ useMemo blocks

  - Extract into sub-components: LoadingState, ErrorState, OperationSelector, OperationDetails

- [ ] **Consolidate boolean flags in use-timelock-operation** - 7 useState declarations
  - Merge isLoading, isParsing, isTracking into single status enum

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

---

## Notes

- Cache versioning is properly implemented (CACHE_VERSION = 4)
- No actual legacy code or deprecated APIs found
- Test coverage improved significantly
- Codebase is generally well-structured, issues are localized optimizations
