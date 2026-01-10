# TODO: Complete Integration of gov-tracker 0.2.1 Bundled Cache

## Current Status

- ✅ Bumped gov-tracker to 0.2.1
- ✅ Removed old SKIP_PRELOAD_CACHE setting
- ✅ Simplified proposal-cache.ts to remove preload logic
- ✅ Tests passing

## Remaining Work

### 1. Import and use bundled cache (Browser Environment)

Gov-tracker 0.2.1 includes a bundled cache at `node_modules/@gzeoneth/gov-tracker/dist/data/bundled-cache.json`.

For browser usage:

```typescript
// In a new file: lib/bundled-cache-loader.ts
import bundledCache from "@gzeoneth/gov-tracker/dist/data/bundled-cache.json";

export async function initializeBundledCache(cache: CacheAdapter) {
  // Check if cache is already initialized
  const keys = await cache.keys();
  if (keys.length > 0) {
    return; // Already initialized
  }

  // Copy checkpoints from bundled cache to localStorage
  for (const [key, checkpoint] of Object.entries(bundledCache)) {
    await cache.set(key, checkpoint);
  }

  console.log(
    `Initialized cache with ${Object.keys(bundledCache).length} checkpoints`
  );
}
```

Call this in use-proposal-stages before creating the tracker.

### 2. Clean up stages-cache.ts

Remove seedStagesFromProposal and related preload functions that are no longer needed.
The bundled cache from gov-tracker replaces this functionality.

### 3. Remove old cache files

Delete:

- `data/proposal-cache.json`
- `data/timelock-operations-cache.json`

### 4. Update build script

The `scripts/build-proposal-cache.ts` should be updated to use gov-tracker's CLI to build the bundled cache:

```bash
yarn monitor run --cache data/bundled-cache.json
```

Or keep it for building the old format if needed for backwards compatibility during migration.

### 5. Test the changes

- Run the app and verify proposals load correctly
- Check browser DevTools localStorage to confirm checkpoints are being loaded
- Test stage tracking with Playwright

## Notes

- The bundled cache contains ~2.4MB of pre-built TrackingCheckpoints
- This eliminates the need for initial RPC discovery calls
- Gov-tracker automatically uses cached checkpoints for zero-RPC resume
