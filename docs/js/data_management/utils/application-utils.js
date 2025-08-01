import { Database, wrapMethods } from '../../index.js';

/**
 * Utility functions for application-specific operations
 */
class applicationUtils {
    /**
     * Store user data in a user-specific tab within the CACHE sheet
     * @param {string} username - The username to create/find a tab for
     * @param {string} id - The ID to find/create a row for
     * @param {Array} data - Array of data to store in the row
     * @returns {Promise<boolean>} Success status
     */
    static async storeUserData(username, id, data) {
        // Compose tab name for user data
        const tabName = `${username}_${id}`;
        // Ensure tab exists (create blank if not)
        const allTabs = await Database.getTabs('CACHE', true);
        let tab = allTabs.find(t => t.title === tabName);
        if (!tab) {
            await Database.createTab('CACHE', null, tabName); // create blank tab, no template
        }
        // Prepare values for full-table update
        let values = Array.isArray(data) ? data : [data];
        // If tab is newly created, add header row
        if (!tab) {
            values = [['ID', 'Value']].concat(values.map((row, i) => [i + 1, row]));
        }
        // If tab exists and has header, just update values
        const updates = { type: 'full-table', values };
        return await Database.setData('CACHE', tabName, updates);
    }
    
    /**
     * Retrieve user data from a user-specific tab within the CACHE sheet
     * @param {string} username - The username to find the tab for
     * @param {string} id - The ID to find the row for
     * @returns {Promise<Array|null>} Array of data from the row, or null if not found
     */
    static async getUserData(username, id) {
        const sanitizedUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
        const tabName = `User_${sanitizedUsername}`;
        
        // Check if tab exists
        const userTab = await Database.findTabByName('CACHE', tabName);
        if (!userTab) {
            return null; // Tab doesn't exist, no data stored yet
        }
        
        // Get tab data
        const tabData = await Database.getData('CACHE', `${tabName}!A:Z`);
        if (!tabData || tabData.length < 2) {
            return null; // No data in tab
        }
        
        const rows = tabData.slice(1) || [];
        
        // Find row with the ID
        const foundRow = rows.find(row => row[0] === id);
        if (!foundRow) {
            return null; // ID not found
        }
        
        return foundRow ? foundRow.slice(1) : null;
    }
}

export const ApplicationUtils = wrapMethods(applicationUtils, 'app_utils');