# EditHistory Contract (Current Implementation)

Purpose: canonical contract for any agent or automation that reads/writes row history.

## Scope

- Row-level history lives in the `EditHistory` column on data rows.
- Deleted rows are archived in the `EditHistory` tab (separate archive table).
- History generation is centralized in `docs/js/data_management/abstraction/database.js` and `docs/js/data_management/utils/metadata-utils.js`.

## Row EditHistory JSON Shape

Stored as a JSON string in `EditHistory`:

```json
{
  "h": [
    {
      "u": "dan",
      "t": 17309064000,
      "s": "web",
      "c": [{ "n": "QTY", "o": "5" }]
    }
  ]
}
```

Field contract:

- `h`: history array, newest first.
- `u`: user short name (email prefix before `@`).
- `t`: timestamp in deciseconds since epoch (`Math.floor(Date.now() / 100)`).
- `s`: source system (`web` or `cad`).
- `c`: changed fields array.
- `n`: changed column name.
- `o`: previous value (old value only; new value is already in current row).

## Write Rules (Required)

- Always parse existing `EditHistory`; never overwrite blindly.
- Append new entry by unshifting into `h` (newest first).
- Keep max 10 history entries.
- Diff ignores `edithistory`, `EditHistory`, and `AppData`.
- If no meaningful changes, do not append a new history entry.
- Preserve unknown root keys when possible.

Source rules:

- App/UI saves write `s: web`.
- External CAD automation must write `s: cad`.
- Reader normalization treats missing source as `web`.
- Reader normalization treats legacy `app` source as `web`.

## Archive Table (Deleted Rows)

When deletions are detected (identifier-based flows), rows are appended to tab `EditHistory` with:

- `SourceTable`
- `SourceTab`
- `RowIdentifier`
- `Username`
- `Timestamp` (deciseconds)
- `Operation` (`delete`)
- `RowData` (serialized original row)

## Current Save Paths

- Inventory saves: tracked with source-aware history (`web` from app calls).
- Packlist saves: tracked with source-aware history (`web` from app calls).
- Cache/user-data writes: use `skipMetadata: true`.

## Packlist CAD Warning Logic (Implemented)

Analysis key: `cadSourceAlert` in packlist item `AppData`.

Trigger condition:

- Most recent history entry source is `cad`, and
- There is any earlier normalized `web` entry.

Alert payload includes:

- `message`: `changed in cad by <user>`
- `previousWebSummary`: last web edit before leading CAD block
- `restoreChanges`: old-value changes collected from the contiguous leading CAD entries

Restore behavior in Packlist UI:

- Alert card is clickable.
- Modal shows: `Previously: <previousWebSummary>`.
- Restore button applies `restoreChanges` in order: `item[change.n] = change.o`.
- Restore button is disabled outside edit mode.

## Guidance for External Automation

To stay compatible:

1. Read row, parse `EditHistory` JSON.
2. Compute diffs against pre-write row values.
3. Create entry `{u,t,s,c}` with `s = cad` for CAD-origin writes.
4. Prepend entry to `h`, cap at 10, reserialize.
5. Write updated business fields and `EditHistory` together atomically when possible.

This is the authoritative behavior as of current code in:

- `docs/js/data_management/utils/metadata-utils.js`
- `docs/js/data_management/abstraction/database.js`
- `docs/js/data_management/api.js`
- `docs/js/application/components/content/PacklistTable.js`

---

## Appendix: Scheduled (Pending) Quantity Changes — Date-Based Inventory Queries

Inventory rows carry a `p` array inside their `EditHistory` value. These are future-dated quantity changes that have not yet been applied to the live row data. To query inventory as it will appear on any given date, a reader must apply all pending entries whose effective date falls on or before the query date.

### Pending Entry Shape

```json
{
  "u": "dan",
  "t": 17400000000,
  "d": 17380000000,
  "s": "restock",
  "c": [{ "n": "quantity", "ne": "+5" }]
}
```

Field contract:

- `u`: user short name (email prefix before `@`).
- `t`: **effective date** in deciseconds (start-of-day precision — compare dates only, ignore time-of-day).
- `d`: creation timestamp in deciseconds (when the entry was scheduled).
- `s`: note text (max 25 characters; NOT a source system flag — that differs from `h` entries).
- `c`: changed fields array.
- `n`: column name (uses the application field name, e.g. `"quantity"`).
- `ne`: new value descriptor — either an absolute value (`"10"`, `10`) or a numeric delta string (`"+5"`, `"-2"`). A delta string starts with `+` or `-` followed by a digit.

### Full EditHistory Shape (with pending entries)

```json
{
  "h": [ ... ],
  "p": [
    { "u": "dan", "t": 17400000000, "d": 17380000000, "s": "restock", "c": [{ "n": "quantity", "ne": "+5" }] }
  ]
}
```

### Algorithm: Project Inventory to a Reference Date

To compute what an inventory row's fields will be on a given reference date:

1. Read `edithistory` (or `EditHistory`) from the row and parse the JSON.
2. Normalize the reference date to start-of-day (midnight local time), expressed in deciseconds.
3. Filter `p` entries where `entry.t` (normalized to start-of-day deciseconds) `<=` reference cutoff. Date comparison is date-only — strip the time component from `entry.t` before comparing.
4. Sort the filtered entries ascending by `t`.
5. For each entry in order, apply each change in `entry.c`:
   - If `ne` is a string matching `/^[+\-]\d/`, treat it as a numeric delta: `newValue = parseFloat(currentValue) + parseFloat(ne)`.
   - Otherwise treat `ne` as an absolute replacement: `newValue = ne`.
6. The result is the projected row state on that date.

### Application Lifecycle

- When the application processes a date at or past today, it calls `checkAndApplyPendingChanges`, which applies due entries permanently: they are removed from `p` and prepended to `h` (capped at 10). After this, the live row data reflects those changes.
- Before that permanent apply, the `p` entries are the only source of truth for future state — live row values do not include them.
- Entries in `p` have no cap on array length; they accumulate until applied or deleted.

### Column Name Mapping

The `n` field in `c` uses the application's mapped field names. The canonical mapping for inventory:

| Sheet column header | Application field name (`n`) |
| ------------------- | ---------------------------- |
| `Item Number`       | `itemNumber`                 |
| `QTY`               | `quantity`                   |
| `Description`       | `description`                |
| `Category`          | `category`                   |

Other fields follow the same pattern (camelCase of the header), but `quantity` is the field most commonly targeted by pending entries.
