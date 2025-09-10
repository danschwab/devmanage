// Dynamic Google Sheets Service selection
let GoogleSheetsService, GoogleSheetsAuth;

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
    // Dynamically import fake services
    // Note: This import must match the actual path and export names
    // If using a bundler, you may need to adjust this to static imports
    // eslint-disable-next-line no-undef
    console.warn('Running locally, using fake Google services.');
    ({ GoogleSheetsService, GoogleSheetsAuth } = await import('../../google_sheets_services/FakeGoogle.js'));
} else {
    // Use real services for production
    // eslint-disable-next-line no-undef
    ({ GoogleSheetsService, GoogleSheetsAuth } = await import('../../google_sheets_services/index.js'));
}

import { wrapMethods, invalidateCache } from '../index.js';

class database_uncached {
    /**
     * Retrieves data for a table/tab and returns as array of JS objects
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Identifier for the table (INVENTORY, PACK_LISTS, etc.)
     * @param {string} tabName - Tab name or logical identifier
     * @param {Object} [mapping] - Optional mapping for object keys to sheet headers
     * @returns {Promise<Array<Object>>} - Array of JS objects
     */
    static async getData(deps, tableId, tabName, mapping = null) {
        // Get raw sheet data from GoogleSheetsService
        const rawData = await GoogleSheetsService.getSheetData(tableId, tabName);
        //console.log('[Database] Raw data from GoogleSheetsService:', rawData);
        //console.log('[Database] Mapping provided:', mapping);
        
        // If mapping provided, transform to JS objects
        if (mapping) {
            const transformedData = GoogleSheetsService.transformSheetData(rawData, mapping);
            console.log('[Database] Transformed data:', transformedData);
            return transformedData;
        }
        // If no mapping, return raw 2D array
        return rawData;
    }
        
    /**
     * Gets all logical tabs for a table
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Identifier for the table
     * @returns {Promise<Array<{title: string, sheetId: number}>>} - List of logical tabs
     */
    static async getTabs(deps, tableId) {
        return await GoogleSheetsService.getSheetTabs(tableId);
    }
    
    /**
     * Executes a SQL-like query against logical table data
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - The table identifier
     * @param {string} query - SQL-like query string
     * @returns {Promise<Array<Object>>} Query results
     */
    static async queryData(deps, tableId, query) {
        return await GoogleSheetsService.querySheetData(tableId, query);
    }
    
    /**
     * Helper method to find a logical tab by name
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Identifier for the table
     * @param {string} tabName - Name of the tab to find
     * @returns {Promise<{title: string, sheetId: number}|null>} - The tab object or null if not found
     */
    static async findTabByName(deps, tableId, tabName) {
        const tabs = await deps.call(Database.getTabs, tableId);
        return tabs.find(tab => tab.title === tabName) || null;
    }


    /**
     * Search for an item image in Google Drive folder
     * @param {string} itemNumber - The item number to search for
     * @param {string} folderId - Google Drive folder ID containing the images
     * @returns {Promise<string|null>} Direct image URL or null if not found
     */
    static async getItemImageUrl(deps, itemNumber, folderId = '1rvWRUB38BsQJQyOPtF1JEG20qJPvTjZM') {
        console.log('Database.getItemImageUrl called with:', { itemNumber, folderId });
        
        if (!itemNumber) {
            console.log('No itemNumber provided, returning placeholder');
            return '';
        }
        
        if (typeof itemNumber !== 'string') {
            console.error('itemNumber must be a string, received:', typeof itemNumber, itemNumber);
            return '';
        }
                
        // Try different file extensions
        const extensions = ['jpg', 'jpeg', 'png', 'gif'];
        
        for (const ext of extensions) {
            const fileName = `${itemNumber}.${ext}`;
            console.log(`Searching for file: ${fileName} in folder: ${folderId}`);
            
            const file = await GoogleSheetsService.searchDriveFileInFolder(fileName, folderId);
            
            if (file && file.directImageUrl) {
                console.log(`Found image for ${itemNumber}:`, file.directImageUrl);
                return file.directImageUrl;
            }
        }
        
        console.log(`No image found for item: ${itemNumber}, returning placeholder`);
        return ''; // Return placeholder if no image found
    }


    /* MUTATION FUNCTIONS */


    /**
     * Updates data for a table/tab using JS objects
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Identifier for the table
     * @param {string} tabName - Tab name or logical identifier
     * @param {Array<Object>} updates - Array of JS objects to save
     * @param {Object} [mapping] - Optional mapping for object keys to sheet headers
     * @returns {Promise<boolean>} - Success status
     */
    static async setData(tableId, tabName, updates, mapping = null) {
        const result = await GoogleSheetsService.setSheetData(tableId, tabName, updates, mapping);
        
        // Invalidate related caches using prefix to handle custom mapped data
        invalidateCache([
            { namespace: 'database', methodName: 'getData', args: [tableId, tabName] }
        ], true);
        
        return result;
    }
    
    /**
     * Updates a single row in a table/tab using a unique identifier.
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Identifier for the table
     * @param {string} tabName - Tab name or logical identifier
     * @param {Object} update - JS object representing the row to update
     * @param {Object} [mapping] - Optional mapping for object keys to sheet headers
     * @returns {Promise<boolean>} - Success status
     */
    static async updateRow(tableId, tabName, update, mapping = null) {
        const existingData = await GoogleSheetsService.getSheetData(tableId, tabName);

        const transformedData = mapping
            ? GoogleSheetsService.transformSheetData(existingData, mapping)
            : GoogleSheetsService.sheetArrayToObjects(existingData);

        const rowIndex = transformedData.findIndex(row => {
            const identifierKey = mapping ? Object.keys(mapping).find(k => k.includes('Number') || k.includes('Id')) : 'id';
            const updateKey = Object.keys(update).find(k => k.includes('Number') || k.includes('Id')) || Object.keys(update)[0];
            return row[identifierKey] === update[updateKey];
        });
        
        if (rowIndex === -1) {
            throw new Error(`Row with identifier not found in tab ${tabName}`);
        }

        // Update the transformed row
        transformedData[rowIndex] = { ...transformedData[rowIndex], ...update };

        // Convert back to sheet format for saving
        const updatedSheetData = mapping
            ? GoogleSheetsService.reverseTransformSheetData(mapping, transformedData)
            : GoogleSheetsService.objectsToSheetArray(transformedData);

        await GoogleSheetsService.setSheetData(tableId, tabName, updatedSheetData);

        // Invalidate related caches using prefix to handle custom mapped data
        invalidateCache([
            { namespace: 'database', methodName: 'getData', args: [tableId, tabName] }
        ], true);

        return true;
    }
    
    /**
     * Hides specified logical tabs in a table
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Identifier for the table
     * @param {Array<{title: string, sheetId: number}>} tabs - Tabs to hide
     */
    static async hideTabs(tableId, tabs) {
        await GoogleSheetsService.hideTabs(tableId, tabs);
    }
    
    /**
     * Shows specified logical tabs in a table
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Identifier for the table
     * @param {Array<{title: string, sheetId: number}>} tabs - Tabs to show
     */
    static async showTabs(tableId, tabs) {
        await GoogleSheetsService.showTabs(tableId, tabs);
    }
    
    /**
     * Creates a new logical tab by copying a template or creating blank
     * @param {Object} deps - Dependency decorator for tracking calls
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
        
        // Invalidate related caches
        invalidateCache([
            { namespace: 'database', methodName: 'getTabs', args: [tableId] }
        ]);
    }
}

export const Database = wrapMethods(database_uncached, 'database', ['createTab', 'hideTabs', 'showTabs', 'setData', 'updateRow']);
