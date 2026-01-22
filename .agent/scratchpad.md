# TallyZero Refactoring Scratchpad

## Summary

Comprehensive codebase refactoring to improve code quality, reduce duplication, fix performance issues, and add missing tests.

---

## Tasks

### HIGH PRIORITY - Code Duplication

- [ ] **Extract `useEffectiveRpcUrl` hook** - 5+ locations duplicate RPC URL fallback logic (`customRpcUrl || storedRpc || DEFAULT`)

  - Files: use-delegate-lookup.ts, use-delegate-search.ts, use-proposal-by-id.ts, use-timelock-operation.ts, use-top-delegates-not-voted.ts

- [ ] **Centralize RPC provider creation** - 4 locations create StaticJsonRpcProvider directly instead of using `createRpcProvider()`

  - Files: use-election-status.ts:129, use-timelock-operation.ts:135, stage-tracker/index.ts:46, ElectionPhaseTimeline.tsx:128

- [ ] **Extract contract cache factory** - `createContractCache()` in search-utils.ts should be shared utility

  - Move to lib/contract-utils.ts

- [ ] **Leverage existing `useRpcSettings` hook** - 4 locations duplicate localStorage RPC retrieval
  - Files: use-delegate-lookup.ts:76-79, use-delegate-search.ts:102-105, use-proposal-by-id.ts:56-59, use-timelock-operation.ts:94-100

### HIGH PRIORITY - Performance

- [ ] **Fix O(n) vote update handler** - use-multi-governor-search.ts:247-276 maps over all proposals on every vote update

  - Solution: Use Map-based lookup for O(1) proposal update

- [ ] **Add early exit in delegate batch processing** - use-top-delegates-not-voted.ts continues batching after finding required delegates

### MEDIUM PRIORITY - Code Duplication

- [ ] **Extract async hook pattern** - 20+ locations have identical `useState(false)/setIsLoading/setError` pattern

  - Consider useAsync or useQuery pattern

- [ ] **Extract cancellation pattern** - 3 locations duplicate `let cancelled = false` with cleanup

- [ ] **Use addressesEqual() consistently** - 3+ locations do inline `.toLowerCase()` comparison

### MEDIUM PRIORITY - Complexity Reduction

- [ ] **Simplify SettingsSheet state** - 14 useLocalStorage hooks with duplicate state mirroring

  - Create useFormSettings() hook

- [ ] **Simplify TimelockOperationContent** - 624 lines with 5+ useMemo blocks

  - Extract into sub-components: LoadingState, ErrorState, OperationSelector, OperationDetails

- [ ] **Consolidate boolean flags in use-timelock-operation** - 7 useState declarations
  - Merge isLoading, isParsing, isTracking into single status enum

### MEDIUM PRIORITY - Missing Tests

- [ ] **Add tests for collection-utils.ts** - buildLookupMap, compareBigInt, sumBigInt untested
- [ ] **Add tests for governor-search/search-utils.ts** - 296 lines, core search functionality untested
- [ ] **Add tests for debug.ts** - isDebugEnabled, enableDebugLogging untested

### LOW PRIORITY - Performance

- [ ] **Create single useBreakpoint hook** - DataTable.tsx has 5 separate media query listeners
- [ ] **Use regex for error message detection** - Multiple sequential .includes() checks in error-utils.ts

### LOW PRIORITY - Code Quality

- [ ] **Convert getStateStyle switch to lookup** - lifecycle-utils.ts has 18-case switch statement
- [ ] **Extract AddressView component** - DecodedCalldataView.tsx repeats address rendering logic

---

## Completed

(none yet)

---

## Notes

- Cache versioning is properly implemented (CACHE_VERSION = 4)
- No actual legacy code or deprecated APIs found
- Test coverage is 71% (25/35 lib files)
- Codebase is generally well-structured, issues are localized optimizations
