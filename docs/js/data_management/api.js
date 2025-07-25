import { CacheManager, Database, Analytics, InventoryUtils, PackListUtils, ProductionUtils, ApplicationUtils, wrapMethods } from '../index.js';

// Define all API methods in a single class/object
export const Requests = {
    /**
     * Fetch data from a sheet with simplified interface
     * @param {string} tableId - Table identifier (INVENTORY, PACK_LISTS, etc.)
     * @param {string} tabName - Tab name
     * @param {string} [range] - Optional range (e.g., 'A1:C10'), if omitted fetches all data
     * @returns {Promise<Array>} - 2D array of data
     */
    fetchData: async (tableId, tabName, range = null) => {
        const fullRange = range ? `${tabName}!${range}` : `${tabName}`;
        return await Database.getData(tableId, fullRange);
    },
    
    /**
     * Save data to a sheet
     * @param {string} tableId - Table identifier
     * @param {string} tabName - Tab name
     * @param {Array|Object} data - Data to save (cell updates or full table)
     * @returns {Promise<boolean>} - Success status
     */
    saveData: async (tableId, tabName, data) => {
        // Validate cell update array if applicable
        if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0].hasOwnProperty('row')) {
            data = data.filter(({row, col}) => Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0);
            if (data.length === 0) throw new Error('No valid cell updates: row/col must be non-negative integers');
        }
        return await Database.setData(tableId, tabName, data);
    },
    
    /**
     * Get all available tabs for a table
     * @param {string} tableId - Table identifier
     * @param {boolean} includeHidden - Whether to include hidden tabs in the result
     * @returns {Promise<Array<{title: string, sheetId: number}>>}
     */
    getAvailableTabs: async (tableId, includeHidden = false) => {
        const tabs = await Database.getTabs(tableId, true);
        return includeHidden ? tabs : tabs.filter(tab => !tab.title.startsWith('_'));
    },
    
    /**
     * Create a new tab based on a template
     * @param {string} tableId - Table identifier
     * @param {string} templateName - Name of the template tab
     * @param {string} newTabName - Name for the new tab
     * @returns {Promise<boolean>} - Success status
     */
    createNewTab: async (tableId, templateName, newTabName) => {
        const templateTab = await Database.findTabByName(tableId, templateName);
        if (!templateTab) throw new Error(`Template tab "${templateName}" not found`);
        await Database.createTab(tableId, templateTab, newTabName);
        return true;
    },
    
    /**
     * Show specified tabs
     * @param {string} tableId - Table identifier
     * @param {string[]} tabNames - Names of tabs to show
     */
    showTabs: async (tableId, tabNames) => {
        const allTabs = await Database.getTabs(tableId);
        const tabsToShow = allTabs.filter(tab => tabNames.includes(tab.title));
        if (tabsToShow.length === 0) return false;
        await Database.showTabs(tableId, tabsToShow);
        return true;
    },
    
    /**
     * Hide specified tabs
     * @param {string} tableId - Table identifier
     * @param {string[]} tabNames - Names of tabs to hide
     */
    hideTabs: async (tableId, tabNames) => {
        const allTabs = await Database.getTabs(tableId);
        const tabsToHide = allTabs.filter(tab => tabNames.includes(tab.title));
        if (tabsToHide.length === 0) return false;
        await Database.hideTabs(tableId, tabsToHide);
        return true;
    },
    
    /**
     * Find a tab by name
     * @param {string} tableId - Table identifier
     * @param {string} tabName - Name of the tab to find
     * @returns {Promise<{title: string, sheetId: number}|null>}
     */
    findTab: async (tableId, tabName) => {
        return await Database.findTabByName(tableId, tabName);
    },
    
    /**
     * Clear cache for specified resources
     * @param {string} [tableId] - Optional table to clear cache for
     * @param {string} [range] - Optional range to clear cache for
     */
    clearCache: async (tableId = null, range = null) => {
        if (tableId) {
            const prefix = range ? `${tableId}:${range}` : `${tableId}:`;
            CacheManager.invalidateByPrefix('sheet_data', prefix);
        } else {
            CacheManager.clearNamespace('sheet_data');
        }
        return true;
    },
    
    /**
     * Executes a SQL-like query against sheet data
     * @param {string} tableId - The table identifier
     * @param {string} query - SQL-like query string
     * @returns {Promise<Array<Object>>} Query results
     */
    queryData: async (tableId, query) => {
        return await Database.queryData(tableId, query);
    },
    
    /**
     * Extracts item quantities from a project's pack list
     * @param {string} projectIdentifier - The project identifier
     * @returns {Promise<object>} Map of itemId to quantity
     */
    getItemQuantities: async (projectIdentifier) => {
        return await PackListUtils.extractItems(projectIdentifier);
    },
    
    /**
     * Check quantities and availability for items in a project
     * @param {string} projectIdentifier - The project identifier
     * @returns {Promise<object>} Inventory status for all items in the project
     */
    checkAvailability: async (projectIdentifier) => {
        return await Analytics.checkItemAvailability(projectIdentifier);
    },
    
    /**
     * Get information about specific inventory items
     * @param {string|string[]} itemName - Item ID(s) to look up
     * @param {string|string[]} fields - Field(s) to retrieve
     * @returns {Promise<Array<Object>>} Item information
     */
    getInventoryInfo: async (itemName, fields) => {
        return await InventoryUtils.getItemInfo(itemName, fields);
    },
    
    /**
     * Get pack list content for a project
     * @param {string} projectIdentifier - The project identifier
     * @param {string} [itemColumnsStart="Pack"] - Column header where item data begins
     * @returns {Promise<Array<Object>>} Array of crate objects
     */
    getPackList: async (projectIdentifier, itemColumnsStart = "Pack") => {
        // Return the array of crate objects directly
        return await PackListUtils.getContent(projectIdentifier, itemColumnsStart);
    },
    
    /**
     * Find projects that overlap with the given project or date range
     * @param {string|Object} parameters - Project identifier or date range parameters
     * @returns {Promise<string[]>} Array of overlapping project identifiers
     */
    getOverlappingProjects: async (parameters) => {
        return await ProductionUtils.getOverlappingShows(parameters);
    },
    
    /**
     * Store user-specific application data
     * @param {string} username - The username to store data for
     * @param {string} id - The ID to associate with the data
     * @param {Array} data - Array of data to store
     * @returns {Promise<boolean>} Success status
     */
    storeUserData: async (data, username, id) => {
        return await ApplicationUtils.storeUserData(username, id, data);
    },
    
    /**
     * Retrieve user-specific application data
     * @param {string} username - The username to retrieve data for
     * @param {string} id - The ID to retrieve data for
     * @returns {Promise<Array|null>} Array of data or null if not found
     */
    getUserData: async (username, id) => {
        return await ApplicationUtils.getUserData(username, id);
    },
    
    /**
     * Get mapped inventory tab data (with default mapping).
     * @param {string} tabOrItemName - Tab name or item name to resolve tab
     * @param {Object} [mapping] - Optional mapping object
     * @returns {Promise<Array<Object>>}
     */
    getInventoryTabData: async (tabOrItemName, mapping) => {
        return await InventoryUtils.getInventoryTabData(tabOrItemName, mapping);
    },
    
    /**
     * Save mapped inventory tab data (with default mapping).
     * @param {Array<Object>} mappedData - Array of mapped inventory objects
     * @param {string} tabOrItemName - Tab name or item name to resolve tab
     * @param {Object} [mapping] - Optional mapping object
     * @returns {Promise<boolean>}
     */
    saveInventoryTabData: async (mappedData, tabOrItemName, mapping) => {
        return await InventoryUtils.saveInventoryTabData(tabOrItemName, mappedData, mapping);
    },
    
    /**
     * Save pack list data for a project
     * @param {string} projectIdentifier - The project identifier (tab name)
     * @param {Array<Object>} crates - Array of crate objects (with keys/values, Items array)
     * @returns {Promise<boolean>} Success status
     */
    savePackList: async (crates, projectIdentifier) => {
        // Pass data directly to PackListUtils.savePackList; transformation is handled there
        return await PackListUtils.savePackList(projectIdentifier, crates);
    }
};