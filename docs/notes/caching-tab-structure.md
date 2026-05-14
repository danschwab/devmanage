# Caching Tab — Structure and Write Rules

## Tab location

Spreadsheet: `CACHE` (`window.SPREADSHEET_IDS.CACHE` or the sheet id: `1lq3caE7Vjzit38ilGd9gLQd9F7W3X3pNIGLzbOB45aw`)
Tab name: `Caching`

## Table layout

| A (Key)                                    | B (Timestamp)              |
| ------------------------------------------ | -------------------------- |
| `database:getData:"PACK_LISTS","NAB 2025"` | `2026-05-14T18:30:00.000Z` |
| `database:getData:"INVENTORY","Sheet1"`    | `2026-05-14T19:00:00.000Z` |

- **Row 1**: Headers — `Key`, `Timestamp`
- **Row 2+**: One row per cache prefix, no fixed order

## Key format

Keys are produced by serializing the first two call arguments with `JSON.stringify`, stripping the outer `[` and `]`, then prefixing with namespace and method name:

```js
const argsString = JSON.stringify([tableId, tabName]).replace(/^\[|\]$/g, '');
const key = `${namespace}:${methodName}:${argsString}`;
```

Only `database:getData` entries for non-`CACHE` tables are written here. The resulting format is:

```
database:getData:"TABLE_ID","TAB_NAME"
```

Because `JSON.stringify` double-quotes strings, the TABLE_ID and TAB_NAME are always wrapped in `"`. Example:

```
database:getData:"PACK_LISTS","NAB 2025"
```

### Valid TABLE_IDs

| TABLE_ID | Spreadsheet |
|---|---|
| `INVENTORY` | Inventory spreadsheet |
| `PACK_LISTS` | Pack lists spreadsheet |
| `PROD_SCHED` | Production schedule spreadsheet |

`CACHE` is explicitly excluded — no cache timestamps are written for CACHE table reads.

### TAB_NAME

The tab name is the exact Google Sheets tab title within the spreadsheet (e.g. `"NAB 2025"`, `"Sheet1"`). Tab names are case-sensitive and must match exactly as they appear in the sheet.

## Timestamp format

ISO 8601 string from `new Date().toISOString()`. Example: `2026-05-14T18:30:00.000Z`

## Row number arithmetic

`rawData` returned by `getSheetData` is a 2D array where index 0 is the header row.

- `rows = rawData.slice(1)` — 0-indexed array of data rows
- **Update existing row**: `sheetRow = rowIndex + 2` (+1 to convert to 1-indexed, +1 to skip header)
- **Append new row**: `newRowNumber = rows.length + 2` (next 0-indexed position is `rows.length`, same +2 offset)

## Write rules

**Sheet missing or empty** (`rawData` is null/empty):

```js
setSheetData(
  "CACHE",
  "Caching",
  [
    ["Key", "Timestamp"],
    [prefix, timestamp],
  ],
  null,
);
```

**Update existing key** (key found at `rowIndex` in `rows`):

```js
setSheetData(
  "CACHE",
  `Caching!B${rowIndex + 2}:B${rowIndex + 2}`,
  [[timestamp]],
  null,
);
```

Writes only column B — the key in column A is not touched.

**Append new key** (key not found):

```js
setSheetData(
  "CACHE",
  `Caching!A${rows.length + 2}:B${rows.length + 2}`,
  [[prefix, timestamp]],
  null,
);
```

Writes both columns A and B of the next empty row.

## Access method

All reads and writes use `GoogleSheetsService` directly (same pattern as the `Locks` tab). Do not route through the cache layer or `Database`.
