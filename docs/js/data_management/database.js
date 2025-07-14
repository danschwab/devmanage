import { GoogleSheetsService } from '../google_sheets_services/index.js';
import { CacheManager } from '../index.js';

export class Database {
    /**
     * Retrieves data from a specific range in a sheet
     * @param {string} tableId - Identifier for the table (INVENTORY, PACK_LISTS, etc.)
     * @param {string} range - Range to retrieve (e.g., 'Sheet1!A1:B10')
     * @param {boolean} useCache - Whether to use cached data if available
     * @param {string} [trackingId] - Optional tracking ID for dependency tracking
     * @returns {Promise<Array>} - The data as a 2D array
     */
    static async getData(tableId, range, useCache = true, trackingId = null) {
        // Use provided tracking ID or get current one from execution context
        trackingId = trackingId || CacheManager.getCurrentTrackingId();
        
        const cacheKey = `${tableId}:${range}`;
        
        // Check cache if allowed
        if (useCache) {
            const cachedData = CacheManager.get(
                CacheManager.NAMESPACES.SHEET_DATA, 
                cacheKey,
                trackingId
            );
            if (cachedData) return cachedData;
        }
        
        try {
            const data = await GoogleSheetsService.getSheetData(tableId, range);
            
            // Update cache
            CacheManager.set(
                CacheManager.NAMESPACES.SHEET_DATA, 
                cacheKey, 
                data, 
                CacheManager.EXPIRATIONS.MEDIUM,
                [], // No explicit dependencies
                trackingId // Pass tracking ID for automatic dependencies
            );
            
            return data;
        } catch (error) {
            console.error(`Database error retrieving ${range} from ${tableId}:`, error);
            throw new Error(`Failed to retrieve data: ${error.message}`);
        }
    }
    
    /**
     * Updates data in a sheet
     * @param {string} tableId - Identifier for the table
     * @param {string} tabName - Name of the tab
     * @param {Array|Object} updates - Updates to apply (cell updates or full-table update)
     * @returns {Promise<boolean>} - Success status
     */
    static async setData(tableId, tabName, updates) {
        try {
            const result = await GoogleSheetsService.setSheetData(tableId, tabName, updates);
            
            // Invalidate relevant caches
            CacheManager.invalidateByPrefix(CacheManager.NAMESPACES.SHEET_DATA, `${tableId}:${tabName}`);
            CacheManager.invalidateByPrefix(CacheManager.NAMESPACES.QUERY_RESULTS, `${tableId}:`);
            
            return result;
        } catch (error) {
            console.error(`Database error updating ${tabName} in ${tableId}:`, error);
            throw new Error(`Failed to update data: ${error.message}`);
        }
    }
    
    /**
     * Gets all sheet tabs for a table
     * @param {string} tableId - Identifier for the table
     * @param {boolean} useCache - Whether to use cached data if available
     * @param {string} [trackingId] - Optional tracking ID for dependency tracking
     * @returns {Promise<Array<{title: string, sheetId: number}>>} - List of sheet tabs
     */
    static async getTabs(tableId, useCache = true, trackingId = null) {
        // Use provided tracking ID or get current one from execution context
        trackingId = trackingId || CacheManager.getCurrentTrackingId();
        
        // Check cache if allowed
        if (useCache) {
            const cachedTabs = CacheManager.get(
                CacheManager.NAMESPACES.SHEET_TABS, 
                tableId,
                trackingId
            );
            if (cachedTabs) return cachedTabs;
        }
        
        try {
            const tabs = await GoogleSheetsService.getSheetTabs(tableId);
            
            // Update cache
            CacheManager.set(
                CacheManager.NAMESPACES.SHEET_TABS, 
                tableId, 
                tabs, 
                CacheManager.EXPIRATIONS.LONG,
                [],
                trackingId
            );
            
            return tabs;
        } catch (error) {
            console.error(`Database error retrieving tabs for ${tableId}:`, error);
            throw new Error(`Failed to retrieve tabs: ${error.message}`);
        }
    }
    
    /**
     * Hides specified tabs in a table
     * @param {string} tableId - Identifier for the table
     * @param {Array<{title: string, sheetId: number}>} tabs - Tabs to hide
     */
    static async hideTabs(tableId, tabs) {
        try {
            await GoogleSheetsService.hideTabs(tableId, tabs);
            
            // Invalidate cache for this table's tabs
            CacheManager.invalidate(CacheManager.NAMESPACES.SHEET_TABS, tableId);
        } catch (error) {
            console.error(`Database error hiding tabs in ${tableId}:`, error);
            throw new Error(`Failed to hide tabs: ${error.message}`);
        }
    }
    
    /**
     * Shows specified tabs in a table
     * @param {string} tableId - Identifier for the table
     * @param {Array<{title: string, sheetId: number}>} tabs - Tabs to show
     */
    static async showTabs(tableId, tabs) {
        try {
            await GoogleSheetsService.showTabs(tableId, tabs);
            
            // Invalidate cache for this table's tabs
            CacheManager.invalidate(CacheManager.NAMESPACES.SHEET_TABS, tableId);
        } catch (error) {
            console.error(`Database error showing tabs in ${tableId}:`, error);
            throw new Error(`Failed to show tabs: ${error.message}`);
        }
    }
    
    /**
     * Creates a new sheet tab by copying a template tab or creating a blank tab
     * @param {string} tableId - Identifier for the table
     * @param {{title: string, sheetId: number}|null} templateTab - Template tab to copy (null for blank tab)
     * @param {string} newTabName - Name for the new tab
     * @returns {Promise<void>}
     */
    static async createTab(tableId, templateTab, newTabName) {
        try {
            if (templateTab && templateTab.sheetId) {
                // Copy from template
                await GoogleSheetsService.copySheetTab(tableId, templateTab, newTabName);
            } else {
                // Create blank tab
                await GoogleSheetsService.createBlankTab(tableId, newTabName);
            }
            
            // Invalidate cache for this table's tabs
            CacheManager.invalidate(CacheManager.NAMESPACES.SHEET_TABS, tableId);
        } catch (error) {
            console.error(`Database error creating tab ${newTabName} in ${tableId}:`, error);
            throw new Error(`Failed to create tab: ${error.message}`);
        }
    }
    
    /**
     * Executes a SQL-like query against sheet data
     * @param {string} tableId - The table identifier
     * @param {string} query - SQL-like query string
     * @param {string} [trackingId] - Optional tracking ID for dependency tracking
     * @returns {Promise<Array<Object>>} Query results
     */
    static async queryData(tableId, query, trackingId = null) {
        // Use provided tracking ID or get current one from execution context
        trackingId = trackingId || CacheManager.getCurrentTrackingId();
        
        // Generate a cache key for this query
        const cacheKey = `${tableId}:${query}`;
        
        // Check cache first
        const cachedResults = CacheManager.get(
            CacheManager.NAMESPACES.QUERY_RESULTS, 
            cacheKey,
            trackingId
        );
        
        if (cachedResults) {
            return cachedResults;
        }
        
        try {
            // Execute the query
            const results = await GoogleSheetsService.querySheetData(tableId, query);
            
            // Cache the results
            CacheManager.set(
                CacheManager.NAMESPACES.QUERY_RESULTS,
                cacheKey,
                results,
                CacheManager.EXPIRATIONS.MEDIUM,
                [],
                trackingId
            );
            
            return results;
        } catch (error) {
            console.error(`Database error executing query on ${tableId}:`, error);
            throw new Error(`Failed to execute query: ${error.message}`);
        }
    }
    
    /**
     * Helper method to find a tab by name
     * @param {string} tableId - Identifier for the table
     * @param {string} tabName - Name of the tab to find
     * @param {string} [trackingId] - Optional tracking ID for dependency tracking
     * @returns {Promise<{title: string, sheetId: number}|null>} - The tab object or null if not found
     */
    static async findTabByName(tableId, tabName, trackingId = null) {
        const tabs = await this.getTabs(tableId, true, trackingId);
        return tabs.find(tab => tab.title === tabName) || null;
    }
    
    /**
     * Register dependencies between cache entries based on the predefined dependency map
     * @param {string} namespace - The namespace that changed
     * @param {string} key - The key that changed
     * @private
     */
    static _registerStandardDependencies(namespace, key) {
        const dependencyMap = CacheManager.getDependencyMap();
        const entry = dependencyMap[namespace];
        
        if (entry && entry.affects) {
            // Register that changes to this namespace affect the listed namespaces
            const dependencies = entry.affects.map(affectedNamespace => ({
                namespace: affectedNamespace,
                key: '*' // Wildcard to affect all keys in the namespace
            }));
            
            CacheManager.registerDependencies(namespace, key, dependencies);
        }
    }
}