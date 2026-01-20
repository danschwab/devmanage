# Lock System Refactor Plan

## Current Issues
1. Each component creates its own lock store (`getSheetLock` for specific tab)
2. Components directly call `lockSheet`/`unlockSheet` mutations
3. Lock checking is per-tab, causing many API calls
4. Force unlock is a separate operation, not integrated with save

## Proposed Architecture

### 1. Global Locks Store
**Create one reactive store for ALL locks:**

```javascript
// In app.js or a shared location
this.globalLocksStore = getReactiveStore(
    Requests.getAllLocks,  // Gets ALL locks at once
    null,
    []
);
```

**Components filter the global data:**
```javascript
computed: {
    myLock() {
        if (!this.globalLocksStore?.data) return null;
        return this.globalLocksStore.data.find(lock => 
            lock.Spreadsheet === 'INVENTORY' && 
            lock.Tab === this.tabTitle
        );
    },
    isLockedByOther() {
        const user = authState.user?.email;
        return this.myLock && this.myLock.User !== user;
    }
}
```

### 2. Integrated Lock Management in Save

**Update save function signatures:**
```javascript
// api.js
static async saveInventoryTabData(mappedData, tabOrItemName, mapping, filters, options = {})
static async savePackList(crates, projectIdentifier, options = {})

// options = {
//   force: false,        // Force unlock if locked by another
//   reason: '',          // Reason for force unlock (audit trail)
//   autoLock: true       // Automatically manage lock acquire/release
// }
```

**Save function logic:**
```javascript
static async saveInventoryTabData(data, tab, mapping, filters, options = {}) {
    const { force = false, reason = '', autoLock = true } = options;
    const user = authState.user?.email;
    
    if (autoLock) {
        // Check current lock
        const lock = await ApplicationUtils.getSheetLock('INVENTORY', tab);
        
        if (lock && lock.User !== user) {
            if (force) {
                // Force unlock: backup autosave data
                const forceResult = await ApplicationUtils.forceUnlockSheet(
                    'INVENTORY', tab, reason
                );
                if (!forceResult.success) {
                    return { success: false, ...forceResult };
                }
            } else {
                // Reject save - locked by another user
                return {
                    success: false,
                    locked: true,
                    lockOwner: lock.User,
                    message: `Cannot save: locked by ${lock.User}`
                };
            }
        }
        
        // Acquire lock if not owned
        if (!lock || lock.User !== user) {
            await ApplicationUtils.lockSheet('INVENTORY', tab, user);
        }
    }
    
    // Perform the actual save
    const saveResult = await InventoryUtils.saveInventoryTabData(
        data, tab, mapping, filters, user
    );
    
    if (autoLock && saveResult) {
        // Release lock after successful save
        await ApplicationUtils.unlockSheet('INVENTORY', tab, user);
    }
    
    // Invalidate ALL locks cache
    invalidateCache([
        { namespace: 'app_utils', methodName: 'getAllLocks', args: [] },
        { namespace: 'api', methodName: 'getAllLocks', args: [] }
    ]);
    
    return saveResult;
}
```

### 3. Remove Direct Lock Calls from Components

**Before (current):**
```javascript
// In table component
async handleLockState(isDirty) {
    if (isDirty && !this.isLocked) {
        await Requests.lockSheet('INVENTORY', this.tabTitle, user);
        this.isLocked = true;
    } else if (!isDirty && this.isLocked) {
        await Requests.unlockSheet('INVENTORY', this.tabTitle, user);
        this.isLocked = false;
    }
}
```

**After (proposed):**
```javascript
// Locking handled automatically by save
// No need for handleLockState - remove it entirely
// Just call save, it handles everything:
await this.inventoryTableStore.save('Saving...', { autoLock: true });
```

### 4. Force Unlock Through Save

**In hamburger menu:**
```javascript
async handleRemoveLock() {
    const result = await this.$modal.confirm(
        `Force unlock? This will backup ${username}'s autosave data.`
    );
    
    if (result) {
        // Force save with empty data array to trigger lock release
        const saveResult = await Requests.saveInventoryTabData(
            this.inventoryTableStore.data,
            this.tabTitle,
            null,
            null,
            { force: true, reason: 'User requested via hamburger menu', autoLock: true }
        );
        
        if (saveResult.success) {
            this.$modal.alert(`Lock removed. Backed up ${saveResult.backupCount} autosave entries.`);
        }
    }
}
```

## Benefits

1. **Single source of truth**: One global locks store, all components watch it
2. **Fewer API calls**: One `getAllLocks` call vs many `getSheetLock` calls
3. **Automatic updates**: When any lock changes, all components see it instantly
4. **Simpler components**: No lock management logic, save handles everything
5. **Integrated force unlock**: Part of save, not a separate operation
6. **Better error handling**: Save returns detailed result with lock status
7. **Audit trail**: Force operations include reason parameter

## Implementation Steps

1. ✅ Add `getAllLocks` API function
2. ✅ Add 10-second cache for `getAllLocks`
3. Create global locks store in app.js
4. Update `saveInventoryTabData` to handle options parameter with lock logic
5. Update `savePackList` to handle options parameter with lock logic
6. Update reactive store save method to pass through options
7. Remove `handleLockState` from table components
8. Update hamburger menus to use force save instead of forceUnlockSheet
9. Remove individual lock stores from components
10. Add computed properties to filter global locks

## Migration Notes

- Keep existing `getSheetLock`, `lockSheet`, `unlockSheet` for backward compatibility during migration
- Test thoroughly - locking is critical for data integrity
- Consider adding lock timeout (auto-release after X minutes of inactivity)
- Add UI indicator showing who has lock in real-time
