/**
 * Static import of bundled cache data from gov-tracker.
 * This file exists because dynamic imports of JSON from node_modules
 * don't work correctly in the browser at runtime.
 */

import bundledCacheJson from "@gzeoneth/gov-tracker/bundled-cache.json";

export const bundledCache: Record<string, unknown> = bundledCacheJson;
