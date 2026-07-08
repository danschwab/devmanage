# Memory Optimization Analysis

*(Updated with detailed feasibility findings per follow-up questions)*

**Context:** App is running at >1000 MB memory. The primary suspects are the cache, reactive stores, and analysis pipeline. This document analyzes each memory source, lists conventional reduction strategies, evaluates each against this codebase's constraints, and ranks them by impact vs difficulty.

---

## Memory Sources (What's Actually Held in RAM)

### 1. `CacheManager.cache` (Map)
- Every wrapped API call stores its full result, keyed by namespace + method + serialized args.
- A single packlist tab result (e.g., "ATSC 2025 NAB") can be tens of KB of raw data.
- Multiple tabs open simultaneously multiply this: Inventory + several pack list tabs = several cached tables in parallel.
- `originalData` deep-clones the cache result into the store, so each table exists in **two copies** (cache + store).
- Dependency tracking (`CacheManager.dependencies`) is a separate Map of Sets, small but proportional to cache size.
- **TTL is 20 minutes.** Entries stay alive for a full 20 minutes after last fill, regardless of whether the page is still open.

### 2. `reactiveStoreRegistry` (Vue.reactive Map)
- Every `getReactiveStore()` call registers a store keyed by API call + args + analysis config.
- Each store holds:
  - `store.data[]` — full deep clone of the loaded data, with `AppData` objects added to every row and nested row.
  - `store.originalData[]` — second deep clone for dirty-checking (`isModified`).
  - Analysis results (`AppData.resultKey`) stored inline on every row object.
  - `_rowId` stable identifiers on every row and nested row.
- Stores are **never evicted** once registered. They persist for the entire session until `clearAllReactiveStores()` (logout).
- Multiple components opening the same data share a store (by key), so this is not multiplied by component count.

### 3. Analysis Pipeline (in-flight and results)
- `runConfiguredAnalysis()` processes all rows in batches of 10 with 50ms delays.
- All analysis results are stored inline on row objects in `store.data`. They are cleared on each reload but accumulate across all loaded rows.
- During analysis, batch promises and intermediate data are held in the PriorityQueue's in-flight structures.
- For a large inventory with many items, analysis results can substantially inflate each row object.

### 4. `undoRegistry` (referenced but not analyzed here)
- Undo snapshots are additional deep clones of data states. Each undo step is a full or diff snapshot. Not analyzed in depth here.

### 5. `autoSave` diff/backup structures
- Stored in user data (Google Sheets), not in browser memory. Minimal RAM impact.

---

## Conventional Reduction Strategies — Evaluated

### A. TTL-Based Cache Expiry (already partially implemented)

**What it is:** Cache entries expire after a set time (currently 20 min). Expired entries are silently deleted on next access.

**Current gap:** The 20-minute TTL only applies to the raw API response in `CacheManager.cache`. The reactive store holds its own deep copy independently and is **never expired**. A store loaded at startup will hold its data indefinitely, even if the cache has long since expired.

**Recommendation:** **Reduce default TTL** (e.g., 10 → 5 min) for lower-traffic data. For the reactive store itself, add a maximum idle time after which the store's `data` and `originalData` are cleared and `needsReload` is set. This gives back the RAM without losing the store's state structure.

**Difficulty:** Low for TTL reduction. Medium for store idle-eviction (need to ensure components handle `data = []` gracefully and reload on next mount).

---

### B. Evict Stores for Inactive Tabs/Views

**What it is:** When a user navigates away from a pack list or inventory view, release the store's `data` and `originalData` arrays, keeping only the store key registered. Data reloads on next navigation.

**Current gap:** All stores remain fully populated regardless of whether the component is mounted.

**Fits the codebase:** Each content component (e.g., `PacklistTable.js`, `InventoryTable.js`) already calls `getReactiveStore()`. These components could call a `store.evict()` method in their `beforeUnmount` lifecycle hook — only if `!store.isModified` (don't evict unsaved work).

**Memory impact:** High. A fully loaded packlist with analysis data can be several MB per tab. Evicting unvisited tabs would be the single largest memory win.

**Difficulty:** Medium. Requires:
1. Adding `evict()` to the store: clear `data`, `originalData`, set `needsReload = true`.
2. Adding `beforeUnmount` hooks to content components.
3. Ensuring the reactive template handles empty data state without errors (likely already does since initial load starts empty).

---

### C. Drop Analysis Results from Memory (Recompute on Demand)

**What it is:** Analysis results stored inline in `AppData` are the most inflated part of each row. They can be recomputed from the base row data. Rather than keeping them on every row indefinitely, clear them from rows that scroll out of view (virtual list) or from the entire store when it's inactive.

**Current architecture note:** Analysis results are already cleared on every `setData()` call and recomputed. They are ephemeral by design. The problem is they accumulate on ALL rows simultaneously and stay there until the next full reload.

**Option 1 — Virtualized rows:** Only compute and hold analysis for the rows currently rendered in the viewport. This requires a virtual scrolling list (significant UI change).

**Option 2 — Evict AppData on store eviction:** When a store is evicted (Strategy B above), `AppData` is already gone since the rows are cleared. So Strategy B covers this automatically.

**Option 3 — Progressive purge:** After a configurable idle period, walk the store and delete `AppData` from rows that haven't been rendered recently. Too complex for the value it provides.

**Recommendation:** Strategy B covers this. Don't add separate AppData eviction.

**Difficulty for virtual list:** High. Requires replacing the current `v-for` table rendering with a virtual scrolling component.

---

### D. Deduplicate `data` and `originalData`

**What it is:** Currently both `data` and `originalData` are full independent deep clones of the same dataset. `originalData` is used only for dirty checking (`isModified`). Instead of a full clone, store a compact hash or a structural diff.

**Current gap:** For a 500-row inventory table, this is 2× the per-row memory. Both are full Vue reactive objects.

**Approach:** On load, compute a hash of the loaded data (e.g., JSON stringify → hash string) and store that instead of the full clone. `isModified` compares current data hash against original hash. This eliminates `originalData` entirely.

**Trade-off:** Hash comparison is slightly less transparent for debugging. Diff-based undo tracking (undoRegistry) currently compares against `originalData` directly — this would need adjustment.

**Difficulty:** Medium. `originalData` is read in several places (`isModified`, `setOriginalData`, save flow). Would need a careful replacement. The existing diff system for autosave already computes diffs from `originalData`, so the interaction needs analysis.

---

### E. Reduce Cache Entry Size (Strip Redundant Fields)

**What it is:** Cache stores the raw Google Sheets API response. Some rows may contain fields that are never used by the app (empty string fields, legacy columns). Stripping unused fields before caching reduces per-entry size.

**Applicability:** Low-impact unless specific tables are known to have many empty columns. Hard to generalize safely without risking dropped data. **Not recommended** — the cost of maintenance outweighs the gain.

---

### F. Limit Concurrent Stores in Registry

**What it is:** Enforce a maximum number of simultaneously populated stores in `reactiveStoreRegistry`. When a new store is loaded that would exceed the limit, evict the least recently used populated store (LRU eviction).

**Applicability:** Works well if users typically navigate between a small number of views. A user with 10 browser tabs open would be the problem case.

**Difficulty:** Medium. Requires tracking last-access time per store and implementing LRU eviction. Similar to Strategy B but automatic rather than lifecycle-driven.

---

### G. Lazy Analysis (Don't Run Until User Scrolls to Rows)

**What it is:** Skip analysis for rows that are not visible. Run analysis in small batches as the user scrolls into new rows.

**Current architecture:** Analysis already runs in batches of 10 with 50ms delays, but for all rows, not just visible ones.

**Applicability:** Very effective for large tables (>100 rows). Requires knowing which rows are visible (intersection observer or virtual list).

**Difficulty:** High for full implementation. Medium for a simpler approach: run analysis only for the first N rows on load, then extend as the user scrolls to the bottom.

---

### H. Remove `pendingCalls` Accumulation

**What it is:** `CacheManager.pendingCalls` is cleaned up in the `finally` block of each call. However, if calls throw unexpectedly before `finally`, entries could leak. This is a minor issue, not the main memory source.

**Assessment:** Already handled correctly via `finally`. Not a meaningful contributor to 1000 MB usage. No action needed.

---

## Rankings: Top Recommendations

| # | Strategy | RAM Impact | Implementation Difficulty | Notes |
|---|----------|-----------|--------------------------|-------|
| **1** | **Store eviction on navigate-away** (B) | **High** | Medium | Single largest win. Frees store `data` + `originalData` for inactive views. Already gracefully handles empty state on remount. |
| **2** | **Replace `originalData` with hash** (D) | **High** | Medium | Eliminates the entire second copy of every loaded dataset. Careful interaction with undo/diff system. |
| **3** | **Reduce cache TTL for low-traffic entries** (A) | Medium | Low | Quick win. Reducing 20 min → 5 min means stale data is released faster. Pair with store eviction. |
| **4** | **LRU eviction cap on registry** (F) | Medium | Medium | Automatic safety net — ensures the app can't hold more than N full datasets simultaneously regardless of navigation pattern. |
| **5** | **Lazy analysis for first N rows** (G) | Low–Medium | Medium | Only relevant if tables are large (100+ rows). Reduces peak analysis-phase memory. |

---

## What NOT to Do

- **Virtual scrolling:** Very high effort, significant UI risk, only addresses analysis result memory which Strategy B already covers.
- **Strip cache fields:** Risky data loss, minimal gain.
- **Evict individual AppData fields on idle:** Too granular, covered by store eviction.

---

## Follow-Up Feasibility Findings

### Topic 1 — LRU Usage Tracking + Debounced Eviction for Reactive Stores

**The proposed design:** Track how often each store is accessed via `getReactiveStore()`, keep a last-access timestamp, and debounce an eviction sweep after any access that puts the total populated store count over a threshold.

**Feasibility: High for tracking, Medium for eviction.**

`getReactiveStore()` is the single point of entry for all store access — no component reaches the registry directly. Adding a `lastAccess` timestamp and an `accessCount` counter to each store entry costs one object property update per call and is zero-risk. The registry is already `Vue.reactive`, so we don't need new infrastructure.

The eviction decision is where care is needed:

- **What counts as "in use":** A component that has `this.myStore = getReactiveStore(...)` in `mounted()` or as a computed holds a live Vue reactive dependency on `store.data`. If data is evicted while the component is mounted, Vue immediately re-renders with empty data. This is acceptable *if* the component displays a loading state when `data.length === 0 && isLoading`, which the current templates do. But it would cause a jarring blank table flash for an active view the user is looking at.
- **Safe eviction criteria:** A store should only be evicted if: `!isModified && !isLoading && !isSaving && !isAnalyzing && lastAccess > threshold`. The `!isModified` guard is critical — it prevents loss of unsaved work.
- **"Last access" vs "component mounted":** The `lastAccess` timestamp is updated when `getReactiveStore()` is called, not on every Vue reactive read. This means a component that mounts once and stays mounted won't update `lastAccess` on its own — which is actually what you want. If nobody calls `getReactiveStore()` for a store for N minutes, it's a candidate for eviction.
- **The problem:** Components that are currently mounted and showing a store's data will have called `getReactiveStore()` once at mount. They won't call it again unless they unmount+remount. So `lastAccess` would always be near mount time, not near "last time user was looking at it." To be truly accurate, you'd need components to call a lightweight `touchStore(key)` when they become the active view (or use Vue's `onActivated` hook if keep-alive is ever added).

**Recommended minimal implementation:**
1. Add `lastAccess`, `accessCount` to each store entry in `getReactiveStore()`
2. After any access, run a debounced sweep (1–2 second delay) that finds stores where `lastAccess` is older than a threshold (e.g., 10 minutes) AND all safety guards pass
3. Evict by calling `store.evict()`: clear `data` and `originalData` in-place, set `needsReload = true`, leave all other state intact
4. For now, log evictions so usage patterns can be observed before committing to a threshold

This is safe to add without risk. The `accessCount` alone is immediately useful for informing what threshold to use.

---

### Topic 2 — `originalData` for Read-Only Stores

**Current state: `originalData` is ALWAYS allocated and populated, even for read-only stores.**

Confirmed read-only store calls (where `saveCall = null`):
- `InventoryOverviewTable.js`: `getReactiveStore(Requests.getAllInventoryData, null, ...)`
- `InventoryItemTimeline.js`: two stores — `getReactiveStore(Requests.getItemTimeline, null, ...)` and `getReactiveStore(Requests.getInventoryInfo, null, ...)`
- `InventoryItemReport.js`: `getReactiveStore(Requests.getMultipleShowsItemsSummary, null, ...)`
- `PacklistTable.js` (inventory picker modal): `getReactiveStore(Requests.getAllInventoryData, null, ...)`
- `filterComponents.js`: two stores — schedule and categories filter stores with `null` saveCall

Every one of these calls `this.setOriginalData(dataToSet)` during `load()`, producing a full deep clone of the loaded data with `AppData` initialized on every row. The `isModified` getter then runs on every reactive evaluation, executing `deepClone(this.data)` + `deepClone(this.originalData)` + `JSON.stringify` comparison — entirely wasted CPU and memory for data that can never be saved.

**Confirmed: `InventoryOverviewTable` (all inventory data with analysis) and `InventoryItemReport` (multi-show summary) are the largest read-only stores and currently waste 100% of their `originalData` allocation.**

**The fix is clean and low-risk:**

In `createReactiveStore`, check `saveCall` at store initialization time:
- If `saveCall === null`: skip `setOriginalData` in `load()`, initialize `originalData` as a non-reactive empty constant, and short-circuit `isModified` to always return `false`.
- The `save()` method already guards with `if (typeof saveCall !== 'function')` so no save path breaks.
- The `handleInvalidation()` method checks `isModified` before flagging conflicts — returning `false` always for read-only stores means they always reload immediately on external change, which is the correct behavior.

**One interaction to verify before implementing:** The `undoRegistry` uses `originalData` as a reference baseline. None of the identified read-only stores appear to use undo, but this should be confirmed before removing `originalData` from any specific store.

**Memory impact:** For `InventoryOverviewTable` (all inventory data), this is a complete elimination of one full deep clone of the largest dataset in the app — likely the second-highest single-item gain after store eviction.

---

### Topic 3 — TTL Reduction and Cache Invalidation Chain Safety

**The question:** Does reducing TTL free memory, and does it break the dependency/invalidation chain?

**TTL reduction does free memory. It does NOT break invalidation chains.**

Here is what actually happens when a cache entry expires (from `CacheManager.get()`):

```javascript
if (entry.expire && entry.expire < Date.now()) {
    CacheManager.cache.delete(key);  // ← only this
    return CacheManager.CACHE_MISS;
}
```

Only `CacheManager.cache.delete(key)` is called. `CacheManager.dependencies` is NOT touched. The dependency record — "api:getPackList(...) depends on database:getData(...)" — survives TTL expiry intact.

**What this means for the invalidation chain:**

When a mutation later calls `invalidate('database:getData:...')`:
1. The cascade walks `dependencies` to find who depends on that key
2. It finds `api:getPackList(...)` — even if the cache entry for it has already expired
3. `cache.delete('api:getPackList:...')` is called — a no-op since it's already gone
4. The CacheInvalidationBus event is emitted for `api:getPackList`
5. The reactive store's `handleInvalidation()` fires → full reload
6. `dependencies.delete('api:getPackList:...')` removes the stale record
7. On reload, fresh dependencies are re-registered

The chain is fully preserved. **The only behavioral difference between TTL expiry and no expiry is that TTL-expired data is not served from cache on the next access** — it forces a fresh fetch. This is strictly correct behavior.

**Dependency record "leak" after TTL:** If a cache entry expires and no subsequent mutation ever invalidates it, the dependency record stays in `CacheManager.dependencies` indefinitely. The record is a Set of strings (keys only, no data payloads), so the memory cost is negligible — a few hundred bytes at most per record. It will be cleaned up naturally the next time the dependency is invalidated or the user logs out.

**What TTL reduction does NOT help:** Reactive store `data` and `originalData` arrays. These are independent of the cache TTL. Reducing TTL frees the raw API response from `CacheManager.cache` but the stores hold their own copies until reloaded or evicted. So TTL reduction is a partial win — it reduces the cache layer's footprint but not the store layer's.

**Recommendation:** Reducing the default TTL from 20 min to 5–8 min is safe. Worth doing but should be paired with store eviction (Topic 1) for meaningful total impact.

---

### Topic 4 — Infinite Cache LRU Under Memory Pressure

**What infinite caches hold:** Lock info (`getInventoryLock`, `getPacklistLock`), thumbnails/image URLs, some metadata and index data. These are marked infinite because re-fetching is expensive (lock checks involve Sheets reads; thumbnails are large blobs loaded from Drive).

**Memory pressure detection in the browser:**

`performance.memory` (Chrome/Edge only) provides:
- `usedJSHeapSize` — current allocated heap
- `jsHeapSizeLimit` — maximum allowed heap (typically 2–4 GB on desktop)

This can serve as a pressure signal. `performance.memory` is not available in Firefox or Safari.

**Feasibility of usage-based eviction for infinite caches: Medium, with meaningful caveats.**

A viable design:
1. Track `lastHit` timestamp on each cache entry (one timestamp per entry in `CacheManager.set()` and `CacheManager.get()`)
2. Provide a `CacheManager.evictLRUInfinite(threshold)` function that finds infinite-cache entries (where `entry.expire === null`) sorted by `lastHit`, and evicts the least recently used ones until under threshold
3. Call this function only when `performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit > 0.80` (or similar heuristic), which would be checked periodically

**The key risk:** Evicting thumbnails means the next time those items are viewed, image loads are triggered across potentially dozens of items. On a slow connection this causes a visible performance hit. Lock info is less expensive to re-fetch but would cause brief flashes of "Unlocked" state for items that are actually locked.

**Only worth implementing as a last resort** after store eviction and `originalData` removal are in place — those two changes should substantially reduce the 1000 MB figure. If memory is still critical after those, infinite cache LRU gives a safety valve. The implementation should default to off and only activate above a clear threshold.

---

## Revised Suggested Implementation Order

1. **No-risk, immediate:** Add `lastAccess` and `accessCount` tracking to `getReactiveStore()`. Log eviction candidates — no eviction yet. Informs threshold decisions.
2. **High impact, low risk:** Skip `originalData` for stores with `null` saveCall. Short-circuit `isModified` to `false` for those stores. Confirm no read-only store uses the undo system first.
3. **Moderate impact, safe:** Reduce default TTL from 20 min to 5–8 min. No behavioral change in normal usage.
4. **High impact, medium complexity:** Implement `store.evict()` and the debounced LRU sweep using the access timestamps from step 1. Gate eviction on `!isModified && !isLoading && !isSaving && !isAnalyzing`. Log evictions initially.
5. **Only if needed after 1–4:** Add memory-pressure-based eviction of infinite caches using `performance.memory`. Treat as a Chrome-only backstop.
