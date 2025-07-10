import { Database, Analytics, CacheManager, applyTracking, InventoryUtils, PackListUtils, ProductionUtils, ApplicationUtils } from '../index.js';

class RequestsBase {
    /**
     * Fetch data from a sheet with simplified interface
     * @param {string} tableId - Table identifier (INVENTORY, PACK_LISTS, etc.)
     * @param {string} tabName - Tab name
     * @param {string} [range] - Optional range (e.g., 'A1:C10'), if omitted fetches all data
     * @returns {Promise<Array>} - 2D array of data
     */
    static async fetchData(tableId, tabName, range = null) {
        try {
            const fullRange = range ? `${tabName}!${range}` : `${tabName}`;
            // Get current tracking ID from context
            const trackingId = CacheManager.getCurrentTrackingId();
            return await Database.getData(tableId, fullRange, true, trackingId);
        } catch (error) {
            console.error(`Failed to fetch data from ${tableId}/${tabName}:`, error);
            Analytics.trackEvent?.('data_error', { action: 'fetch', tableId, tabName });
            throw new Error(`Could not load data. Please try again.`);
        }
    }
    
    /**
     * Save data to a sheet
     * @param {string} tableId - Table identifier
     * @param {string} tabName - Tab name
     * @param {Array|Object} data - Data to save (cell updates or full table)
     * @returns {Promise<boolean>} - Success status
     */
    static async saveData(tableId, tabName, data) {
        try {
            return await Database.setData(tableId, tabName, data);
        } catch (error) {
            console.error(`Failed to save data to ${tableId}/${tabName}:`, error);
            Analytics.trackEvent?.('data_error', { action: 'save', tableId, tabName });
            throw new Error(`Could not save data. Please try again.`);
        }
    }
    
    /**
     * Get all available tabs for a table
     * @param {string} tableId - Table identifier
     * @param {boolean} includeHidden - Whether to include hidden tabs in the result
     * @returns {Promise<Array<{title: string, sheetId: number}>>}
     */
    static async getAvailableTabs(tableId, includeHidden = false) {
        try {
            // Get current tracking ID from context
            const trackingId = CacheManager.getCurrentTrackingId();
            const tabs = await Database.getTabs(tableId, true, trackingId);
            return includeHidden ? tabs : tabs.filter(tab => !tab.title.startsWith('_'));
        } catch (error) {
            console.error(`Failed to get tabs for ${tableId}:`, error);
            throw new Error(`Could not load available tabs. Please try again.`);
        }
    }
    
    /**
     * Create a new tab based on a template
     * @param {string} tableId - Table identifier
     * @param {string} templateName - Name of the template tab
     * @param {string} newTabName - Name for the new tab
     * @returns {Promise<boolean>} - Success status
     */
    static async createNewTab(tableId, templateName, newTabName) {
        try {
            const trackingId = CacheManager.getCurrentTrackingId();
            const templateTab = await Database.findTabByName(tableId, templateName, trackingId);
            if (!templateTab) {
                throw new Error(`Template tab "${templateName}" not found`);
            }
            
            await Database.createTab(tableId, templateTab, newTabName);
            return true;
        } catch (error) {
            console.error(`Failed to create tab ${newTabName} from ${templateName}:`, error);
            throw new Error(`Could not create new tab: ${error.message}`);
        }
    }
    
    /**
     * Show specified tabs
     * @param {string} tableId - Table identifier
     * @param {string[]} tabNames - Names of tabs to show
     */
    static async showTabs(tableId, tabNames) {
        try {
            const allTabs = await Database.getTabs(tableId);
            const tabsToShow = allTabs.filter(tab => tabNames.includes(tab.title));
            
            if (tabsToShow.length === 0) return false;
            await Database.showTabs(tableId, tabsToShow);
            return true;
        } catch (error) {
            console.error(`Failed to show tabs in ${tableId}:`, error);
            throw new Error(`Could not show tabs. Please try again.`);
        }
    }
    
    /**
     * Hide specified tabs
     * @param {string} tableId - Table identifier
     * @param {string[]} tabNames - Names of tabs to hide
     */
    static async hideTabs(tableId, tabNames) {
        try {
            const allTabs = await Database.getTabs(tableId);
            const tabsToHide = allTabs.filter(tab => tabNames.includes(tab.title));
            
            if (tabsToHide.length === 0) return false;
            await Database.hideTabs(tableId, tabsToHide);
            return true;
        } catch (error) {
            console.error(`Failed to hide tabs in ${tableId}:`, error);
            throw new Error(`Could not hide tabs. Please try again.`);
        }
    }
    
    /**
     * Find a tab by name
     * @param {string} tableId - Table identifier
     * @param {string} tabName - Name of the tab to find
     * @returns {Promise<{title: string, sheetId: number}|null>}
     */
    static async findTab(tableId, tabName) {
        try {
            const trackingId = CacheManager.getCurrentTrackingId();
            return await Database.findTabByName(tableId, tabName, trackingId);
        } catch (error) {
            console.error(`Failed to find tab ${tabName} in ${tableId}:`, error);
            throw new Error(`Could not find tab. Please try again.`);
        }
    }
    
    /**
     * Clear cache for specified resources
     * @param {string} [tableId] - Optional table to clear cache for
     * @param {string} [range] - Optional range to clear cache for
     */
    static clearCache(tableId = null, range = null) {
        try {
            Database.clearCache(tableId, range);
            return true;
        } catch (error) {
            console.error('Failed to clear cache:', error);
            return false;
        }
    }
    
    /**
     * Executes a SQL-like query against sheet data
     * @param {string} tableId - The table identifier
     * @param {string} query - SQL-like query string
     * @returns {Promise<Array<Object>>} Query results
     */
    static async queryData(tableId, query) {
        try {
            const trackingId = CacheManager.getCurrentTrackingId();
            return await Database.queryData(tableId, query, trackingId);
        } catch (error) {
            console.error(`Failed to execute query on ${tableId}:`, error);
            Analytics.trackEvent?.('data_error', { action: 'query', tableId, query: query.substring(0, 100) });
            throw new Error(`Could not execute query. Please check syntax and try again.`);
        }
    }
    
    /**
     * Extracts item quantities from a project's pack list
     * @param {string} projectIdentifier - The project identifier
     * @returns {Promise<object>} Map of itemId to quantity
     */
    static async getItemQuantities(projectIdentifier) {
        try {
            const trackingId = CacheManager.getCurrentTrackingId();
            return await PackListUtils.extractItems(projectIdentifier, trackingId);
        } catch (error) {
            console.error(`Failed to extract item quantities for ${projectIdentifier}:`, error);
            Analytics.trackEvent?.('data_error', { action: 'extract_quantities', projectIdentifier });
            throw new Error(`Could not extract item quantities. Please try again.`);
        }
    }
    
    /**
     * Check quantities and availability for items in a project
     * @param {string} projectIdentifier - The project identifier
     * @returns {Promise<object>} Inventory status for all items in the project
     */
    static async checkAvailability(projectIdentifier) {
        try {
            const trackingId = CacheManager.getCurrentTrackingId();
            return await Analytics.checkItemAvailability(projectIdentifier, trackingId);
        } catch (error) {
            console.error(`Failed to check availability for ${projectIdentifier}:`, error);
            Analytics.trackEvent?.('data_error', { action: 'check_availability', projectIdentifier });
            throw new Error(`Could not check item availability. Please try again.`);
        }
    }
    
    /**
     * Get information about specific inventory items
     * @param {string|string[]} itemName - Item ID(s) to look up
     * @param {string|string[]} fields - Field(s) to retrieve
     * @returns {Promise<Array<Object>>} Item information
     */
    static async getInventoryInfo(itemName, fields) {
        try {
            const trackingId = CacheManager.getCurrentTrackingId();
            return await InventoryUtils.getItemInfo(itemName, fields, trackingId);
        } catch (error) {
            console.error(`Failed to get inventory information:`, error);
            Analytics.trackEvent?.('data_error', { action: 'get_inventory_info', items: Array.isArray(itemName) ? itemName.length : 1 });
            throw new Error(`Could not retrieve inventory information. Please try again.`);
        }
    }
    
    /**
     * Get pack list content for a project
     * @param {string} projectIdentifier - The project identifier
     * @param {string} [itemColumnsStart="Pack"] - Column header where item data begins
     * @returns {Promise<Object>} Pack list content
     */
    static async getPackList(projectIdentifier, itemColumnsStart = "Pack") {
        try {
            const trackingId = CacheManager.getCurrentTrackingId();
            return await PackListUtils.getContent(projectIdentifier, itemColumnsStart, trackingId);
        } catch (error) {
            console.error(`Failed to get pack list for ${projectIdentifier}:`, error);
            Analytics.trackEvent?.('data_error', { action: 'get_pack_list', projectIdentifier });
            throw new Error(`Could not retrieve pack list. Please try again.`);
        }
    }
    
    /**
     * Find projects that overlap with the given project or date range
     * @param {string|Object} parameters - Project identifier or date range parameters
     * @returns {Promise<string[]>} Array of overlapping project identifiers
     */
    static async getOverlappingProjects(parameters) {
        try {
            const trackingId = CacheManager.getCurrentTrackingId();
            return await ProductionUtils.getOverlappingShows(parameters, trackingId);
        } catch (error) {
            console.error(`Failed to find overlapping projects:`, error);
            Analytics.trackEvent?.('data_error', { action: 'get_overlapping', parameters: typeof parameters === 'string' ? parameters : 'date_range' });
            throw new Error(`Could not find overlapping projects. Please try again.`);
        }
    }
    
    /**
     * Store user-specific application data
     * @param {string} username - The username to store data for
     * @param {string} id - The ID to associate with the data
     * @param {Array} data - Array of data to store
     * @returns {Promise<boolean>} Success status
     */
    static async storeUserData(username, id, data) {
        try {
            const trackingId = CacheManager.getCurrentTrackingId();
            return await ApplicationUtils.storeUserData(username, id, data, trackingId);
        } catch (error) {
            console.error(`Failed to store user data for ${username}:`, error);
            Analytics.trackEvent?.('data_error', { action: 'store_user_data', username });
            throw new Error(`Could not store user data. Please try again.`);
        }
    }
    
    /**
     * Retrieve user-specific application data
     * @param {string} username - The username to retrieve data for
     * @param {string} id - The ID to retrieve data for
     * @returns {Promise<Array|null>} Array of data or null if not found
     */
    static async getUserData(username, id) {
        try {
            const trackingId = CacheManager.getCurrentTrackingId();
            return await ApplicationUtils.getUserData(username, id, trackingId);
        } catch (error) {
            console.error(`Failed to get user data for ${username}:`, error);
            Analytics.trackEvent?.('data_error', { action: 'get_user_data', username });
            throw new Error(`Could not retrieve user data. Please try again.`);
        }
    }
}

// Apply automatic tracking to all methods
export const Requests = applyTracking(RequestsBase);