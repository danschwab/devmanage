import { Database, wrapMethods } from '../index.js';

// Dynamically import GoogleSheetsAuth based on environment
import { isLocalhost } from '../../google_sheets_services/FakeGoogle.js';
let GoogleSheetsAuth, GoogleSheetsService;
if (isLocalhost()) {
    ({ GoogleSheetsAuth, GoogleSheetsService } = await import('../../google_sheets_services/FakeGoogle.js'));
} else {
    ({ GoogleSheetsAuth } = await import('../../google_sheets_services/GoogleSheetsAuth.js'));
    ({ GoogleSheetsService } = await import('../../google_sheets_services/GoogleSheetsData.js'));
}

/**
 * Utility functions for application-specific operations
 */
class applicationUtils_uncached {
    // Create default saved searches
    static DEFAULT_SEARCHES = [
        {
            name: 'Upcoming',
            dateFilter: '0,30', // Today to 30 days in the future
            textFilters: []
        }
    ];
    
    
    /**
     * Store user data in a user-specific tab within the CACHE sheet
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} username - The username to create/find a tab for
     * @param {string} id - The ID to find/create a row for
     * @param {Array} data - Array of data to store in the row
     * @returns {Promise<boolean>} Success status
     */
    static async storeUserData(username, id, data) {
        // Sanitize username and compose tab name consistently with getUserData
        const sanitizedUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
        const tabName = `UserData_${sanitizedUsername}`;
        
        // Convert data to JSON string if it's not already a string
        let serializedData;
        if (typeof data === 'string') {
            serializedData = data;
        } else {
            serializedData = JSON.stringify(data);
        }

        // Ensure tab exists (create with proper structure if not)
        const allTabs = await Database.getTabs('CACHE');
        let tab = allTabs.find(t => t.title === tabName);
        if (!tab) {
            await Database.createTab('CACHE', null, tabName); // create blank tab, no template
            // Initialize the tab with headers and a single data row as a 2D array
            return await Database.setData(
                'CACHE',
                tabName,
                [
                    ['ID', 'Value'],
                    [id, serializedData]
                ],
                null,
                { skipMetadata: true } // User data doesn't need change tracking
            );
        } else {   
            // Tab exists - need to read all existing data, update/add the row, then write back
            const existingData = await Database.getData('CACHE', tabName, { ID: 'ID', Value: 'Value' });
            
            // Find the row with matching ID
            const rowIndex = existingData.findIndex(row => row.ID === id);
            
            // If data is null, delete the entry
            if (data === null) {
                if (rowIndex !== -1) {
                    // Remove the row from existingData
                    existingData.splice(rowIndex, 1);
                    console.log('Deleting user data entry for ID:', id);
                } else {
                    // Entry doesn't exist, nothing to delete
                    console.log('User data entry not found for deletion, ID:', id);
                    return;
                }
            } else {
                // Normal update/insert logic
                if (rowIndex !== -1) {
                    // Update existing row
                    existingData[rowIndex].Value = serializedData;
                } else {
                    // Add new row
                    existingData.push({ ID: id, Value: serializedData });
                }
            }
            
            console.log('Storing user data - writing all rows:', existingData);
            
            // Write back ALL rows to the sheet
            return await Database.setData('CACHE', tabName, existingData, { ID: 'ID', Value: 'Value' }, {
                skipMetadata: true // User data doesn't need change tracking
            });
        }
    }
    
    /**
     * Check if a user data key or key prefix exists
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} username - The username to find the tab for
     * @param {string} keyOrPrefix - The exact key or prefix to check for
     * @param {boolean} prefixMatch - If true, checks for keys starting with keyOrPrefix; if false, checks for exact match
     * @returns {Promise<boolean>} True if key/prefix exists, false otherwise
     */
    static async hasUserDataKey(deps, username, keyOrPrefix, prefixMatch = false) {
        const sanitizedUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
        const tabName = `UserData_${sanitizedUsername}`;
        
        // Check if tab exists
        const userTab = await deps.call(Database.findTabByName, 'CACHE', tabName);
        if (!userTab) {
            return false; // Tab doesn't exist
        }
        
        // Get tab data as JS objects
        const tabData = await deps.call(Database.getData, 'CACHE', tabName, { ID: 'ID', Value: 'Value' });
        if (!tabData || tabData.length === 0) {
            return false; // No data in tab
        }
        
        // Check for exact match or prefix match
        if (prefixMatch) {
            return tabData.some(obj => obj.ID && obj.ID.startsWith(keyOrPrefix));
        } else {
            return tabData.some(obj => obj.ID === keyOrPrefix);
        }
    }
    
    /**
     * Retrieve user data from a user-specific tab within the CACHE sheet
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} username - The username to find the tab for
     * @param {string} id - The ID to find the row for
     * @returns {Promise<Array|null>} Array of data from the row, or null if not found
     */
    static async getUserData(deps, username, id) {
        const sanitizedUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
        const tabName = `UserData_${sanitizedUsername}`;
        // Check if tab exists
        const userTab = await deps.call(Database.findTabByName, 'CACHE', tabName);
        if (!userTab) {
            // Tab doesn't exist - if requesting saved_searches, initialize with defaults
            if (id === 'saved_searches') {
                await applicationUtils_uncached.storeUserData(username, 'saved_searches', applicationUtils_uncached.DEFAULT_SEARCHES);
                return applicationUtils_uncached.DEFAULT_SEARCHES;
            }
            return null; // Tab doesn't exist, no data stored yet
        }
        // Get tab data as JS objects
        const tabData = await deps.call(Database.getData, 'CACHE', tabName, { ID: 'ID', Value: 'Value' });
        if (!tabData || tabData.length === 0) {
            // No data in tab - if requesting saved_searches, initialize with defaults
            if (id === 'saved_searches') {
                await applicationUtils_uncached.storeUserData(username, 'saved_searches', applicationUtils_uncached.DEFAULT_SEARCHES);
                return applicationUtils_uncached.DEFAULT_SEARCHES;
            }
            return null; // No data in tab
        }
        // Find object with the ID
        const foundObj = tabData.find(obj => obj.ID === id);
        if (!foundObj) {
            // ID not found - if requesting saved_searches, initialize with defaults
            if (id === 'saved_searches') {
                await applicationUtils_uncached.storeUserData(username, 'saved_searches', applicationUtils_uncached.DEFAULT_SEARCHES);
                return applicationUtils_uncached.DEFAULT_SEARCHES;
            }
            return null; // ID not found
        }
        
        // Parse the stored value if it's a JSON string, otherwise return as-is
        let parsedValue;
        try {
            parsedValue = JSON.parse(foundObj.Value);
        } catch (error) {
            // If parsing fails, return the raw string value
            parsedValue = foundObj.Value;
        }
        
        // If requesting saved_searches and result is empty array, initialize with defaults
        if (id === 'saved_searches' && Array.isArray(parsedValue) && parsedValue.length === 0) {
            await applicationUtils_uncached.storeUserData(username, 'saved_searches', applicationUtils_uncached.DEFAULT_SEARCHES);
            return applicationUtils_uncached.DEFAULT_SEARCHES;
        }
        
        return parsedValue;
    }
    
    /**
     * Lock a spreadsheet tab for a user (with write semaphore protection)
     * @param {string} spreadsheet - The spreadsheet name (e.g., 'INVENTORY', 'PACK_LISTS')
     * @param {string} tab - The tab name
     * @param {string} user - The user email claiming the lock
     * @returns {Promise<boolean>} Success status
     */
    static async lockSheet(spreadsheet, tab, user) {
        let writeLockToken = null;
        
        try {
            // Acquire exclusive write access
            writeLockToken = await this._acquireWriteLock();
            
            const timestamp = new Date().toISOString();
            
            // Now we have exclusive access - safe to read-modify-write
            const existingLocks = await this._getLocksData();
            
            // Check if already locked
            const existingLock = existingLocks.find(lock => 
                lock.Spreadsheet === spreadsheet && lock.Tab === tab
            );
            
            if (existingLock) {
                // Already locked by this or another user
                if (existingLock.User === user) {
                    // Update timestamp for same user
                    const updatedLocks = existingLocks.map(lock => 
                        (lock.Spreadsheet === spreadsheet && lock.Tab === tab) 
                            ? { ...lock, Timestamp: timestamp }
                            : lock
                    );
                    
                    await this._saveLocksData(updatedLocks, writeLockToken);
                    
                    return true;
                } else {
                    // Locked by another user
                    console.warn(`Sheet ${spreadsheet}/${tab} is locked by ${existingLock.User}`);
                    return false;
                }
            }
            
            // Add new lock
            existingLocks.push({
                Spreadsheet: spreadsheet,
                Tab: tab,
                User: user,
                Timestamp: timestamp
            });
            
            await this._saveLocksData(existingLocks, writeLockToken);
            
            return true;
            
        } finally {
            // Always release the write lock
            if (writeLockToken) {
                await this._releaseWriteLock(writeLockToken);
            }
        }
    }
    
    /**
     * Unlock a spreadsheet tab (with write semaphore protection)
     * @param {string} spreadsheet - The spreadsheet name
     * @param {string} tab - The tab name
     * @param {string} user - The user email releasing the lock
     * @returns {Promise<boolean>} Success status
     */
    static async unlockSheet(spreadsheet, tab, user) {
        let writeLockToken = null;
        
        try {
            // Acquire exclusive write access
            writeLockToken = await this._acquireWriteLock();
            
            // Now we have exclusive access - safe to read-modify-write
            const existingLocks = await this._getLocksData();
            
            // Find the lock
            const lockIndex = existingLocks.findIndex(lock => 
                lock.Spreadsheet === spreadsheet && lock.Tab === tab
            );
            
            if (lockIndex === -1) {
                // No lock exists
                return true;
            }
            
            const existingLock = existingLocks[lockIndex];
            
            // Only the user who locked it can unlock it
            if (existingLock.User !== user) {
                console.warn(`Cannot unlock ${spreadsheet}/${tab} - locked by ${existingLock.User}, not ${user}`);
                return false;
            }
            
            // Remove the lock
            existingLocks.splice(lockIndex, 1);
            
            await this._saveLocksData(existingLocks, writeLockToken);
            
            return true;
            
        } finally {
            // Always release the write lock
            if (writeLockToken) {
                await this._releaseWriteLock(writeLockToken);
            }
        }
    }
    
    /**
     * Get lock details for a spreadsheet tab
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} spreadsheet - The spreadsheet name
     * @param {string} tab - The tab name
     * @param {string} [currentUser] - Optional current user email to filter out their own locks
     * @returns {Promise<Object|null>} Lock details or null if not locked (or locked by current user)
     */
    static async getSheetLock(deps, spreadsheet, tab, currentUser = null) {
        console.log(`[ApplicationUtils.getSheetLock] Checking lock for spreadsheet: "${spreadsheet}", tab: "${tab}", currentUser: "${currentUser}"`);
        // Use direct sheet access to bypass cache for lock status checks
        const locks = await this._getLocksData();
        console.log(`[ApplicationUtils.getSheetLock] Found ${locks.length} total locks:`, locks);
        
        const matchedLock = locks.find(lock => 
            lock.Spreadsheet === spreadsheet && lock.Tab === tab
        ) || null;
        
        // Filter out if locked by current user
        if (matchedLock && currentUser && matchedLock.User === currentUser) {
            console.log(`[ApplicationUtils.getSheetLock] Lock owned by current user (${currentUser}), returning null`);
            return null;
        }
        
        console.log(`[ApplicationUtils.getSheetLock] Matched lock for "${spreadsheet}/${tab}":`, matchedLock);
        return matchedLock;
    }
    
    /**
     * Force unlock a spreadsheet tab (admin override, with write semaphore protection)
     * This bypasses user validation and backs up any autosaved data before removing it
     * 
     * @param {string} spreadsheet - The spreadsheet name (e.g., 'INVENTORY', 'PACK_LISTS')
     * @param {string} tab - The tab name (e.g., 'FURNITURE', 'ATSC 2025 NAB')
     * @param {string} reason - Optional reason for force unlock (for logging/audit)
     * @returns {Promise<Object>} Result object { success, backupCount, deletedCount, lockOwner, message }
     */
    static async forceUnlockSheet(spreadsheet, tab, reason = '') {
        console.log(`[ApplicationUtils.forceUnlockSheet] Force unlocking ${spreadsheet}/${tab}. Reason: ${reason}`);
        
        let writeLockToken = null;
        
        try {
            // Acquire exclusive write access
            writeLockToken = await this._acquireWriteLock();
            
            // Now we have exclusive access - safe to read-modify-write
            // Get lock info first to identify the owner
            const locks = await this._getLocksData();
        
        const lockInfo = locks.find(lock => 
            lock.Spreadsheet === spreadsheet && lock.Tab === tab
        );
        
        if (!lockInfo) {
            return {
                success: false,
                backupCount: 0,
                deletedCount: 0,
                lockOwner: null,
                message: 'No lock found to remove'
            };
        }
        
        const lockOwner = lockInfo.User;
        console.log(`[ApplicationUtils.forceUnlockSheet] Found lock owned by: ${lockOwner}`);
        
        // Get the owner's username from email
        const username = lockOwner.includes('@') ? lockOwner.split('@')[0] : lockOwner;
        const sanitizedUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
        const tabName = `UserData_${sanitizedUsername}`;
        
        let backupCount = 0;
        let deletedCount = 0;
        
        // Check if user data tab exists
        const allTabs = await Database.getTabs('CACHE');
        const userTab = allTabs.find(t => t.title === tabName);
        
        if (userTab) {
            // Get all autosave entries for this user
            const allUserData = await Database.getData('CACHE', tabName, {
                Store: 'Store',
                Data: 'Data',
                Timestamp: 'Timestamp'
            });
            
            console.log(`[ApplicationUtils.forceUnlockSheet] Found ${allUserData.length} total autosave entries for user ${username}`);
            
            // Find matching autosave entries for this tab
            // Store keys are generated like: '["getInventoryTabData",["FURNITURE",null,null]]'
            // We need to match the tab name in the store key
            const tabStoreKey = JSON.stringify(tab);
            const matchingEntries = allUserData.filter(entry => {
                return entry.Store && entry.Store.includes(tabStoreKey);
            });
            
            console.log(`[ApplicationUtils.forceUnlockSheet] Found ${matchingEntries.length} autosave entries for tab ${tab}`);
            
            if (matchingEntries.length > 0) {
                // Create backup entries and mark originals for deletion
                const timestamp = Date.now();
                const modifiedUserData = [...allUserData];
                
                for (const entry of matchingEntries) {
                    // Create backup entry with OVERRIDDEN prefix
                    const backupEntry = {
                        Store: `OVERRIDDEN_${timestamp}?${entry.Store}`,
                        Data: entry.Data,
                        Timestamp: entry.Timestamp
                    };
                    modifiedUserData.push(backupEntry);
                    backupCount++;
                    
                    // Remove original entry
                    const originalIndex = modifiedUserData.findIndex(e => 
                        e.Store === entry.Store && e.Timestamp === entry.Timestamp
                    );
                    if (originalIndex !== -1) {
                        modifiedUserData.splice(originalIndex, 1);
                        deletedCount++;
                    }
                }
                
                // Save modified user data
                await Database.setData('CACHE', tabName, modifiedUserData, {
                    Store: 'Store',
                    Data: 'Data',
                    Timestamp: 'Timestamp'
                }, { skipMetadata: true });
                
                console.log(`[ApplicationUtils.forceUnlockSheet] Backed up ${backupCount} entries, deleted ${deletedCount} entries`);
            }
        } else {
            console.log(`[ApplicationUtils.forceUnlockSheet] No user data tab found for ${username} - no autosave entries to backup`);
        }
        
        // Remove the lock (without user validation)
        const remainingLocks = locks.filter(lock => 
            !(lock.Spreadsheet === spreadsheet && lock.Tab === tab)
        );
        
        // Save remaining locks with semaphore
        await this._saveLocksData(remainingLocks, writeLockToken);
        
        console.log(`[ApplicationUtils.forceUnlockSheet] Lock removed successfully`);
        
        return {
            success: true,
            backupCount,
            deletedCount,
            lockOwner,
            message: `Successfully force unlocked ${spreadsheet}/${tab}`
        };
        
        } catch (error) {
            console.error('[ApplicationUtils.forceUnlockSheet] Error during force unlock:', error);
            throw error;
        } finally {
            // Always release the write lock
            if (writeLockToken) {
                await this._releaseWriteLock(writeLockToken);
            }
        }
    }
    
    /**
     * Release all locks for a user (with write semaphore protection)
     * @param {string} user - The user email
     * @returns {Promise<boolean>} Success status
     */
    static async releaseAllUserLocks(user) {
        let writeLockToken = null;
        
        try {
            // Acquire exclusive write access
            writeLockToken = await this._acquireWriteLock();
            
            // Now we have exclusive access - safe to read-modify-write
            const locks = await this._getLocksData();
            
            // Remove all locks for this user
            const remainingLocks = locks.filter(lock => lock.User !== user);
            
            await this._saveLocksData(remainingLocks, writeLockToken);
            
            return true;
            
        } finally {
            // Always release the write lock
            if (writeLockToken) {
                await this._releaseWriteLock(writeLockToken);
            }
        }
    }
    
    /**
     * Acquire exclusive write access to the Locks table using cell A1 as semaphore
     * Cell A1 structure: empty/"0" = unlocked, timestamp = locked
     * Max wait time: 10 seconds with 100ms polling
     * @private
     * @returns {Promise<string>} Token (timestamp) for releasing the lock
     */
    static async _acquireWriteLock() {
        const maxAttempts = 100; // 10 seconds max wait (100ms * 100)
        const pollInterval = 100; // 100ms between attempts
        const myToken = Date.now().toString();
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                // Read current semaphore value from A1
                const rawData = await GoogleSheetsService.getSheetData('CACHE', 'Locks!A1:A1');
                const currentValue = (rawData && rawData[0] && rawData[0][0]) ? rawData[0][0] : '';
                
                // Check if unlocked (empty or "0")
                if (!currentValue || currentValue === '0' || currentValue === '') {
                    // Try to claim the lock by writing our token to A1 only
                    await GoogleSheetsService.setSheetData('CACHE', 'Locks!A1:A1', [[myToken]], null);
                    
                    // Verify we got the lock (handle race condition)
                    await new Promise(resolve => setTimeout(resolve, 50)); // Small delay for write propagation
                    const verifyData = await GoogleSheetsService.getSheetData('CACHE', 'Locks!A1:A1');
                    const verifyValue = (verifyData && verifyData[0] && verifyData[0][0]) ? verifyData[0][0] : '';
                    
                    if (verifyValue === myToken) {
                        console.log(`[_acquireWriteLock] Acquired lock with token: ${myToken}`);
                        return myToken;
                    }
                    // Someone else got it, try again
                } else {
                    // Check if lock is stale (older than 30 seconds)
                    const lockTime = parseInt(currentValue);
                    const now = Date.now();
                    if (!isNaN(lockTime) && (now - lockTime) > 30000) {
                        console.warn(`[_acquireWriteLock] Detected stale lock from ${new Date(lockTime).toISOString()}, breaking it`);
                        // Force release stale lock - write to A1 only
                        await GoogleSheetsService.setSheetData('CACHE', 'Locks!A1:A1', [['0']], null);
                        continue; // Try again immediately
                    }
                }
                
                // Wait before next attempt
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                
            } catch (error) {
                console.error('[_acquireWriteLock] Error during lock acquisition:', error);
                throw error;
            }
        }
        
        throw new Error('[_acquireWriteLock] Failed to acquire write lock after 10 seconds - lock may be held by another process');
    }
    
    /**
     * Release exclusive write access to the Locks table
     * @private
     * @param {string} token - The token returned from _acquireWriteLock
     * @returns {Promise<void>}
     */
    static async _releaseWriteLock(token) {
        try {
            // Verify we still own the lock before releasing
            const rawData = await GoogleSheetsService.getSheetData('CACHE', 'Locks!A1:A1');
            const currentValue = (rawData && rawData[0] && rawData[0][0]) ? rawData[0][0] : '';
            
            if (currentValue === token) {
                // Clear the semaphore - write to A1 only
                await GoogleSheetsService.setSheetData('CACHE', 'Locks!A1:A1', [['0']], null);
                console.log(`[_releaseWriteLock] Released lock with token: ${token}`);
            } else {
                console.warn(`[_releaseWriteLock] Lock token mismatch - current: ${currentValue}, expected: ${token}`);
            }
        } catch (error) {
            console.error('[_releaseWriteLock] Error releasing lock:', error);
            // Don't throw - always try to release
        }
    }
    
    /**
     * Get locks data directly from sheet without caching
     * @private
     * @returns {Promise<Array<Object>>} Array of lock objects
     */
    static async _getLocksData() {
        try {
            // Read directly from GoogleSheetsService to bypass cache
            // Range starts at A2 to skip semaphore cell in A1
            const rawData = await GoogleSheetsService.getSheetData('CACHE', 'Locks!A2:D');
            
            console.log('[_getLocksData] Raw data from Locks!A2:D:', rawData);
            
            if (!rawData || rawData.length === 0) {
                console.log('[_getLocksData] No data found, returning empty array');
                return [];
            }
            
            // First row should be headers
            const headers = rawData[0];
            if (!headers || headers.length === 0) {
                console.warn('[_getLocksData] No headers found, returning empty array');
                return [];
            }
            
            // Transform remaining rows to objects
            const locks = [];
            for (let i = 1; i < rawData.length; i++) {
                const row = rawData[i];
                // Check if row has any data at all (not just checking first column)
                const hasData = row && row.some(cell => cell !== null && cell !== undefined && cell !== '');
                if (hasData) {
                    locks.push({
                        Spreadsheet: row[0] || '',
                        Tab: row[1] || '',
                        User: row[2] || '',
                        Timestamp: row[3] || ''
                    });
                }
            }
            
            console.log(`[_getLocksData] Found ${locks.length} locks:`, locks);
            return locks;
        } catch (error) {
            console.error('[_getLocksData] Error reading locks:', error);
            return [];
        }
    }

    /**
     * Save locks data to the Locks sheet, preserving the semaphore cell
     * @private
     * @param {Array<Object>} locks - Array of lock objects
     * @param {string} currentSemaphore - Current semaphore value to preserve
     * @returns {Promise<boolean>}
     */
    static async _saveLocksData(locks, currentSemaphore = '0') {
        try {
            console.log(`[_saveLocksData] Saving ${locks.length} locks with semaphore: ${currentSemaphore}`);
            console.log('[_saveLocksData] Lock data:', locks);
            
            // Build 2D array: semaphore, headers, then data rows
            const headers = ['Spreadsheet', 'Tab', 'User', 'Timestamp'];
            const dataRows = locks.map(lock => [
                lock.Spreadsheet || '',
                lock.Tab || '',
                lock.User || '',
                lock.Timestamp || ''
            ]);
            
            const sheetData = [
                [currentSemaphore], // A1: Semaphore cell
                headers,             // A2:D2: Headers
                ...dataRows          // A3+: Lock data
            ];
            
            console.log(`[_saveLocksData] Writing ${sheetData.length} rows (including semaphore + headers)`);
            
            // Write directly to GoogleSheetsService to ensure immediate write
            // Use range A1:D to overwrite entire sheet (semaphore + all lock data)
            await GoogleSheetsService.setSheetData('CACHE', 'Locks', sheetData, null);
            
            console.log('[_saveLocksData] Successfully saved locks');
            return true;
        } catch (error) {
            console.error('[_saveLocksData] Error saving locks:', error);
            return false;
        }
    }
}

export const ApplicationUtils = wrapMethods(
    applicationUtils_uncached, 
    'app_utils', 
    ['storeUserData', 'initializeDefaultSavedSearches', 'lockSheet', 'unlockSheet', 'forceUnlockSheet', '_acquireWriteLock', '_releaseWriteLock', '_getLocksData', '_saveLocksData'], // Mutation methods (including private helpers)
    [], // Infinite cache methods
    { 'getSheetLock': 10000 } // Custom cache durations (10 seconds for lock checks)
);