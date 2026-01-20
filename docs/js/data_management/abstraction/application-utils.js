import { Database, wrapMethods } from '../index.js';

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
     * Lock a spreadsheet tab for a user
     * @param {string} spreadsheet - The spreadsheet name (e.g., 'INVENTORY', 'PACK_LISTS')
     * @param {string} tab - The tab name
     * @param {string} user - The user email claiming the lock
     * @returns {Promise<boolean>} Success status
     */
    static async lockSheet(spreadsheet, tab, user) {
        const timestamp = new Date().toISOString();
        
        // Get existing locks
        const existingLocks = await Database.getData('CACHE', 'Locks', {
            Spreadsheet: 'Spreadsheet',
            Tab: 'Tab',
            User: 'User',
            Timestamp: 'Timestamp'
        });
        
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
                
                return await Database.setData('CACHE', 'Locks', updatedLocks, {
                    Spreadsheet: 'Spreadsheet',
                    Tab: 'Tab',
                    User: 'User',
                    Timestamp: 'Timestamp'
                }, { skipMetadata: true });
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
        
        return await Database.setData('CACHE', 'Locks', existingLocks, {
            Spreadsheet: 'Spreadsheet',
            Tab: 'Tab',
            User: 'User',
            Timestamp: 'Timestamp'
        }, { skipMetadata: true });
    }
    
    /**
     * Unlock a spreadsheet tab
     * @param {string} spreadsheet - The spreadsheet name
     * @param {string} tab - The tab name
     * @param {string} user - The user email releasing the lock
     * @returns {Promise<boolean>} Success status
     */
    static async unlockSheet(spreadsheet, tab, user) {
        // Get existing locks
        const existingLocks = await Database.getData('CACHE', 'Locks', {
            Spreadsheet: 'Spreadsheet',
            Tab: 'Tab',
            User: 'User',
            Timestamp: 'Timestamp'
        });
        
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
        
        return await Database.setData('CACHE', 'Locks', existingLocks, {
            Spreadsheet: 'Spreadsheet',
            Tab: 'Tab',
            User: 'User',
            Timestamp: 'Timestamp'
        }, { skipMetadata: true });
    }
    
    /**
     * Get lock details for a spreadsheet tab
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} spreadsheet - The spreadsheet name
     * @param {string} tab - The tab name
     * @returns {Promise<Object|null>} Lock details or null if not locked
     */
    static async getSheetLock(deps, spreadsheet, tab) {
        console.log(`[ApplicationUtils.getSheetLock] Checking lock for spreadsheet: "${spreadsheet}", tab: "${tab}"`);
        const locks = await deps.call(Database.getData, 'CACHE', 'Locks', {
            Spreadsheet: 'Spreadsheet',
            Tab: 'Tab',
            User: 'User',
            Timestamp: 'Timestamp'
        });
        console.log(`[ApplicationUtils.getSheetLock] Found ${locks.length} total locks:`, locks);
        
        const matchedLock = locks.find(lock => 
            lock.Spreadsheet === spreadsheet && lock.Tab === tab
        ) || null;
        
        console.log(`[ApplicationUtils.getSheetLock] Matched lock for "${spreadsheet}/${tab}":`, matchedLock);
        return matchedLock;
    }
    
    /**
     * Release all locks for a user
     * @param {string} user - The user email
     * @returns {Promise<boolean>} Success status
     */
    static async releaseAllUserLocks(user) {
        const locks = await Database.getData('CACHE', 'Locks', {
            Spreadsheet: 'Spreadsheet',
            Tab: 'Tab',
            User: 'User',
            Timestamp: 'Timestamp'
        });
        
        // Remove all locks for this user
        const remainingLocks = locks.filter(lock => lock.User !== user);
        
        return await Database.setData('CACHE', 'Locks', remainingLocks, {
            Spreadsheet: 'Spreadsheet',
            Tab: 'Tab',
            User: 'User',
            Timestamp: 'Timestamp'
        }, { skipMetadata: true });
    }
}

export const ApplicationUtils = wrapMethods(applicationUtils_uncached, 'app_utils', ['storeUserData', 'initializeDefaultSavedSearches', 'lockSheet', 'unlockSheet']);