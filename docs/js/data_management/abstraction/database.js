// Dynamic Google Sheets Service selection
let GoogleSheetsService, GoogleSheetsAuth;
let usingFakeGoogle = false;

function isLocalhost() {
    return (
        typeof window !== 'undefined' &&
        (
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.protocol === 'file:'
        )
    );
}

if (isLocalhost()) {
    // Use fake services for local development
    usingFakeGoogle = true;
    // Dynamically import fake services
    // Note: This import must match the actual path and export names
    // If using a bundler, you may need to adjust this to static imports
    // eslint-disable-next-line no-undef
    ({ GoogleSheetsService, GoogleSheetsAuth } = await import('../../google_sheets_services/FakeGoogle.js'));
} else {
    // Use real services for production
    // eslint-disable-next-line no-undef
    ({ GoogleSheetsService, GoogleSheetsAuth } = await import('../../google_sheets_services/index.js'));
}

import { wrapMethods, CacheManager } from '../index.js';

class database {
    /**
     * Retrieves data for a table/tab and returns as array of JS objects
     * @param {string} tableId - Identifier for the table (INVENTORY, PACK_LISTS, etc.)
     * @param {string} tabName - Tab name or logical identifier
     * @param {Object} [mapping] - Optional mapping for object keys to sheet headers
     * @returns {Promise<Array<Object>>} - Array of JS objects
     */
    static async getData(tableId, tabName, mapping = null) {
        // Get raw sheet data from GoogleSheetsService
        const rawData = await GoogleSheetsService.getSheetData(tableId, tabName);
        // If mapping provided, transform to JS objects
        if (mapping) {
            return GoogleSheetsService.transformSheetData(rawData, mapping);
        }
        // If no mapping, return raw 2D array
        return rawData;
    }
    
    /**
     * Gets all logical tabs for a table
     * @param {string} tableId - Identifier for the table
     * @returns {Promise<Array<{title: string, sheetId: number}>>} - List of logical tabs
     */
    static async getTabs(tableId) {
        return await GoogleSheetsService.getSheetTabs(tableId);
    }
    
    /**
     * Hides specified logical tabs in a table
     * @param {string} tableId - Identifier for the table
     * @param {Array<{title: string, sheetId: number}>} tabs - Tabs to hide
     */
    static async hideTabs(tableId, tabs) {
        await GoogleSheetsService.hideTabs(tableId, tabs);
    }
    
    /**
     * Shows specified logical tabs in a table
     * @param {string} tableId - Identifier for the table
     * @param {Array<{title: string, sheetId: number}>} tabs - Tabs to show
     */
    static async showTabs(tableId, tabs) {
        await GoogleSheetsService.showTabs(tableId, tabs);
    }
    
    /**
     * Creates a new logical tab by copying a template or creating blank
     * @param {string} tableId - Identifier for the table
     * @param {{title: string, sheetId: number}|null} templateTab - Template tab to copy (null for blank tab)
     * @param {string} newTabName - Name for the new tab
     * @returns {Promise<void>}
     */
    static async createTab(tableId, templateTab, newTabName) {
        if (templateTab && templateTab.sheetId) {
            await GoogleSheetsService.copySheetTab(tableId, templateTab, newTabName);
        } else {
            await GoogleSheetsService.createBlankTab(tableId, newTabName);
        }
    }
    
    /**
     * Executes a SQL-like query against logical table data
     * @param {string} tableId - The table identifier
     * @param {string} query - SQL-like query string
     * @returns {Promise<Array<Object>>} Query results
     */
    static async queryData(tableId, query) {
        return await GoogleSheetsService.querySheetData(tableId, query);
    }
    
    /**
     * Helper method to find a logical tab by name
     * @param {string} tableId - Identifier for the table
     * @param {string} tabName - Name of the tab to find
     * @returns {Promise<{title: string, sheetId: number}|null>} - The tab object or null if not found
     */
    static async findTabByName(tableId, tabName) {
        const tabs = await database.getTabs(tableId);
        return tabs.find(tab => tab.title === tabName) || null;
    }
    /**
     * Updates data for a table/tab using JS objects
     * @param {string} tableId - Identifier for the table
     * @param {string} tabName - Tab name or logical identifier
     * @param {Array<Object>} updates - Array of JS objects to save
     * @param {Object} [mapping] - Optional mapping for object keys to sheet headers
     * @returns {Promise<boolean>} - Success status
     */
    static async setData(tableId, tabName, updates, mapping = null) {
        // Delegate conversion to GoogleSheetsService
        return await GoogleSheetsService.setSheetData(tableId, tabName, updates, mapping);
    }
}

// Mutation cache invalidation logic
const mutationKeys = ['setData','createTab','hideTabs','showTabs'];
const getAffectedKeysFn = {
    setData: (tableId, tabName, updates) => [
        // Invalidate the actual data cache for the tab
        { namespace: 'database', key: `getData:["${tableId}","${tabName}"]` }
    ],
    createTab: (tableId, newTabName) => [
        // Invalidate the tabs cache for the table
        { namespace: 'database', key: `getTabs:["${tableId}"]` }
    ]
};

// Export
export const Database = wrapMethods(database, 'database', mutationKeys, getAffectedKeysFn);
// Optionally export which service is being used for debugging
export const DatabaseUsesFakeGoogle = usingFakeGoogle;