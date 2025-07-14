import { Database, CacheManager } from '../../index.js';

/**
 * Utility functions for application-specific operations
 */
export class ApplicationUtils {
    /**
     * Store user data in a user-specific tab within the CACHE sheet
     * @param {string} username - The username to create/find a tab for
     * @param {string} id - The ID to find/create a row for
     * @param {Array} data - Array of data to store in the row
     * @param {string} [trackingId] - Optional tracking ID for dependency tracking
     * @returns {Promise<boolean>} Success status
     */
    static async storeUserData(username, id, data, trackingId = null) {
        try {
            // Sanitize username for tab name (remove invalid characters)
            const sanitizedUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
            const tabName = `User_${sanitizedUsername}`;
            
            // Check if tab exists, create if not
            let userTab = await Database.findTabByName('CACHE', tabName, trackingId);
            if (!userTab) {
                // Try to find a template tab first, fallback to creating without template
                let templateTab = await Database.findTabByName('CACHE', 'UserTemplate', trackingId);
                
                if (templateTab) {
                    // Create new tab based on template
                    await Database.createTab('CACHE', templateTab, tabName);
                } else {
                    // Create new tab without template and initialize with headers
                    await Database.createTab('CACHE', null, tabName);
                    
                    // Initialize with headers: ID, Data1, Data2, Data3, etc.
                    const headers = ['ID', ...data.map((_, index) => `Data${index + 1}`)];
                    await Database.setData('CACHE', `${tabName}!A1:${String.fromCharCode(64 + headers.length)}1`, [headers]);
                }
                
                // Verify tab was created
                userTab = await Database.findTabByName('CACHE', tabName, trackingId);
                if (!userTab) {
                    throw new Error(`Failed to create or find user tab: ${tabName}`);
                }
            }
            
            // Get current tab data to find or create the row
            const tabData = await Database.getData('CACHE', `${tabName}!A:Z`, true, trackingId);
            const headers = tabData[0] || [];
            const rows = tabData.slice(1) || [];
            
            // Find existing row with the ID
            let rowIndex = rows.findIndex(row => row[0] === id);
            
            // Prepare the row data
            const rowData = [id, ...data];
            
            if (rowIndex !== -1) {
                // Update existing row
                const actualRowIndex = rowIndex + 2; // +1 for header, +1 for 1-based indexing
                const range = `${tabName}!A${actualRowIndex}:${String.fromCharCode(64 + rowData.length)}${actualRowIndex}`;
                await Database.setData('CACHE', range, [rowData]);
            } else {
                // Append new row
                const newRowIndex = rows.length + 2; // +1 for header, +1 for 1-based indexing
                const range = `${tabName}!A${newRowIndex}:${String.fromCharCode(64 + rowData.length)}${newRowIndex}`;
                await Database.setData('CACHE', range, [rowData]);
            }
            
            // Clear cache for this tab to ensure fresh data on next read
            CacheManager.invalidateByPrefix(CacheManager.NAMESPACES.SHEET_DATA, `CACHE:${tabName}`);
            CacheManager.invalidate(CacheManager.NAMESPACES.SHEET_TABS, 'CACHE');
            
            return true;
        } catch (error) {
            console.error(`Failed to store user data for ${username}:`, error);
            throw new Error(`Could not store user data: ${error.message}`);
        }
    }
    
    /**
     * Retrieve user data from a user-specific tab within the CACHE sheet
     * @param {string} username - The username to find the tab for
     * @param {string} id - The ID to find the row for
     * @param {string} [trackingId] - Optional tracking ID for dependency tracking
     * @returns {Promise<Array|null>} Array of data from the row, or null if not found
     */
    static async getUserData(username, id, trackingId = null) {
        try {
            // Sanitize username for tab name
            const sanitizedUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
            const tabName = `User_${sanitizedUsername}`;
            
            // Check if tab exists
            const userTab = await Database.findTabByName('CACHE', tabName, trackingId);
            if (!userTab) {
                return null; // Tab doesn't exist, no data stored yet
            }
            
            // Get tab data
            const tabData = await Database.getData('CACHE', `${tabName}!A:Z`, true, trackingId);
            if (!tabData || tabData.length < 2) {
                return null; // No data in tab
            }
            
            const headers = tabData[0] || [];
            const rows = tabData.slice(1) || [];
            
            // Find row with the ID
            const foundRow = rows.find(row => row[0] === id);
            if (!foundRow) {
                return null; // ID not found
            }
            
            // Return data without the ID (skip first column)
            return foundRow.slice(1);
        } catch (error) {
            console.error(`Failed to get user data for ${username}:`, error);
            throw new Error(`Could not retrieve user data: ${error.message}`);
        }
    }
}
