# MetaData System Implementation Documentation

**Date:** November 6, 2025  
**Implementation Phase:** Phase 1 - Core Infrastructure (Complete)

## Overview

The MetaData system has been implemented to track row changes, store modification history, and archive deleted rows across all spreadsheet tables. This system operates transparently at the Database layer, requiring no changes to UI components.

---

## Architecture

### Implementation Level: Database Layer (Recommended Option 1)

The implementation follows the recommended Database Layer approach, providing:
- **Single point of control** - All saves flow through Database.setData()
- **Automatic tracking** - Works for all tables without code changes
- **Transparent operation** - Upper layers unaware of metadata tracking
- **Consistent format** - Uniform metadata structure across all data types

---

## Components Implemented

### 1. MetaData Utilities (`data_management/utils/metadata-utils.js`)

Core utility class providing metadata operations:

**Key Methods:**
- `createMetaDataEntry(username, changes)` - Creates new metadata entry
- `appendToMetaData(existingMetaData, newEntry, maxHistory)` - Appends to history
- `calculateRowDiff(oldRow, newRow, ignoredColumns)` - Detects changes
- `calculateBatchDiff(originalRows, updatedRows)` - Batch change detection
- `detectDeletedRows(originalRows, updatedRows, identifierKey)` - Finds deleted rows
- `createArchiveEntry(...)` - Prepares row for archival
- `parseMetaData(metadata)` - Parses metadata from various formats
- `setCachedAnalytic(metadata, key, value)` - Stores cached analytics
- `setUserSetting(metadata, key, value)` - Stores user settings

### 2. Enhanced Database Layer (`abstraction/database.js`)

**Database.setData() Enhancements:**
- Accepts `options` parameter with:
  - `username` - User making the change
  - `skipMetadata` - Skip metadata generation (for special tables)
  - `identifierKey` - Key for row identification (e.g., 'itemNumber')
- Automatically fetches original data for comparison
- Calculates diffs and appends to metadata column
- Detects and archives deleted rows to MetaData table
- Graceful fallback if metadata operations fail

**Database.updateRow() Enhancements:**
- Accepts `options` parameter with username
- Calculates single-row diff
- Appends metadata for changed fields

**Private Helper Methods:**
- `_addMetadataToRows(originalRows, updatedRows, username, mapping)` - Adds metadata to changed rows
- `_archiveDeletedRows(sourceTable, sourceTab, deletedRows, username)` - Archives to MetaData table

### 3. Updated Abstraction Layer

**InventoryUtils.saveInventoryTabData():**
- Accepts `username` parameter
- Passes username to Database.setData() with `identifierKey: 'itemNumber'`
- Passes username to Database.updateRow() for filtered saves

**PackListUtils.savePackList():**
- Accepts `username` parameter
- Currently skips metadata (pack lists use special 2D array format)
- Tagged with comment for future enhancement

**ApplicationUtils.storeUserData():**
- Passes `skipMetadata: true` option (user data doesn't need tracking)

### 4. Updated API Layer (`data_management/api.js`)

**Changes:**
- Imports `authState` from auth utility
- Extracts username: `authState.user?.email || null`
- Passes username to abstraction layer methods:
  - `saveInventoryTabData()` - Passes username to InventoryUtils
  - `savePackList()` - Passes username to PackListUtils

---

## Data Structures

### MetaData Column Format

Stored as JSON string in the `MetaData` column of each table:

```json
{
  "history": [
    {
      "user": "dan@example.com",
      "timestamp": "2025-11-06T15:30:00Z",
      "changes": [
        { "column": "quantity", "old": "5", "new": "10" },
        { "column": "notes", "old": "", "new": "Updated for show" }
      ]
    },
    {
      "user": "jane@example.com",
      "timestamp": "2025-11-05T10:15:00Z",
      "changes": [
        { "column": "quantity", "old": "3", "new": "5" }
      ]
    }
  ],
  "cachedAnalytics": {
    "lastInventoryCheck": "2025-11-06T15:30:00Z",
    "alertsAcknowledged": ["low-quantity-2025-11-05"]
  },
  "userSettings": {
    "starred": true,
    "color": "yellow"
  }
}
```

**Features:**
- Most recent changes first (index 0)
- Maintains up to 10 history entries (configurable)
- Extensible with `cachedAnalytics` and `userSettings`

### MetaData Table Structure

Dedicated tab in each spreadsheet storing deleted rows:

| Column | Description | Example |
|--------|-------------|---------|
| SourceTable | Table identifier | "INVENTORY" |
| SourceTab | Tab name | "FURNITURE" |
| RowIdentifier | Row ID | "F-123" |
| Username | User who deleted | "dan@example.com" |
| Timestamp | Deletion time | "2025-11-06T15:30:00Z" |
| Operation | Action type | "delete" |
| RowData | Full row as JSON | {"itemNumber":"F-123", "quantity":"5", ...} |

---

## How It Works

### Save Flow with MetaData

1. **User Initiates Save** (e.g., clicks Save in InventoryTable)
2. **ReactiveStore.save()** strips AppData and target columns
3. **API.saveInventoryTabData()** gets username from authState
4. **InventoryUtils.saveInventoryTabData()** passes username with options
5. **Database.setData()** receives username and identifierKey
6. **Database Fetches Original Data** from Google Sheets for comparison
7. **Calculate Diffs** using MetaDataUtils.calculateRowDiff()
8. **Append Metadata** to changed rows using MetaDataUtils.appendToMetaData()
9. **Detect Deletions** using MetaDataUtils.detectDeletedRows()
10. **Archive Deleted Rows** to MetaData table
11. **Save Updated Data** to Google Sheets (includes metadata column)
12. **Invalidate Cache** triggers reactive store reload

### Example: Inventory Item Update

**Original Data:**
```javascript
{
  itemNumber: "F-123",
  quantity: "5",
  description: "Blue table",
  notes: "In good condition",
  metadata: ""
}
```

**User Changes quantity to "10" and notes to "Ready for show"**

**Saved Data:**
```javascript
{
  itemNumber: "F-123",
  quantity: "10",
  description: "Blue table",
  notes: "Ready for show",
  metadata: '{"history":[{"user":"dan@example.com","timestamp":"2025-11-06T15:30:00Z","changes":[{"column":"quantity","old":"5","new":"10"},{"column":"notes","old":"In good condition","new":"Ready for show"}]}]}'
}
```

### Example: Row Deletion

**Before (3 rows):**
```javascript
[
  { itemNumber: "F-123", quantity: "5", ... },
  { itemNumber: "F-124", quantity: "3", ... },
  { itemNumber: "F-125", quantity: "8", ... }
]
```

**After (2 rows - F-124 deleted):**
```javascript
[
  { itemNumber: "F-123", quantity: "5", ... },
  { itemNumber: "F-125", quantity: "8", ... }
]
```

**MetaData Table Entry Created:**
```javascript
{
  SourceTable: "INVENTORY",
  SourceTab: "FURNITURE",
  RowIdentifier: "F-124",
  Username: "dan@example.com",
  Timestamp: "2025-11-06T15:30:00Z",
  Operation: "delete",
  RowData: '{"itemNumber":"F-124","quantity":"3",...}'
}
```

---

## Configuration

### Inventory Tables
- ✅ **Enabled** - Full metadata tracking
- Mapping includes: `metadata: 'MetaData'`
- Identifier key: `'itemNumber'`

### Pack Lists
- ⚠️ **Partially Disabled** - Uses special 2D array format
- Currently skips metadata with `skipMetadata: true`
- Future enhancement: Convert to mapped format

### Production Schedule
- 🔄 **Future** - Not yet implemented
- Will follow inventory pattern

### Cache/User Data
- ❌ **Disabled** - User preferences don't need change tracking
- Passes `skipMetadata: true`

---

## Usage Examples

### Basic Save (Automatic)
```javascript
// No changes needed - metadata is automatic!
await Requests.saveInventoryTabData(updatedData, 'FURNITURE');
// Metadata is automatically added based on authState.user.email
```

### Retrieve Metadata History
```javascript
import { MetaDataUtils } from './data_management/index.js';

// Get item data
const items = await Requests.getInventoryTabData('FURNITURE');
const item = items[0];

// Parse metadata
const metadata = MetaDataUtils.parseMetaData(item.metadata);
console.log('Change history:', metadata.history);

// Get most recent change
const lastChange = MetaDataUtils.getMostRecentChange(item.metadata);
console.log('Last modified by:', lastChange.user);
console.log('Last modified at:', lastChange.timestamp);
```

### Store Cached Analytics
```javascript
import { MetaDataUtils } from './data_management/index.js';

// Update cached analytic
item.metadata = MetaDataUtils.setCachedAnalytic(
  item.metadata,
  'lastInventoryCheck',
  new Date().toISOString()
);

// Retrieve cached value
const lastCheck = MetaDataUtils.getCachedAnalytic(
  item.metadata,
  'lastInventoryCheck'
);
```

### Store User Settings
```javascript
import { MetaDataUtils } from './data_management/index.js';

// Mark item as starred
item.metadata = MetaDataUtils.setUserSetting(
  item.metadata,
  'starred',
  true
);

// Get starred status
const isStarred = MetaDataUtils.getUserSetting(item.metadata, 'starred');
```

---

## Testing Locally

The system works with FakeGoogle.js for local development:

1. **Start LiveServer** - Runs at `http://127.0.0.1:5500/docs/`
2. **FakeGoogle automatically selected** - Based on localhost detection
3. **Test username** - `'test@example.com'` from FakeGoogleSheetsAuth
4. **Metadata operations work** - All utilities function the same

---

## Future Enhancements (Not Yet Implemented)

### Phase 2: UI Integration
- [ ] History viewer component
- [ ] Restore deleted row functionality
- [ ] Change indicators in tables
- [ ] User badges showing who last modified

### Phase 3: Pack List Metadata
- [ ] Convert pack lists to mapped format
- [ ] Enable metadata for crate info
- [ ] Track item-level changes within crates

### Phase 4: Production Schedule
- [ ] Add metadata tracking to schedule
- [ ] Track show date changes
- [ ] Track assignment changes

### Phase 5: Advanced Features
- [ ] Rollback/undo functionality
- [ ] Conflict resolution for concurrent edits
- [ ] Metadata search/filter
- [ ] Export change reports
- [ ] Retention policies (archive old metadata)

---

## Known Limitations

1. **Pack Lists** - Currently skip metadata due to special 2D array format
2. **Nested Arrays** - Items within crates not individually tracked (yet)
3. **Performance** - Each save fetches original data for comparison (could optimize with caching)
4. **Storage** - No automatic cleanup of old metadata (manual maintenance needed)
5. **Sheet Limits** - Google Sheets has 10M cell limit; monitor MetaData table growth

---

## Error Handling

The system is designed to **never block saves** even if metadata fails:

```javascript
try {
    // Add metadata tracking
    updatesWithMetadata = await this._addMetadataToRows(...);
} catch (error) {
    console.warn('Failed to add metadata, continuing with save:', error);
    // Continue with save even if metadata fails
}
```

**Graceful Degradation:**
- Metadata parsing errors → Returns empty metadata
- Archive failures → Logs error but doesn't throw
- Missing username → Records as 'unknown'
- Missing identifier → Uses positional tracking

---

## Maintenance

### Viewing MetaData Table

Each spreadsheet now has (or will have) a **MetaData** tab:

1. Open spreadsheet (INVENTORY, PACK_LISTS, PROD_SCHED)
2. Look for "MetaData" tab
3. View deleted rows with full history

### Manually Creating MetaData Tab

If the tab doesn't exist, it will be created automatically on first deletion. To create manually:

1. Add new tab named "MetaData"
2. Add headers: `SourceTable`, `SourceTab`, `RowIdentifier`, `Username`, `Timestamp`, `Operation`, `RowData`

### Cleaning Up Old Metadata

To prevent metadata from growing indefinitely:

**Option 1: Reduce maxHistory**
```javascript
// In metadata-utils.js, change default
static appendToMetaData(existingMetaData, newEntry, maxHistory = 5) {
```

**Option 2: Manual Cleanup Script**
```javascript
// Clear metadata older than 90 days
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - 90);

items.forEach(item => {
  const metadata = MetaDataUtils.parseMetaData(item.metadata);
  if (metadata && metadata.history) {
    metadata.history = metadata.history.filter(entry => 
      new Date(entry.timestamp) > cutoffDate
    );
    item.metadata = JSON.stringify(metadata);
  }
});
```

---

## Summary

✅ **Phase 1 Complete** - Core metadata infrastructure implemented
- MetaData column tracking change history
- MetaData table archiving deleted rows  
- Username attribution from authState
- Transparent operation at Database layer
- Extensible format for future features

**Next Steps:**
- Monitor system in production
- Gather feedback from users
- Plan Phase 2 UI features
- Extend to Pack Lists and Production Schedule

---

## Questions & Support

For questions about the metadata system:
1. Review this documentation
2. Check `metadata-utils.js` for utility methods
3. Examine `database.js` for implementation details
4. Test locally with FakeGoogle.js
5. Refer to copilot-instructions.md for architecture patterns
