import { Database, wrapMethods } from '../index.js';

/**
 * Utility functions for application-specific operations
 */
class applicationUtils_uncached {
    /**
     * Store user data in a user-specific tab within the CACHE sheet
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} username - The username to create/find a tab for
     * @param {string} id - The ID to find/create a row for
     * @param {Array} data - Array of data to store in the row
     * @returns {Promise<boolean>} Success status
     */
    static async storeUserData(deps, username, id, data) {
        // Compose tab name for user data
        const tabName = `${username}_${id}`;
        // Ensure tab exists (create blank if not)
        const allTabs = await deps.call(Database.getTabs, 'CACHE');
        let tab = allTabs.find(t => t.title === tabName);
        if (!tab) {
            await deps.call(Database.createTab, 'CACHE', null, tabName); // create blank tab, no template
        }
        // Prepare JS object for update
        let obj = { ID: id, Value: data };
        return await deps.call(Mutations.setData, 'CACHE', tabName, [obj], { ID: 'ID', Value: 'Value' });
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
        const tabName = `User_${sanitizedUsername}`;
        // Check if tab exists
        const userTab = await deps.call(Database.findTabByName, 'CACHE', tabName);
        if (!userTab) {
            return null; // Tab doesn't exist, no data stored yet
        }
        // Get tab data as JS objects
        const tabData = await deps.call(Database.getData, 'CACHE', tabName, { ID: 'ID', Value: 'Value' });
        if (!tabData || tabData.length === 0) {
            return null; // No data in tab
        }
        // Find object with the ID
        const foundObj = tabData.find(obj => obj.ID === id);
        if (!foundObj) {
            return null; // ID not found
        }
        return foundObj.Value;
    }
}

export const ApplicationUtils = wrapMethods(applicationUtils_uncached, 'app_utils');