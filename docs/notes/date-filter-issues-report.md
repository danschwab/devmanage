# Date Filter Issues Research Report

**Date:** 2026-06-17  
**Research Focus:** Non-standard date column filtering and abstraction layer date filter handling

---

## Issue 1: Date Display Card Shows Question Marks for Non-Standard Columns

### Location

- **File:** `filterComponents.js`
- **Component:** `ScheduleDateRangeCard`
- **Functions:** `computeDisplayDates()`, `resolveWindowDates()`

### Problem

The date range display card in the advanced filter button bar shows question marks (`?`) instead of actual dates when using non-standard date columns (anything other than 'Date').

### Root Cause

Both `computeDisplayDates()` and `resolveWindowDates()` functions are hardcoded to ONLY look for filters with `column === 'Date'`:

```javascript
// Line 1317-1324
function computeDisplayDates(dateFilters) {
  if (!dateFilters?.length) return { startDate: null, endDate: null };
  const afterFilter = dateFilters.find(
    (f) => f.type === "after" && f.column === "Date",
  );
  const beforeFilter = dateFilters.find(
    (f) => f.type === "before" && f.column === "Date",
  );
  return {
    startDate: offsetToISO(afterFilter?.value) ?? null,
    endDate: offsetToISO(beforeFilter?.value) ?? null,
  };
}

// Line 87-96
function resolveWindowDates(dateFilters) {
  if (!dateFilters?.length) return { startDate: null, endDate: null };
  const afterFilter = dateFilters.find(
    (f) => f.type === "after" && f.column === "Date",
  );
  const beforeFilter = dateFilters.find(
    (f) => f.type === "before" && f.column === "Date",
  );
  const toDateStr = (v) =>
    v != null && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
      ? v
      : null;
  return {
    startDate: toDateStr(afterFilter?.value) ?? null,
    endDate: toDateStr(beforeFilter?.value) ?? null,
  };
}
```

When filters use columns like 'Ship', 'S. Start', 'S. End', etc., these functions return `null` for both dates, causing the display to show `? → ?`.

### Fix Required

These functions need to:

1. Find the first `after` filter regardless of column
2. Find the first `before` filter regardless of column
3. Convert offset values to dates if necessary
4. Handle cases where the column value might need resolution (e.g., 'Ship' or 'Return' which are calculated fields)

---

## Issue 2: Abstraction Layer Breaks with Non-Standard Date Columns

### Location

- **File:** `production-utils.js`
- **Function:** `getOverlappingShows()`, specifically the `getRowDate()` helper (lines 74-93)

### Problem

When date filters specify a column other than 'Date', 'Ship', or 'Return', the filtering logic fails completely and returns NO results.

### Root Cause

The `getRowDate()` helper function only handles three specific columns:

```javascript
// Lines 74-93
const getRowDate = (row, column) => {
  if (column === "Ship") {
    return _calculateShipDate(row);
  } else if (column === "Return") {
    const ship = _calculateShipDate(row);
    return _calculateReturnDate(row, ship);
  } else if (column === "Date") {
    // Try to get date from S. Start field
    let showDate = parseDate(row["S. Start"], true, row.Year);

    // If date not available, try other date fields to infer it
    if (!showDate) {
      const ship = _calculateShipDate(row);
      if (ship) {
        // Typical show is ~7-14 days after ship
        showDate = new Date(ship.getTime() + 10 * 86400000);
      }
    }
    return showDate;
  }
  return null; // ⚠️ ANY OTHER COLUMN RETURNS NULL
};
```

When `getRowDate()` returns `null`, the filter check at line 164 fails:

```javascript
// Lines 162-165
const rowDate = getRowDate(row, filter.column);
if (!rowDate) {
  return false; // If we can't get the date, filter out the row
}
```

This causes ALL rows to be filtered out when using columns like:

- 'S. Start'
- 'S. End'
- 'Expected Return Date'
- Any other date column in the schedule

### Data Flow Analysis

**Entry Point: API Layer**

```javascript
// api.js, line 522
static async getProductionScheduleData(deps, parameters = null, filters = null) {
    return await deps.call(ProductionUtils.getOverlappingShows, parameters, filters);
}
```

**Processing: Production Utils Layer**

```javascript
// production-utils.js, line 51
static async getOverlappingShows(deps, parameters = null, searchParams = null) {
    // 1. Load all schedule data
    // 2. Apply text filters (searchParams)
    // 3. Apply date filters (parameters.dateFilters)
    // 4. Return filtered results
}
```

**Date Filter Structure:**

```javascript
{
  dateFilters: [
    { column: "S. Start", type: "after", value: "2026-06-01" },
    { column: "S. End", type: "before", value: "2026-12-31" },
  ];
}
```

### Existing Robust Year Boundary Logic

The codebase DOES have excellent year boundary handling in `_calculateShipDate()` and `_calculateReturnDate()` (lines 1080-1207):

**Ship Date Year Correction:**

```javascript
// If ship is after show start and both are in the same year,
// move ship to previous year (handles Dec ship for Jan show)
if (sStart && ship >= sStart) {
  const shipPrevYear = new Date(ship);
  shipPrevYear.setFullYear(ship.getFullYear() - 1);
  ship = shipPrevYear;
}
```

**Return Date Year Correction:**

```javascript
// If return is before dates, move return to next year
// (handles Jan return for Dec show)
if (sEnd && ret <= sEnd) {
  const retNextYear = new Date(ret);
  retNextYear.setFullYear(ret.getFullYear() + 1);
  ret = retNextYear;
}
```

This logic correctly handles year boundaries by:

1. Checking relationships between dates
2. Adjusting years when dates are out of logical order
3. Using the Year column as the baseline reference

### Fix Required

The `getRowDate()` function needs to be enhanced to:

1. **Handle all date columns generically** by parsing them with year context:

   ```javascript
   const getRowDate = (row, column) => {
     // Special handling for calculated fields
     if (column === "Ship") {
       return _calculateShipDate(row);
     } else if (column === "Return") {
       const ship = _calculateShipDate(row);
       return _calculateReturnDate(row, ship);
     } else if (column === "Date") {
       // ... existing Date logic ...
     }

     // NEW: Generic date column handling
     // Try to parse the column value directly with year context
     const rawValue = row[column];
     if (rawValue) {
       const parsedDate = parseDate(rawValue, true, row.Year);
       if (parsedDate) {
         return parsedDate;
       }
     }

     return null;
   };
   ```

2. **Leverage existing year boundary logic** by ensuring all date parsing uses the `parseDate()` function with the `useYear` parameter set to `true` and passing `row.Year`.

3. **Handle date-like column names** that contain date keywords (as identified by the `dateColumns` computed in the advanced filter):
   - All columns containing: 'date', 'start', 'end', 'ship', 'due', 'deadline', 'created', 'updated', 'modified', 's.', 'time'

---

## Places Where Date Filters Are Processed

### 1. **API Layer** (`api.js`)

- **Method:** `getProductionScheduleData(deps, parameters, filters)`
- **Line:** 522
- **Action:** Passes parameters directly to `ProductionUtils.getOverlappingShows`

### 2. **Production Utils** (`production-utils.js`)

- **Method:** `getOverlappingShows(deps, parameters, searchParams)`
- **Line:** 51
- **Action:** Main filtering logic, uses `getRowDate()` helper
- **Issue:** ✅ Has robust year handling in `_calculateShipDate()` and `_calculateReturnDate()`
- **Issue:** ❌ `getRowDate()` only handles 3 specific columns

### 3. **Schedule Filter Components** (`filterComponents.js`)

#### **ScheduleAdvancedFilter Component**

- **Lines:** 117-932
- **Methods:**
  - `syncWithURL()` - Loads filters from URL parameters
  - `saveFiltersToURL()` - Saves filters to URL
  - `emitSearchSelected()` - Emits filter data to parent
- **Creates filters with structure:**
  ```javascript
  {
      column: this.afterColumn,  // User-selected column
      value: this.afterValue,     // ISO date or offset number
      type: 'after'
  }
  ```

#### **ScheduleDateRangeCard Component**

- **Lines:** 1244-1316
- **Method:** `resolveFromParams()`
- **Issue:** ❌ Only displays dates for 'Date' column filters

#### **ScheduleFilterSelect Component**

- **Lines:** 1318-1665
- **Method:** `updateURLFromSearch(searchData)`
- **Action:** Converts search data to URL parameters

### 4. **Schedule Table** (`ScheduleTable.js`)

- **Method:** `recreateStore()`
- **Line:** 254
- **Action:** Creates reactive store with filter parameters
- **Flow:** `filter` prop → `getReactiveStore()` → `Requests.getProductionScheduleData()` → API

---

## Recommended Solution Path

### Phase 1: Fix Display Issue (Quick Win)

**File:** `filterComponents.js`

Update `computeDisplayDates()` to find ANY after/before filters:

```javascript
function computeDisplayDates(dateFilters) {
  if (!dateFilters?.length) return { startDate: null, endDate: null };
  const afterFilter = dateFilters.find((f) => f.type === "after");
  const beforeFilter = dateFilters.find((f) => f.type === "before");
  return {
    startDate: offsetToISO(afterFilter?.value) ?? null,
    endDate: offsetToISO(beforeFilter?.value) ?? null,
  };
}
```

Update `resolveWindowDates()` similarly:

```javascript
function resolveWindowDates(dateFilters) {
  if (!dateFilters?.length) return { startDate: null, endDate: null };
  const afterFilter = dateFilters.find((f) => f.type === "after");
  const beforeFilter = dateFilters.find((f) => f.type === "before");
  const toDateStr = (v) =>
    v != null && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
      ? v
      : null;
  return {
    startDate: toDateStr(afterFilter?.value) ?? null,
    endDate: toDateStr(beforeFilter?.value) ?? null,
  };
}
```

### Phase 2: Fix Filtering Logic (Critical)

**File:** `production-utils.js`

Enhance `getRowDate()` to handle all date columns:

```javascript
const getRowDate = (row, column) => {
  // Special handling for calculated/derived columns
  if (column === "Ship") {
    return _calculateShipDate(row);
  } else if (column === "Return") {
    const ship = _calculateShipDate(row);
    return _calculateReturnDate(row, ship);
  } else if (column === "Date") {
    // Try to get date from S. Start field
    let showDate = parseDate(row["S. Start"], true, row.Year);

    // If date not available, try other date fields to infer it
    if (!showDate) {
      const ship = _calculateShipDate(row);
      if (ship) {
        // Typical show is ~7-14 days after ship
        showDate = new Date(ship.getTime() + 10 * 86400000);
      }
    }
    return showDate;
  }

  // Generic date column handling - try to parse with year context
  const rawValue = row[column];
  if (rawValue) {
    // parseDate() with useYear=true already handles year boundaries
    const parsedDate = parseDate(rawValue, true, row.Year);
    if (parsedDate) {
      return parsedDate;
    }
  }

  return null;
};
```

This leverages the existing year boundary logic in `parseDate()` which:

- Uses the Year column as the baseline
- Handles cross-year dates correctly
- Already has the robust logic for Dec/Jan boundaries

---

## Testing Scenarios

### Test Case 1: Filter by S. Start

- **Setup:** Create filter with `column: 'S. Start'`, `type: 'after'`, `value: '2026-06-01'`
- **Expected:** Should return all shows with S. Start >= June 1, 2026
- **Current:** Returns no results (broken)

### Test Case 2: Filter by Ship Date with Year Boundary

- **Setup:** Show with Year=2026, Ship date "12/20" (December 2025), S. Start "01/15" (January 2026)
- **Expected:** Ship date correctly interpreted as Dec 2025
- **Current:** Works correctly (uses `_calculateShipDate()` logic)

### Test Case 3: Display Non-Standard Column Date Range

- **Setup:** Filter with `column: 'S. End'`, dates between Jan-Jun 2026
- **Expected:** Display should show "01/01/2026 → 06/30/2026"
- **Current:** Display shows "? → ?" (broken)

### Test Case 4: Multiple Date Columns

- **Setup:** After filter on 'S. Start', Before filter on 'S. End'
- **Expected:** Should filter by show start and end dates
- **Current:** Partially broken (depends on whether columns are handled)

---

## Dependencies

All fixes rely on existing utilities:

- `parseDate()` - Already has year boundary logic
- `toISODateString()` - Date to ISO conversion
- `toUSDateString()` - Date to US format conversion
- `offsetToISO()` - Offset number to ISO date

No new dependencies required.
