# Using gov-tracker Calldata Decoding and Simulation

This document describes how to use the new calldata decoding and simulation features powered by @gzeoneth/gov-tracker@0.1.1-0.

## Calldata Decoding

The calldata decoding now uses gov-tracker's decoding engine with UI enhancements:

```typescript
import { decodeCalldata } from "@lib/calldata";

// Decode calldata (same API as before)
const decoded = await decodeCalldata(
  "0x...", // calldata hex string
  "0x...", // target address (optional)
  0, // depth (optional, default 0)
  "arb1" // chain context (optional, default "arb1")
);

// Access decoded information
console.log(decoded.functionName); // e.g., "scheduleBatch"
console.log(decoded.parameters); // Array of parameters with types and values

// Parameters now include:
// - value: decoded value
// - type: solidity type
// - name: parameter name
// - link: explorer link (for addresses)
// - chainLabel: chain label (for addresses)
// - addressLabel: known address label (e.g., "L1 Timelock")
// - nested: nested decoded calldata (for bytes)
// - nestedArray: array of nested decoded calldata (for bytes[])
```

## Tenderly Simulation

### Option 1: Using the new gov-tracker-based API

The new API automatically extracts all simulatable calls from decoded calldata:

```typescript
import { decodeCalldata } from "@lib/calldata";
import { simulateDecodedCalldata, getSimulationData } from "@lib/tenderly";

// Decode the calldata first
const decoded = await decodeCalldata(calldata, target, 0, "arb1");

// Option A: Execute simulations automatically
const results = await simulateDecodedCalldata(decoded, "arb1");
for (const { label, result } of results) {
  console.log(`${label}: ${result.link}`);
  console.log(`Success: ${result.success}`);
}

// Option B: Get simulation data without executing
const simulations = getSimulationData(decoded, "arb1");
for (const sim of simulations) {
  console.log(`Type: ${sim.simulation.type}`);
  console.log(`From: ${sim.simulation.from}`);
  console.log(`To: ${sim.simulation.to}`);
  console.log(`Input: ${sim.simulation.input}`);

  // For timelock simulations, storage overrides are included
  if (sim.simulation.type === "timelock") {
    console.log(`Storage override:`, sim.simulation.storageOverride.symbolic);
    console.log(`Operation ID:`, sim.simulation.operationId);
  }
}
```

### Option 2: Using the existing API (backward compatible)

The existing simulation functions are still available:

```typescript
import {
  simulateCall,
  simulateRetryableTicket,
  simulateTimelockBatch,
} from "@lib/tenderly";

// Simulate a generic call
await simulateCall({
  target: "0x...",
  calldata: "0x...",
  chain: "Arb1",
  value: "0",
});

// Simulate a retryable ticket (L1→L2 message)
await simulateRetryableTicket({
  l2Target: "0x...",
  l2Calldata: "0x...",
  l2Value: "0",
  chain: "arb1",
});

// Simulate a timelock batch operation
await simulateTimelockBatch({
  timelockAddress: "0x...",
  calldata: "0x...", // scheduleBatch calldata
  networkId: "42161",
});
```

## Benefits of gov-tracker Integration

1. **Shared Implementation**: Calldata decoding logic is now maintained in one place (gov-tracker)
2. **Better Coverage**: gov-tracker includes more function signatures and better handling of edge cases
3. **Simulation Extraction**: Automatically identifies all simulatable calls in complex governance proposals
4. **Storage Overrides**: Timelock simulations include proper storage overrides for Tenderly
5. **Type Safety**: Better TypeScript types for simulation data

## Migration Notes

### Breaking Changes

- **`formatDecodedValue` behavior**: The function now returns `"undefined"` (string) instead of `"null"` when the value is `undefined`. This is due to gov-tracker's implementation which uses `String(value)` for conversion. If your code depends on checking for the string `"null"`, you may need to update it to also check for `"undefined"`.

  ```typescript
  // Before (old behavior)
  if (formattedValue === "null") {
    /* ... */
  }

  // After (new behavior with gov-tracker)
  if (formattedValue === "null" || formattedValue === "undefined") {
    /* ... */
  }
  ```

### Non-Breaking Changes

- The `decodeCalldata` function has the same signature but now returns enriched data with `link` and `chainLabel` fields for address parameters
- All other APIs remain backward compatible
