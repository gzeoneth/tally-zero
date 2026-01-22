# TallyZero Refactoring Scratchpad

## Session: 2026-01-22

## Analysis Summary

Exploration completed. Codebase is mature with strong TypeScript discipline. No critical bugs found. Governance implementation verified against official Arbitrum docs - all correct.

---

## Completed Tasks

### [x] 1. Extract `useAbortSignal()` hook

**Commit:** 709a8ae

- Created `hooks/use-abort-signal.ts` with unified cancellation pattern
- Created `hooks/use-abort-signal.test.ts` with comprehensive tests

### [x] 2. Extract `useRpcProvider()` hook

**Commit:** 709a8ae

- Created `hooks/use-rpc-provider.ts` for RPC initialization
- Refactored `use-multi-governor-search.ts` to use new hook

### [x] 3. Consolidate votes formatting utility

**Commit:** 21adb31

- Added `formatVotes` to `lib/vote-utils.ts`
- Updated `use-proposal-by-id.ts` to use shared utility
- Added tests for formatVotes

### [x] 4. Remove unused \_governorAddress parameter

**Commit:** 96d9e33

- Removed unused parameter from `isProposalFullyExecuted()`
- Updated call sites in `getEffectiveDisplayState()`

### [x] 5. Simplify storage-utils try-catch pattern

**Commit:** 6cb4c17

- Refactored `getStoredJsonString` and `getStoredNumber` to use `getStoredValue`
- Reduced code duplication from 20 lines

### [x] 6. Use buildLookupMap consistently

**Commit:** 7e6502c

- Updated `use-multi-governor-search.ts`, `rpc-health.ts`, `bundled-cache-loader.ts`
- Replaced manual `new Map(...map())` with utility function

### [x] 7. Extract `withTimeout` utility

**Commit:** aa33e0b

- Created `withTimeout` helper in `lib/delay-utils.ts`
- Refactored `lib/rpc-health.ts` to use helper (consolidated 3 instances)
- Added 6 tests for withTimeout

### [x] 8. Split TimelockOperationContent component

**Commit:** d5b7cbd

- Extracted `TimelockStagesList` to `components/container/timelock/TimelockStagesList.tsx`
- Main file reduced from 624 to 419 lines
- Better separation of concerns

### [x] 9. Externalize election phase mapping

**Commit:** c5f8701

- Moved `PHASE_TO_STAGE_TYPES` to `config/security-council.ts`
- Centralized election configuration

---

## Skipped Tasks (with reasoning)

### [~] Extract quorum fetch utility

**Reason:** Minor duplication (6 lines) - extraction would add unnecessary indirection

### [~] Optimize vote update O(n) to O(1)

**Reason:** Current O(n) is fine - updates are infrequent, proposal counts <100

### [~] Document proposal-tracker-manager queue logic

**Reason:** Already well-documented with clear comments and type definitions

### [~] Add contract caching to hooks

**Reason:** Hooks handle single operations - caching only benefits batch operations

### [~] Simplify use-election-status with useReducer

**Reason:** Complexity comes from async orchestration (caching, race conditions), not state transitions. useReducer would add boilerplate without meaningful simplification.

---

## Verification Notes

### Governance Implementation ✓

- All contract addresses match official Arbitrum docs
- Quorum thresholds correct (4.5% Core, 3% Treasury)
- Timelock delays correct (8d L2 Core, 3d L2 Treasury, 3d L1)
- Proposal lifecycle stages accurate

### Code Quality ✓

- Zero `@ts-ignore`, `@ts-expect-error`, or `as any`
- All setInterval/setTimeout have proper cleanup
- No empty catch blocks swallowing errors
- Strong test coverage (44 test files, 772 tests)
