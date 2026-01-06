# Using gov-tracker Calldata Decoding and Simulation

This document describes how to use the calldata decoding and simulation features powered by @gzeoneth/gov-tracker@0.1.1-0.

## Calldata Decoding

The calldata decoding uses gov-tracker directly as a first-class dependency:

```typescript
import { decodeCalldata } from "@lib/calldata";

// Decode calldata (gov-tracker API)
const decoded = await decodeCalldata(
  "0x...", // calldata hex string
  "0x...", // target address (optional)
  0, // depth (optional, default 0)
  "arb1" // chain context (optional, default "arb1")
);

// Access decoded information
console.log(decoded.functionName); // e.g., "scheduleBatch"
console.log(decoded.parameters); // Array of parameters with types and values

// Parameters include:
// - value: decoded value
// - type: solidity type
// - name: parameter name
// - addressLabel: known address label (e.g., "L1 Timelock") - computed by gov-tracker
// - nested: nested decoded calldata (for bytes)
// - nestedArray: array of nested decoded calldata (for bytes[])
```

### UI-Specific Fields

The UI components compute explorer links and chain labels on-the-fly when rendering:

```typescript
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { getChainLabel } from "@lib/calldata";

// When rendering address parameters
const link = getAddressExplorerUrl(param.value, chainContext);
const chainLabel = getChainLabel(chainContext);
```

## Tenderly Simulation

### Using the gov-tracker-based API

Automatically extract and execute all simulatable calls from decoded calldata:

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

## Benefits of gov-tracker Integration

1. **First-Class Integration**: gov-tracker is the primary implementation, not a wrapper or afterthought
2. **No Compatibility Layer**: Types and APIs are used directly from gov-tracker
3. **Better Coverage**: gov-tracker includes more function signatures and better handling of edge cases
4. **Simulation Extraction**: Automatically identifies all simulatable calls in complex governance proposals
5. **Storage Overrides**: Timelock simulations include proper storage overrides for Tenderly
6. **Type Safety**: Direct use of gov-tracker TypeScript types

## Architecture

- **lib/calldata/index.ts**: Direct re-exports from gov-tracker
- **lib/tenderly/gov-tracker-simulation.ts**: Uses gov-tracker's `extractAllSimulationsFromDecoded`
- **UI Components**: Compute display fields (link, chainLabel) on-the-fly when rendering

## Migration Notes

### Removed

- **decoder-wrapper.ts**: Removed the compatibility wrapper that added UI-specific fields
- **EnrichedDecodedCalldata/EnrichedDecodedParameter**: UI-specific type extensions removed
- UI components now compute `link` and `chainLabel` on-the-fly when rendering

### Non-Breaking Changes

- The `decodeCalldata` function signature remains the same
- All other APIs remain backward compatible
- Existing simulation functions continue to work
