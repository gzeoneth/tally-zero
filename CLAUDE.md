# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important

- Test any changes with playwright mcp to make sure the UI still works properly
- Use 192.168.1.23 instead of localhost to workaround CORS
- Use L1 RPC "https://rpc-eth.clo.me", but never commit it to the repo
- Use Arb1 RPC "https://arb-mainnet.g.alchemy.com/v2/l746UHe9y7wVAC3QsK87txExBwv6EC28", but never commit it to the repo
- Make incremental commit like a staff engineer
- It is ok to make bigger refactoring and do not be afraid of big undertaking
- No need to consider backward compatability, it is ok to make breaking changes.

## Project Overview

TallyZero is a decentralized voting platform for Arbitrum DAO governance. It allows users to view and interact with proposals from both the Core Governor (constitutional proposals, 4.5% quorum) and Treasury Governor (funding proposals, 3% quorum) without relying on centralized services.

## Common Commands

```bash
# Development
yarn dev              # Start development server (port 3000)
yarn build            # Build for production (static export)
yarn start            # Serve built output from /out

# Code Quality
yarn lint             # Run ESLint with auto-fix
yarn test             # Run lint, TypeScript check, and Vitest tests
vitest run <file>     # Run a single test file (e.g., vitest run lib/utils.test.ts)
tsc                   # TypeScript type checking (no emit)

# Delegate Cache (provided by gov-tracker SDK)
yarn cache:build:delegates       # Rebuild via gov-tracker CLI
yarn cache:build:delegates:force # Force full rebuild
```

## Environment Setup

Create `.env.local` with:

```
NEXT_PUBLIC_WEB3STORAGE_PROJECT_ID=<your-walletconnect-project-id>
```

Get a project ID from [WalletConnect Cloud](https://cloud.walletconnect.com/).

For cache builds, optional environment variables:

```
RPC_URL=<arbitrum-rpc-url>       # Default: https://arb1.arbitrum.io/rpc
L1_RPC_URL=<ethereum-rpc-url>    # Default: https://1rpc.io/eth
START_BLOCK=<block-number>       # Override starting block
SKIP_STAGES=true                 # Skip lifecycle stage tracking
```

## Architecture

### App Structure (Next.js 14 App Router)

- `app/(marketing)/page.tsx` - Landing page
- `app/explore/page.tsx` - Main DAO exploration interface
- `app/layout.tsx` - Root layout with providers

### Component Organization

- `components/container/` - Feature containers (Search, VoteModel, SettingsSheet, RpcStatus)
- `components/form/` - Form components (VoteForm)
- `components/navigation/` - Layout components (MainNav)
- `components/proposal/` - Proposal components (ProposalStages, ProposalStagesError)
- `components/section/` - Marketing page sections
- `components/table/` - TanStack Table components (DataTable, ColumnsProposals, Toolbar)
- `components/ui/` - Shadcn UI primitives

### Core Data Flow

1. `useMultiGovernorSearch` hook orchestrates proposal fetching
2. Queries Core Governor and Treasury Governor for `ProposalCreated` events
3. Fetches proposal state, votes, and quorum from blockchain
4. `useProposalStages` tracks lifecycle stages (voting, timelock, execution) per proposal
5. Stage tracking uses gov-tracker package with bundled cache for instant resume
6. Stage data cached in localStorage with TTL-based expiration

### Lifecycle Stage Tracking

Proposals progress through these stages:

- **Core Governor**: Proposal Created → Voting Active → L2 Timelock Queued → L2 Timelock Executed → Outbox Entry Created → L1 Timelock Scheduled → L1 Challenge Period → L1 Timelock Executed → Retryable Tickets → L2 Final Execution
- **Treasury Governor**: Proposal Created → Voting Active → L2 Timelock Queued → L2 Timelock Executed (shorter path, no L1 round-trip)

### Key Files

**Config:**

- `config/arbitrum-governance.ts` - Governor addresses, timelocks, RPC URLs, quorum settings
- `config/block-times.ts` - Block times per chain for time calculations
- `config/storage-keys.ts` - LocalStorage key constants and cache TTL settings
- `config/schema.ts` - Zod schemas for forms and data validation
- `config/initial-state.ts` - Default app state

**Lib:**

- `lib/proposal-cache.ts` - Proposal cache loading, merging, and seeding
- `lib/proposal-tracker-manager.ts` - Concurrency management for stage tracking
- `lib/rpc-utils.ts` - RPC query helpers with retry, rate limiting
- `lib/lifecycle-utils.ts` - Timelock and L1/L2 message detection
- `lib/stage-tracker/` - Thin wrapper around `@gzeoneth/gov-tracker` package
- `lib/tenderly/` - Tenderly simulation integration for proposal execution previews
- `lib/governor-search/` - Governor proposal search utilities and caching

**Hooks:**

- `hooks/use-multi-governor-search.ts` - Multi-governor proposal search with caching
- `hooks/use-proposal-stages.tsx` - Lifecycle stage tracking for individual proposals
- `hooks/use-local-storage.ts` - Type-safe localStorage hook
- `hooks/use-rpc-health.ts` - RPC endpoint health monitoring

**Data:**

- `data/OzGovernor_ABI.json` - OpenZeppelin Governor ABI (used for both Core and Treasury Governors)
- `data/ArbitrumTimelock_ABI.json` - Timelock contract ABI
- `data/ERC20Votes_ABI.json` - ERC20Votes ABI for ARB token
- `data/delegate-cache.json` - Pre-built delegate cache (generated)
- `data/delegate-labels.json` - Human-readable labels for known delegates

**Scripts:**

- `scripts/build-delegate-cache.ts` - Delegate cache build script for ARB token delegates

### Path Aliases

```
@/* → ./*
@components/* → ./components/*
@hooks/* → ./hooks/*
@lib/* → ./lib/*
@config/* → ./config/*
@data/* → ./data/*
@types/* → ./types/*
@types → ./types
@context/* → ./context/*
```

### Types

- `types/proposal.d.ts` - ParsedProposal interface
- `types/proposal-stage.ts` - ProposalStage, StageType, StageStatus (re-exports from `@gzeoneth/gov-tracker`)
- `types/delegate.d.ts` - DelegateInfo, DelegateCache types
- `types/search.d.ts` - Search-related types (Address)
- `types/election.d.ts` - Security Council election types
- `types/feature.d.ts` - Feature flag types

## Key Technologies

- **Ethers.js v5** - Blockchain interaction
- **Wagmi v2 + Reown AppKit** - Wallet connection (formerly Web3Modal)
- **@arbitrum/sdk** - Arbitrum message and retryable ticket handling
- **@tanstack/react-query** - Data fetching and caching
- **TanStack Table** - Data tables with sorting/filtering
- **Radix UI + Shadcn** - Accessible UI components
- **Zod** - Runtime validation
- **@t3-oss/env-nextjs** - Type-safe environment variables

## Stage Tracking Cache System

Stage tracking uses the `@gzeoneth/gov-tracker` package which includes a bundled cache:

1. **Bundled Cache**: Gov-tracker 0.3.0-alpha includes pre-built TrackingCheckpoints (~2.4MB)
2. **Zero-RPC Resume**: Cached checkpoints enable instant resume without RPC calls
3. **localStorage Persistence**: Checkpoints are copied to localStorage on first run
4. **Skip Option**: Users can disable bundled cache via Settings → Skip Bundled Cache

The bundled cache loader (`lib/bundled-cache-loader.ts`) handles initialization on app start.

## Delegate Cache System

Delegate indexing, caching, and querying are handled by `@gzeoneth/gov-tracker`. TallyZero consumes the SDK's bundled cache and query functions; see `lib/delegate-cache.ts` for the thin local wrapper.

**What lives where:**

- **SDK** (`@gzeoneth/gov-tracker`): indexer (`buildDelegateCache`), bundled snapshot (`delegate-cache.json`), cache queries (`getTopDelegates`, `getDelegateRankInfo`, `filterDelegatesByMinPower`, `filterDelegatesByAddress`), live queries (`queryDelegatesNotVoted`, `queryDelegateVotingPowers`)
- **Local** (`lib/delegate-cache.ts`): browser-compatible cache loading, delegate label lookups (`data/delegate-labels.json`), UI-specific stats formatting (cache age)

**Cache storage strategy:**

- The **proposal cache** goes into localStorage via `LocalStorageCache` because stage tracking needs to persist checkpoints between sessions for incremental resume
- The **delegate cache** is loaded from the JS bundle via `require()` and is **not stored in localStorage** — it's a read-only snapshot with no incremental state, so loading from the bundle each time is sufficient
- This separation is intentional: the combined caches (~6MB) would exceed localStorage limits (~5-10MB) in most browsers

**Threshold:** Only delegates with ≥10 ARB voting power are included. The UI discloses this in the snapshot notice.

## Settings & LocalStorage

User preferences stored in localStorage with `tally-zero-` prefix:

- `tally-zero-l1-rpc` / `tally-zero-l2-rpc` - Custom RPC endpoints
- `tally-zero-block-range` / `tally-zero-l1-block-range` - Query chunk sizes
- `tally-zero-days-to-search` - How many days back to search
- `tally-zero-cache-ttl` - Stage cache TTL in seconds
- `tally-zero-nerd-mode` - Show technical details
- `tally-zero-debug-logging` - Enable verbose console logging (requires nerd mode)
- `tally-zero-skip-bundled-cache` - Bypass gov-tracker bundled cache
- `tally-zero-stages-{proposalId}` - Per-proposal stage cache

## Debug Logging

Uses the industry-standard [`debug`](https://www.npmjs.com/package/debug) package via `lib/debug.ts`:

- **Node.js**: Enable via `DEBUG=tally:*` environment variable
- **Browser**: Enable via Settings → Nerd Mode → Debug Logging toggle

```typescript
import { debug } from "@/lib/debug";

debug.stageTracker("Tracking proposal %s", proposalId);
debug.rpc("Fetching block %d", blockNumber);
debug.cache("Cache hit for %s", key);
debug.lifecycle("Timelock operation %s", operationId);
debug.calldata("Decoding calldata %s", signature);
debug.app("General info %O", data);
```

Enable specific namespaces:

```bash
DEBUG=tally:* yarn cache:build          # All namespaces
DEBUG=tally:rpc,tally:cache yarn dev    # Specific namespaces
DEBUG=tally:stage-tracker yarn dev      # Single namespace
```

Browser console: `TallyZeroDebug.enable()` / `TallyZeroDebug.disable()`

## Utility Libraries Reference

To avoid reinventing wheels, use these existing utilities:

### Address Utilities (`lib/address-utils.ts`)

```typescript
import {
  addressesEqual,
  findByAddress,
  formatAddress,
  isValidAddress,
} from "@/lib/address-utils";

addressesEqual("0xABC...", "0xabc..."); // Case-insensitive comparison
findByAddress(list, "0x..."); // Find item by address field
formatAddress("0x123...abc"); // "0x123...abc" (truncated)
isValidAddress("0x..."); // Validate Ethereum address
```

### RPC Utilities (`lib/rpc-utils.ts`)

```typescript
import {
  createRpcProvider,
  queryWithRetry,
  batchQueryWithRateLimit,
} from "@/lib/rpc-utils";

// Get or create cached provider instance
const provider = await createRpcProvider(rpcUrl);

// Retry with exponential backoff
const result = await queryWithRetry(() => provider.getBlockNumber());

// Batch queries with rate limiting
const results = await batchQueryWithRateLimit(queries, batchSize, delayMs);
```

### Storage Utilities (`lib/storage-utils.ts`)

```typescript
import {
  getStoredValue,
  setStoredValue,
  getStoredNumber,
  getStoredJsonString,
  getStoredCacheTtlMs,
} from "@/lib/storage-utils";

// Type-safe localStorage with defaults
const value = getStoredValue<MyType>(STORAGE_KEYS.KEY, defaultValue);
setStoredValue(STORAGE_KEYS.KEY, value);
const num = getStoredNumber(STORAGE_KEYS.KEY, defaultNum);
const str = getStoredJsonString(STORAGE_KEYS.KEY, defaultStr);
const ttlMs = getStoredCacheTtlMs();
```

### Format Utilities (`lib/format-utils.ts`)

```typescript
import {
  formatVotingPower,
  shortenAddress,
  formatCacheAge,
} from "@/lib/format-utils";

formatVotingPower("1000000000000000000"); // "1.00" (converts wei to token amount)
shortenAddress("0x1234567890abcdef..."); // "0x1234...cdef"
formatCacheAge(generatedAt); // "2d 5h" (human-readable age)
```

### Date Utilities (`lib/date-utils.ts`)

```typescript
import {
  formatDateShort,
  formatRelativeTimestamp,
  formatDateRange,
  formatEtaTimestamp,
  MS_PER_DAY,
  SECONDS_PER_HOUR,
} from "@/lib/date-utils";

formatDateShort(new Date()); // "Dec 30, 2025"
formatRelativeTimestamp(timestamp); // "3 days ago" (unix timestamp in seconds)
formatDateRange(minDate, maxDate); // "Dec 1 → Dec 15"
formatEtaTimestamp(eta); // "Dec 30, 2025 at 3:45 PM"
```

### Text Utilities (`lib/text-utils.ts`)

```typescript
import {
  truncateText,
  truncateMiddle,
  stripMarkdownAndHtml,
} from "@/lib/text-utils";

truncateText("Long text...", 50); // Truncate with ellipsis at end
truncateMiddle("0x123...abc", 10, 4); // "0x12...abc" (keep start and end)
stripMarkdownAndHtml(text); // Remove markdown and HTML tags
```

### Error Utilities (`lib/error-utils.ts`)

```typescript
import {
  getErrorMessage,
  toError,
  getSimulationErrorMessage,
} from "@/lib/error-utils";

getErrorMessage(error, "fetch data"); // User-friendly error message
toError(error); // Convert unknown to Error
getSimulationErrorMessage(error); // Format Tenderly simulation errors
```

### Delay Utilities (`lib/delay-utils.ts`)

```typescript
import { delay } from "@/lib/delay-utils";

await delay(1000); // Wait 1 second
```

### Collection Utilities (`lib/collection-utils.ts`)

```typescript
import {
  buildLookupMap,
  compareBigInt,
  compareBigIntDesc,
  sumBigInt,
} from "@/lib/collection-utils";

// Build a Map for O(1) lookups from an array
const usersById = buildLookupMap(users, (u) => u.id);
usersById.get(1); // O(1) lookup

// Compare BigInt strings for sorting
items.sort((a, b) => compareBigInt(a.value, b.value)); // Ascending
items.sort((a, b) => compareBigIntDesc(a.value, b.value)); // Descending

// Sum BigInt values
const total = sumBigInt(delegates, (d) => d.votingPower);
```

### Debug Logging (`lib/debug.ts`)

```typescript
import { debug, isDebugEnabled } from "@/lib/debug";
import createDebug from "debug";

debug.stageTracker("message %s", data); // Pre-defined namespaces
const log = createDebug("tally:custom"); // Custom namespace
if (isDebugEnabled()) {
  /* ... */
}
```

### Governor Utilities (`config/governors.ts`)

```typescript
import {
  isCoreGovernor,
  isTreasuryGovernor,
  getGovernorByAddress,
  getGovernorType,
  isArbitrumGovernor,
  GOVERNORS,
} from "@/config/governors";

isCoreGovernor(address); // Check if Core Governor
isTreasuryGovernor(address); // Check if Treasury Governor
isArbitrumGovernor(address); // Check if any Arbitrum governor
getGovernorByAddress(address); // Get governor config by address
getGovernorType(address); // Get "core" | "treasury" | undefined
GOVERNORS.core; // Access governor config directly
```

### Block Time Utilities (`config/block-times.ts`)

```typescript
import {
  getBlockTime,
  getBlocksPerDay,
  timeToBlocks,
  blocksToTime,
  BLOCKS_PER_DAY,
} from "@/config/block-times";

getBlockTime(42161); // 0.25 (seconds per block for Arbitrum)
getBlocksPerDay(42161); // 345600 (blocks per day for Arbitrum)
timeToBlocks(3600, 42161); // Convert 1 hour to blocks
blocksToTime(1000, 1); // Convert 1000 blocks to seconds (Ethereum)
BLOCKS_PER_DAY.arbitrum; // 345600
```

## Build Notes

- Static export (`output: "export"`) for IPFS/Fleek hosting
- Images unoptimized for static deployment
- Bundle analyzer available via `ANALYZE=true yarn build`
- Proposal cache should be rebuilt before deployment to include latest proposals
- Delegate cache should be rebuilt periodically to include latest delegation changes

## Arbitrum Governance System

This section provides a detailed explanation of how the Arbitrum DAO governance system works and how TallyZero tracks proposal lifecycles.

### Governance Overview

Arbitrum DAO uses a dual-governor system with two types of proposals:

| Governor              | Contract Address                             | Quorum | Proposals                                                         | L1 Round-Trip  |
| --------------------- | -------------------------------------------- | ------ | ----------------------------------------------------------------- | -------------- |
| **Core Governor**     | `0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9` | 4.5%   | Constitutional changes, chain upgrades, "chain owner" permissions | Yes (~37 days) |
| **Treasury Governor** | `0x789fC99093B09aD01C34DC7251D0C89ce743e5a4` | 3%     | Funding requests, non-constitutional changes                      | No (~27 days)  |

### Proposal Types

**Constitutional AIPs:**

- Modify the Arbitrum Constitution or AIP-1
- Install or modify chain software on any Arbitrum chain
- Take actions requiring "chain owner" permissions
- Require full L1 round-trip for security

**Non-Constitutional AIPs:**

- Treasury/funding requests
- Grants and ecosystem funding
- Procedural/guideline changes
- Execute entirely on L2 (shorter path)

### Proposal Lifecycle Stages

#### Stage 1: Proposal Created (`PROPOSAL_CREATED`)

- **Chain:** L2 (Arbitrum One)
- **What happens:** A proposer with ≥1,000,000 ARB voting power submits a proposal to the Governor contract
- **Tracked by:** `ProposalCreated` event from Governor contract
- **Data captured:** Proposal ID, proposer address, targets, values, calldatas, description

#### Stage 2: Voting Active (`VOTING_ACTIVE`)

- **Chain:** L2 (Arbitrum One)
- **Duration:** 14-16 days
- **What happens:** ARB token holders vote For, Against, or Abstain
- **Pass requirements:**
  - More votes For than Against
  - Quorum reached (For + Abstain ≥ quorum threshold)
- **Extension rule:** If quorum is reached in the final 2 days, voting extends by 2 days
- **Tracked by:** Governor contract `state()` function and `proposalVotes()`
- **States:** Pending (0), Active (1), Canceled (2), Defeated (3), Succeeded (4), Queued (5), Expired (6), Executed (7)

#### Stage 3: Queued in L2 Timelock (`PROPOSAL_QUEUED`)

- **Chain:** L2 (Arbitrum One)
- **What happens:** Successful proposal is queued in the L2 Timelock contract
- **Tracked by:** `ProposalQueued` event from Governor contract
- **Timelocks:**
  - Core Governor → `0x34d45e99f7D8c45ed05B5cA72D54bbD1fb3F98f0` (L2 Core Timelock)
  - Treasury Governor → `0xbFc1FECa8B09A5c5D3EFfE7429eBE24b9c09EF58` (L2 Treasury Timelock)

#### Stage 4: L2 Timelock Executed (`L2_TIMELOCK_EXECUTED`)

- **Chain:** L2 (Arbitrum One)
- **Duration:**
  - Core Governor: 8 days (security delay for constitutional changes)
  - Treasury Governor: 3 days (shorter delay for funding)
- **What happens:** After the timelock delay, the proposal can be executed on L2
- **Tracked by:** `CallExecuted` event from L2 Timelock contract
- **Operation ID:** Computed as `keccak256(abi.encode(targets, values, calldatas, predecessor, descriptionHash))`

**For Treasury Governor proposals, the lifecycle ends here after L2 execution.**

---

### Core Governor Extended Lifecycle (L1 Round-Trip)

Constitutional proposals require additional security through Ethereum L1 verification:

#### Stage 5: L2→L1 Message Sent (`L2_TO_L1_MESSAGE_SENT`)

- **Chain:** Cross-chain (L2 → L1)
- **What happens:** L2 Timelock execution triggers an Arbitrum outbox message to Ethereum
- **Tracked by:** `ChildToParentMessages` from the L2 execution transaction using `@arbitrum/sdk`

#### Stage 6: L2→L1 Message Confirmed (`L2_TO_L1_MESSAGE_CONFIRMED`)

- **Chain:** Cross-chain
- **Duration:** ~7 days (challenge period)
- **What happens:** The L2→L1 message must wait for the Arbitrum challenge period to complete
- **Challenge period:** 46,080 L1 blocks (~7 days at 12s/block)
- **Tracked by:** `ChildToParentMessageStatus` from `@arbitrum/sdk`:
  - `UNCONFIRMED` - Still in challenge period
  - `CONFIRMED` - Ready for L1 execution
  - `EXECUTED` - Already executed on L1

#### Stage 7: Queued in L1 Timelock (`L1_TIMELOCK_QUEUED`)

- **Chain:** L1 (Ethereum Mainnet)
- **What happens:** After challenge period, the message is executed to schedule the proposal in the L1 Timelock
- **L1 Timelock:** `0xE6841D92B0C345144506576eC13ECf5103aC7f49`
- **Tracked by:** `CallScheduled` event from L1 Timelock contract

#### Stage 8: L1 Timelock Executed (`L1_TIMELOCK_EXECUTED`)

- **Chain:** L1 (Ethereum Mainnet)
- **Duration:** 3 days
- **What happens:** After L1 timelock delay, the proposal executes on Ethereum
- **Tracked by:** `CallExecuted` event from L1 Timelock contract

#### Stage 9: Retryable Ticket Created (`RETRYABLE_CREATED`)

- **Chain:** Cross-chain (L1 → L2)
- **What happens:** If the proposal targets L2 contracts, L1 execution creates retryable tickets
- **Retryable tickets:** Arbitrum's mechanism for guaranteed L1→L2 message delivery
- **Target detection:** Checks `DelayedInbox` addresses to determine target chain:
  - Arb1 Inbox: `0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f`
  - Nova Inbox: `0xc4448b71118c9071Bcb9734A0EAc55D18A153949`
- **Tracked by:** `ParentToChildMessages` from `@arbitrum/sdk`

#### Stage 10: Retryable Redeemed (`RETRYABLE_REDEEMED`)

- **Chain:** L2 (Arbitrum One or Nova)
- **What happens:** Retryable tickets are auto-redeemed or manually redeemed on L2
- **Tracked by:** `ParentToChildMessageStatus`:
  - `NOT_YET_CREATED` - Waiting for L1 confirmation
  - `CREATION_FAILED` - Retryable creation failed
  - `FUNDS_DEPOSITED_ON_CHILD` - Created but not redeemed
  - `REDEEMED` - Successfully executed on L2

### Timeline Summary

```
Constitutional AIP (Core Governor) - ~37-44 days total:
├── Voting:                    14-16 days
├── L2 Timelock:               8 days
├── Challenge Period:          ~7 days
├── L1 Timelock:               3 days
└── Retryable Redemption:      ~minutes to hours

Non-Constitutional AIP (Treasury Governor) - ~17-19 days total:
├── Voting:                    14-16 days
└── L2 Timelock:               3 days
```

### Stage Tracking Implementation

TallyZero delegates proposal stage tracking to the `@gzeoneth/gov-tracker` package. The local wrapper in `lib/stage-tracker/index.ts` provides:

- `createProposalTracker()` - Creates tracker instances for proposals
- `toProposalTrackingResult()` - Converts gov-tracker results to local types

**Key tracking mechanisms (handled by gov-tracker):**

1. **Event Log Search:** Searches for contract events (`ProposalCreated`, `CallScheduled`, `CallExecuted`) in chunked block ranges to avoid RPC limits

2. **Arbitrum SDK Integration:** Uses `@arbitrum/sdk` for L2→L1 and L1→L2 message tracking

3. **Operation ID Computation:** Timelock operations are identified by hashing the proposal parameters

4. **Incremental Tracking:** The tracker can resume from any stage, preserving context across sessions

5. **Caching:** Stage data is cached in localStorage with TTL-based expiration

### Contract ABIs

The system uses these ABIs for event parsing and contract interaction:

- `data/OzGovernor_ABI.json` - Governor contract (proposals, voting, state)
- `data/ArbitrumTimelock_ABI.json` - Timelock contracts (scheduling, execution)
- `data/ERC20Votes_ABI.json` - ARB token (voting power, delegation)
