# Inventory Pending Changes — Implementation Plan

## EditHistory Column Contract Additions

Extends the existing `EditHistory` JSON with a `p` (pending) array alongside `h` (history). Same entry shape; entries move verbatim from `p` → `h` on apply.

```json
{
  "h": [
    {
      "u": "dan",
      "t": 17330000000,
      "d": 17309064000,
      "s": "Reorder supplier",
      "c": [{ "n": "quantity", "o": "10" }]
    }
  ],
  "p": [
    {
      "u": "dan",
      "t": 17330000000,
      "d": 17309064000,
      "s": "Reorder supplier",
      "c": [{ "n": "quantity", "ne": "50" }]
    }
  ]
}
```

### Field Contract

| Field    | `p` meaning                                | `h` meaning after apply                           |
| -------- | ------------------------------------------ | ------------------------------------------------- |
| `u`      | user                                       | same                                              |
| `t`      | **effective date** (deciseconds)           | **change date in history**                        |
| `d`      | creation timestamp (deciseconds)           | preserved inert                                   |
| `s`      | note / description (≤25 chars)             | same                                              |
| `c[].n`  | field name                                 | same                                              |
| `c[].ne` | new value (absolute or delta, e.g. `"+1"`) | dropped on move to `h`                            |
| `c[].o`  | — not stored                               | **computed at apply time** from current row value |

### Delta Notation for Number Fields

`ne` values prefixed with `+` or `-` are treated as deltas applied to the current field value at apply time. All other `ne` values are absolute replacements. This allows multiple pending quantity changes to stack independently.

---

## Implementation Steps

### Step 1 — `metadata-utils.js`: New Helper Functions

- `createPendingEntry(username, changes, effectiveDate, note)` → returns `p` entry object
  - `t` = `effectiveDate` (deciseconds), `d` = `Date.now()/100`, `s` = note
  - `changes` is `[{ n, ne }]` — no `o`
- `appendToPendingChanges(edithistory, entry)` → returns updated JSON string
  - Parses existing `EditHistory`, pushes to `p` array (no max cap on `p`)
- `getPendingEntries(edithistory)` → returns `p` array or `[]`
- `_applyPendingChangesToData(items, referenceDateDeciseconds)` → pure, no I/O
  - For each item: parse `EditHistory`, find `p` entries where `t <= referenceDate`
  - Sort matching entries by `t` ascending (apply oldest first)
  - For each entry and each `c` change:
    - Read current field value as `o`
    - Apply delta or absolute `ne` to field
    - Build `h` entry: `{ u, t, d, s, c: [{ n, o }] }` (drop `ne`)
  - Unshift applied `h` entries into `h` array (max 10), remove from `p`
  - Returns `{ updatedItems, hasChanges }`

---

### Step 2 — `inventory-utils.js`: New and Modified Functions

**New uncached mutation:** `checkAndApplyPendingChanges(tabName)`

- `Database.getData(...)` to fetch rows
- Call `_applyPendingChangesToData(rows, today)`
- If `hasChanges`: `Database.setData(...)` once (uses existing identifier-based save)
- Returns `{ applied: boolean }`

**New cached read:** `getInventoryTabDataForDate(deps, tabName, referenceDate)`

- `deps.call(Database.getData, ...)` to fetch rows
- Call `_applyPendingChangesToData(rows, referenceDate)` — no save
- Returns projected rows

**New cached read:** `getInventoryRowsForPendingEntry(deps, tabName, effectiveDateDeciseconds)`

- Fetches tab, filters to rows with a matching `p` entry by `t` value
- Returns those rows (current field values, full `EditHistory` intact)

**New uncached mutation:** `savePendingChangeEntry(tabName, modifiedRows, effectiveDateDeciseconds)`

- Diffs modal original vs. edited values
- Updates matching `p` entry `c`, `t`, `s` fields in `EditHistory`
- Saves only `EditHistory` column changes

**Modified:** `saveInventoryTabData(mappedData, tabOrItemName, mapping, filters, username, options)`

- Add `options.scheduledDate` (ISO date string, required) and `options.note` (string ≤25 chars, required)
- If `scheduledDate === today`: normal save, `note` used as `s` in history entry
- If `scheduledDate > today`: compute diff, create pending entries, save rows with **original field values** but updated `EditHistory` only

Add uncached exclusions for `checkAndApplyPendingChanges` and `savePendingChangeEntry` in `wrapMethods` config.

---

### Step 3 — `api.js`: Expose New Functions

Add to exports and uncached exclusion list:

- `checkAndApplyPendingChanges`
- `getInventoryTabDataForDate`
- `getInventoryRowsForPendingEntry`
- `savePendingChangeEntry`

---

### Step 4 — `inventorySaveModal.js` (new file)

Component shown before any inventory save. Props: `onConfirm(scheduledDate, note)`.

- Date input: defaults to today, rejects past dates
- Note input: max 25 chars, required
- For `format: 'number'` columns: `+/-` toggle or accept signed input for delta entry
- Buttons: `Apply Now` (forces today) / `Schedule` (uses selected date) / `Cancel`

---

### Step 5 — `tableComponent.js`: `forceDetails` Prop

Add `forceDetails: Boolean, default: false` prop.

- When `true`: `details-row-container` rows render with `v-show="true"` unconditionally
- When `true`: hide `details-cell` toggle button column (`v-if="allowDetails && !forceDetails"`)

---

### Step 6 — `InventoryTable.js`: Save Modal + Pending Analysis

**Save intercept:** Before calling `inventoryTableStore.save()`, open `inventorySaveModal`. Pass `scheduledDate` and `note` to `Requests.saveInventoryTabData` via store save options.

**New analysis step** (add to `analysisConfig`):

```js
createAnalysisConfig(
  Requests.checkAndApplyPendingChanges,
  "pendingApplied",
  "Applying scheduled changes...",
  null,
  [tabTitle],
  null,
  false,
  Priority.ANALYSIS,
);
```

If `AppData.pendingApplied.applied === true`, call `invalidateCache` for the inventory tab to trigger reload.

**New analysis step** for displaying pending changes:

```js
createAnalysisConfig(
  Requests.getPendingChangesForItem, // parses EditHistory.p from item, returns p array
  "pendingChanges",
  "Checking pending changes...",
  "itemNumber",
  [],
  null,
  false,
  Priority.ANALYSIS,
);
```

**New column** in `columns` computed:

```js
{ key: 'pendingChanges', label: 'Pending Updates', details: true }
```

Slot renders each `p` entry as `field: currentValue → newValue  (effective: date)` with dirty-cell styling. Clicking opens `ChangeHistoryEntryModal`.

Pass `:forceDetails="allowEdit"` and `:allowDetails="true"` to `TableComponent`.

---

### Step 7 — `InventoryOverviewTable.js`: Pending Analysis Step

Add the same `pendingChanges` analysis step as Step 6. Add `pendingChanges` details column (read-only, no `forceDetails`).

---

### Step 8 — `changeHistoryEntryModal.js` (new file)

**Load:** dropdown of all unique `t` values (formatted as dates) + `s` notes found across all `p` entries in the current tab. Selecting an entry populates a reactive store via `Requests.getInventoryRowsForPendingEntry`.

**Analysis step on modal store:**

- For each loaded row, reads matching `p` entry
- Overwrites row field values with `ne` (applying delta to current value if `+/-`)
- `originalData` = current values, `data` = future values → standard dirty highlight shows current → pending

**Mini table:** Same columns as `InventoryTable`, editable. Editing modifies what future `ne` values will be.

**Save function:** `Requests.savePendingChangeEntry` — writes updated `p` entries back to `EditHistory`.

**Actions:**

- `Save Changes` — update `p` entry via `savePendingChangeEntry`
- `Apply Now` — call `checkAndApplyPendingChanges` with forced-today date, invalidate cache
- `Delete Entry` — remove from `p`, save `EditHistory`
- `Close`

---

## File Change Summary

| File                         | Type    | Changes                                                |
| ---------------------------- | ------- | ------------------------------------------------------ |
| `metadata-utils.js`          | modify  | +4 functions, +`_applyPendingChangesToData` helper     |
| `inventory-utils.js`         | modify  | +4 functions, modify `saveInventoryTabData`            |
| `api.js`                     | modify  | expose 4 new functions                                 |
| `tableComponent.js`          | modify  | add `forceDetails` prop (~15 lines)                    |
| `InventoryTable.js`          | modify  | save modal intercept, 2 analysis steps, details column |
| `InventoryOverviewTable.js`  | modify  | pending analysis step, details column                  |
| `inventorySaveModal.js`      | **new** | date + note + delta input modal                        |
| `changeHistoryEntryModal.js` | **new** | entry editor modal with mini reactive table            |
