# Locking System

## Purpose

Prevent concurrent editing conflicts by locking spreadsheet tabs when users modify data.

## Data Storage

**Location**: `CACHE` spreadsheet → `Locks` tab

**Schema**:
| Column | Description |
|--------|-------------|
| Spreadsheet | Spreadsheet name (e.g., `PACK_LISTS`, `INVENTORY`) |
| Tab | Tab name (e.g., `ATSC 2025 NAB`, `ELECTRONICS`) |
| User | User email who owns the lock |
| Timestamp | ISO 8601 timestamp when lock was acquired |

## API Functions

### Core Lock Operations

- `Requests.lockSheet(spreadsheet, tab, user)` - Acquire lock (mutation, no cache)
- `Requests.unlockSheet(spreadsheet, tab, user)` - Release lock (mutation, no cache)
- `Requests.getSheetLock(spreadsheet, tab)` - Get lock details (query, no cache)

### Specialized Functions

- `Requests.getPacklistLock(tabName)` - Get pack list lock (calls `getSheetLock('PACK_LISTS', tabName)`)
- `Requests.getInventoryLock(tabName)` - Get inventory lock (calls `getSheetLock('INVENTORY', tabName)`)

**All lock methods excluded from caching to ensure real-time status.**

## Implementation Pattern

### Table Components (Edit Views)

**Data Properties**:

- `isLocked` - This component owns the lock
- `lockedByOther` - Locked by another user
- `lockOwner` - Email of lock owner
- `lockCheckComplete` - Initial check finished

**Lifecycle**:

1. `mounted()` → `checkLockStatus()` - Check lock on load
2. Watch `isDirty` → `handleLockState(isDirty)` - Auto lock/unlock
   - `isDirty=true` → Acquire lock
   - `isDirty=false` → Release lock
3. If locked by another user, prevent edit mode entry

**UI Integration**:

- Disable "Edit" button until `lockCheckComplete`
- Show "Locked by <username>" when `lockedByOther`
- Extract username: `email.includes('@') ? email.split('@')[0] : email`

### Cards Grid (List Views)

**Analysis Configuration**:

```javascript
createAnalysisConfig(
  Requests.getPacklistLock, // or getInventoryLock
  "lockInfo",
  "Checking lock status...",
  ["title"],
  [],
  "lockInfo",
);
```

**Card Formatting**:

- Check `tab.lockInfo !== null` to determine lock status
- Card color priority: **locked (white) > unsaved (red) > normal (gray/purple)**
- Footer: `"Locked for edit by: <username>"` if locked

## Lock Behavior

### Acquisition

- **Success**: User edits → table becomes dirty → lock acquired automatically
- **Failure**: Another user has lock → show error, prevent editing
- Lock updates timestamp if same user re-locks

### Release

- **Auto**: Table saved → becomes clean → lock released automatically
- **Manual**: Component unmount → lock released
- Only lock owner can release their lock

### Conflict Resolution

- Lock checks are real-time (no caching)
- If edit mode entered while locked by another → auto-navigate to view mode
- Failed lock acquisition shows who owns the lock

## Example Usage

### Pack Lists

- **Cards**: Show lock status on all pack lists
- **Table**: Lock acquired when editing, released on save

### Inventory

- **Cards**: Show lock status on category cards
- **Table**: Lock acquired when editing category, released on save

## Key Standards

1. **Always call specialized lock functions** (`getPacklistLock`, `getInventoryLock`) in analysis configs
2. **Extract usernames** from emails for display (`email.split('@')[0]`)
3. **No caching** for any lock operations
4. **Auto-manage locks** via dirty state watchers, not manual calls
5. **White cards** indicate locked items in cards grids
