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
