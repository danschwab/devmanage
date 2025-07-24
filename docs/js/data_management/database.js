import { GoogleSheetsService } from '../google_sheets_services/index.js';
import { wrapMethods, CacheManager } from '../index.js';

class database {
    /**
     * Retrieves data from a specific range in a sheet
     * @param {string} tableId - Identifier for the table (INVENTORY, PACK_LISTS, etc.)
     * @param {string} range - Range to retrieve (e.g., 'Sheet1!A1:B10')
     * @param {boolean} useCache - Whether to use cached data if available
     * @returns {Promise<Array>} - The data as a 2D array
     */
    static async getData(tableId, range) {
        return await GoogleSheetsService.getSheetData(tableId, range);
    }
    
    /**
     * Gets all sheet tabs for a table
     * @param {string} tableId - Identifier for the table
     * @param {boolean} useCache - Whether to use cached data if available
     * @returns {Promise<Array<{title: string, sheetId: number}>>} - List of sheet tabs
     */
    static async getTabs(tableId, useCache = true) {
        return await GoogleSheetsService.getSheetTabs(tableId);
    }
    
    /**
     * Hides specified tabs in a table
     * @param {string} tableId - Identifier for the table
     * @param {Array<{title: string, sheetId: number}>} tabs - Tabs to hide
     */
    static async hideTabs(tableId, tabs) {
        await GoogleSheetsService.hideTabs(tableId, tabs);
    }
    
    /**
     * Shows specified tabs in a table
     * @param {string} tableId - Identifier for the table
     * @param {Array<{title: string, sheetId: number}>} tabs - Tabs to show
     */
    static async showTabs(tableId, tabs) {
        await GoogleSheetsService.showTabs(tableId, tabs);
    }
    
    /**
     * Creates a new sheet tab by copying a template tab or creating a blank tab
     * @param {string} tableId - Identifier for the table
     * @param {{title: string, sheetId: number}|null} templateTab - Template tab to copy (null for blank tab)
     * @param {string} newTabName - Name for the new tab
     * @returns {Promise<void>}
     */
    static async createTab(tableId, templateTab, newTabName) {
        if (templateTab && templateTab.sheetId) {
            // Copy from template
            await GoogleSheetsService.copySheetTab(tableId, templateTab, newTabName);
        } else {
            // Create blank tab
            await GoogleSheetsService.createBlankTab(tableId, newTabName);
        }
    }
    
    /**
     * Executes a SQL-like query against sheet data
     * @param {string} tableId - The table identifier
     * @param {string} query - SQL-like query string
     * @returns {Promise<Array<Object>>} Query results
     */
    static async queryData(tableId, query) {
        return await GoogleSheetsService.querySheetData(tableId, query);
    }
    
    /**
     * Helper method to find a tab by name
     * @param {string} tableId - Identifier for the table
     * @param {string} tabName - Name of the tab to find
     * @returns {Promise<{title: string, sheetId: number}|null>} - The tab object or null if not found
     */
    static async findTabByName(tableId, tabName) {
        const tabs = await database.getTabs(tableId, true);
        return tabs.find(tab => tab.title === tabName) || null;
    }
    /**
     * Updates data in a sheet
     * @param {string} tableId - Identifier for the table
     * @param {string} tabName - Name of the tab
     * @param {Array|Object} updates - Updates to apply (cell updates or full-table update)
     * @returns {Promise<boolean>} - Success status
     */
    static async setData(tableId, tabName, updates) {
        let removeRowsBelow = undefined;
        if (updates && typeof updates === 'object' && updates.removeRowsBelow !== undefined) {
            removeRowsBelow = updates.removeRowsBelow;
            // Remove the property so it's not sent as part of the update
            delete updates.removeRowsBelow;
        }
        return await GoogleSheetsService.setSheetData(tableId, tabName, updates, removeRowsBelow);
    }
}

// Mutation cache invalidation logic
const mutationKeys = ['setData'];
const getAffectedKeysFn = {
    setData: (tableId, tabName, updates) => [
        // Invalidate the actual data cache for the tab
        { namespace: 'database', key: `getData:["${tableId}","${tabName}"]` }
    ]
};

// Export
export const Database = wrapMethods(database, 'database', mutationKeys, getAffectedKeysFn);