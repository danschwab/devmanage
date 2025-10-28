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
    static async storeUserData(username, id, data) {
        // Sanitize username and compose tab name consistently with getUserData
        const sanitizedUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
        const tabName = `User_${sanitizedUsername}`;
        
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
                ]
            );
        } else {   
            // Prepare JS object for update
            let obj = { ID: id, Value: serializedData };
            console.log('Storing user data:', obj);
            return await Database.setData('CACHE', tabName, [obj], { ID: 'ID', Value: 'Value' });
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
        
        // Parse the stored value if it's a JSON string, otherwise return as-is
        let parsedValue;
        try {
            parsedValue = JSON.parse(foundObj.Value);
        } catch (error) {
            // If parsing fails, return the raw string value
            parsedValue = foundObj.Value;
        }
        
        return parsedValue;
    }
}

export const ApplicationUtils = wrapMethods(applicationUtils_uncached, 'app_utils', ['storeUserData']);