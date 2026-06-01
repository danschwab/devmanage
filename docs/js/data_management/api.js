import { wrapMethods, Database, InventoryUtils, PackListUtils, ProductionUtils, ApplicationUtils, EditHistoryUtils, todayISOString } from './index.js';
import { authState } from '../application/utils/auth.js';

/**
 * CACHING ARCHITECTURE NOTES:
 * 
 * This API layer uses automatic caching via wrapMethods() decorator. Most methods are cached,
 * but MUTATION methods are intentionally excluded from caching.
 * 
 * MUTATION METHODS (excluded from caching):
 * - saveData
 * - createNewTab
 * - showTabs
 * - hideTabs
 * - saveInventoryTabData
 * - savePackList
 * - storeUserData
 * 
 * CRITICAL: Mutation methods must NOT:
 * 1. Accept 'deps' as first parameter
 * 2. Use deps.call() to invoke sub-functions
 * 3. Be wrapped by wrapMethods()
 * 
 * WHY: Mutation methods trigger cache invalidation through Database.setData(). If they were
 * cached or used deps.call(), it would create circular dependencies and break the invalidation
 * cascade system. The cache chain is independent from the mutation chain.
 * 
 * The cache invalidation flow:
 * 1. Mutation method calls Database.setData() (or similar)
 * 2. Database layer calls invalidateCache() with dependency info
 * 3. CacheManager cascades invalidation through dependency chain
 * 4. CacheInvalidationBus emits events for 'api' namespace
 * 5. ReactiveStores receive events and reload data
 */

// Define all API methods in a single class
class Requests_uncached {
    /**
     * Fetch data from a table/tab as JS objects
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Table identifier (INVENTORY, PACK_LISTS, etc.)
     * @param {string} tabName - Tab name
     * @param {Object} [mapping] - Optional mapping for object keys to sheet headers
     * @returns {Promise<Array<Object>>} - Array of JS objects
     */
    static async fetchData(deps, tableId, tabName, mapping = null) {
        return await deps.call(Database.getData, tableId, tabName, mapping);
    }
    
    /**
     * Save JS objects to a table/tab
     * 
     * MUTATION METHOD - Excluded from caching
     * Does NOT accept deps parameter or use deps.call()
     * Triggers cache invalidation through Database.setData()
     * 
     * @param {string} tableId - Table identifier
     * @param {string} tabName - Tab name
     * @param {Array<Object>} data - Array of JS objects to save
     * @param {Object} [mapping] - Optional mapping for object keys to sheet headers
     * @returns {Promise<boolean>} - Success status
     */
    static async saveData(tableId, tabName, data, mapping = null) {
        return await Database.setData(tableId, tabName, data, mapping);
    }
    
    /**
     * Get all available tabs for a table
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Table identifier
     * @param {boolean} includeHidden - Whether to include hidden tabs in the result
     * @returns {Promise<Array<{title: string, sheetId: number}>>}
     */
    static async getAvailableTabs(deps, tableId, includeHidden = false) {
        const tabs = await deps.call(Database.getTabs, tableId);
        return includeHidden ? tabs : tabs.filter(tab => !tab.title.startsWith('_'));
    }
    
    /**
     * Create a new tab based on a template
     * 
     * MUTATION METHOD - Excluded from caching
     * Does NOT accept deps parameter or use deps.call()
     * Calls Database methods directly to avoid circular dependencies
     * 
     * @param {string} tableId - Table identifier
     * @param {string} templateName - Name of the template tab
     * @param {string} newTabName - Name for the new tab
     * @returns {Promise<boolean>} - Success status
     */
    static async createNewTab(tableId, templateName, newTabName) {
        const templateTab = await Database.findTabByName(tableId, templateName);
        if (!templateTab) throw new Error(`Template tab "${templateName}" not found`);
        await Database.createTab(tableId, templateTab, newTabName);
        return true;
    }
    
    /**
     * Show specified tabs
     * 
     * MUTATION METHOD - Excluded from caching
     * Does NOT accept deps parameter or use deps.call()
     * Calls Database methods directly to avoid circular dependencies
     * 
     * @param {string} tableId - Table identifier
     * @param {string[]} tabNames - Names of tabs to show
     */
    static async showTabs(tableId, tabNames) {
        const allTabs = await Database.getTabs(tableId);
        const tabsToShow = allTabs.filter(tab => tabNames.includes(tab.title));
        if (tabsToShow.length === 0) return false;
        await Database.showTabs(tableId, tabsToShow);
        return true;
    }
    
    /**
     * Hide specified tabs
     * 
     * MUTATION METHOD - Excluded from caching
     * Does NOT accept deps parameter or use deps.call()
     * Calls Database methods directly to avoid circular dependencies
     * 
     * @param {string} tableId - Table identifier
     * @param {string[]} tabNames - Names of tabs to hide
     */
    static async hideTabs(tableId, tabNames) {
        const allTabs = await Database.getTabs(tableId);
        const tabsToHide = allTabs.filter(tab => tabNames.includes(tab.title));
        if (tabsToHide.length === 0) return false;
        await Database.hideTabs(tableId, tabsToHide);
        return true;
    }
    
    /**
     * Find a tab by name
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Table identifier
     * @param {string} tabName - Name of the tab to find
     * @returns {Promise<{title: string, sheetId: number}|null>}
     */
    static async findTab(deps, tableId, tabName) {
        return await deps.call(Database.findTabByName, tableId, tabName);
    }
    
    /**
     * Get headers/schema from a sheet without loading all data
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Table identifier
     * @param {string} tabName - Tab name
     * @returns {Promise<Array<string>>} - Array of column headers
     */
    static async getHeaders(deps, tableId, tabName) {
        const rawData = await deps.call(Database.getData, tableId, tabName);
        if (Array.isArray(rawData) && rawData.length > 0 && Array.isArray(rawData[0])) {
            return rawData[0]; // First row contains headers
        }
        return [];
    }
    
    /**
     * Get item headers/schema from a packlist by examining actual data
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tabName - Packlist tab name
     * @returns {Promise<Array<string>>} - Array of item column headers
     */
    static async getItemHeaders(deps, tabName) {
        const packlistData = await deps.call(PackListUtils.getContent, tabName);
        if (Array.isArray(packlistData)) {
            // Find the first crate that has items with actual data
            for (const crate of packlistData) {
                if (Array.isArray(crate.Items) && crate.Items.length > 0) {
                    return Object.keys(crate.Items[0]);
                }
            }
        }
        // Return default schema if no data found
        return;
    }
    
    /**
     * Executes a SQL-like query against sheet data
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - The table identifier
     * @param {string} query - SQL-like query string
     * @returns {Promise<Array<Object>>} Query results
     */
    static async queryData(deps, tableId, query) {
        return await deps.call(Database.queryData, tableId, query);
    }
    
    /**
     * Extracts item quantities from a project's pack list
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} projectIdentifier - The project identifier
     * @returns {Promise<object>} Map of itemId to quantity
     */
    static async getItemQuantities(deps, projectIdentifier) {
        return await deps.call(PackListUtils.extractItems, projectIdentifier);
    }
    
    /**
     * Check quantities and availability for items in a project
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} projectIdentifier - The project identifier
     * @returns {Promise<object>} Inventory status for all items in the project
     */
    static async checkAvailability(deps, projectIdentifier) {
        return await deps.call(InventoryUtils.checkItemAvailability, projectIdentifier);
    }
    
    /**
     * Check item quantities for a project (with overlapping shows analysis)
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} projectIdentifier - The project identifier
     * @returns {Promise<object>} Detailed inventory status for all items
     */
    static async checkItemQuantities(deps, projectIdentifier) {
        return await deps.call(PackListUtils.checkItemQuantities, projectIdentifier);
    }
    
    /**
     * Get information about specific inventory items
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string|string[]} itemName - Item ID(s) to look up
     * @param {string|string[]} fields - Field(s) to retrieve
     * @returns {Promise<Array<Object>>} Item information
     */
    static async getInventoryInfo(deps, itemName, fields, referenceDate) {
        return await deps.call(InventoryUtils.getItemInfo, itemName, fields, referenceDate);
    }
    
    /**
     * Get pack list content for a project
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} projectIdentifier - The project identifier
     * @param {string} [itemColumnsStart="Pack"] - Column header where item data begins
     * @returns {Promise<Array<Object>>} Array of crate objects
     */
    static async getPackList(deps, projectIdentifier, itemColumnsStart = "Pack") {
        // Return the array of crate objects directly
        return await deps.call(PackListUtils.getContent, projectIdentifier, itemColumnsStart);
    }
    
    /**
     * Get filtered packlists based on schedule parameters
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {Object|string} filter - Filter parameters (null, {type: 'show-all'}, or schedule filter)
     * @returns {Promise<Array<Object>>} Array of packlist tab objects
     */
    static async getPacklists(deps, filter = null) {
        console.log('[Requests.getPacklists] Called with filter:', filter);
        const result = await deps.call(PackListUtils.getPacklists, filter);
        console.log('[Requests.getPacklists] Returning', result.length, 'packlists');
        return result;
    }
    
    /**
     * Find projects that overlap with the given project or date range
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string|Object} parameters - Project identifier or date range parameters
     * @returns {Promise<string[]>} Array of overlapping project identifiers
     */
    static async getOverlappingProjects(deps, parameters) {
        return await deps.call(ProductionUtils.getOverlappingShows, parameters);
    }
    
    /**
     * Store user-specific application data
     * 
     * MUTATION METHOD - Excluded from caching
     * Does NOT accept deps parameter or use deps.call()
     * Calls ApplicationUtils directly to trigger cache invalidation
     * 
     * @param {Array} data - Array of data to store
     * @param {string} username - The username to store data for
     * @param {string} id - The ID to associate with the data
     * @returns {Promise<boolean>} Success status
     */
    static async storeUserData(data, username, id) {
        return await ApplicationUtils.storeUserData(username, id, data);
    }
    
    /**
     * Retrieve user-specific application data
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} username - The username to retrieve data for
     * @param {string} id - The ID to retrieve data for
     * @returns {Promise<Array|null>} Array of data or null if not found
     */
    static async getUserData(deps, username, id) {
        return await deps.call(ApplicationUtils.getUserData, username, id);
    }

    /**
     * Retrieve the most recent user data entry by ID prefix.
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} username - The username to retrieve data for
     * @param {string} keyPrefix - Prefix to match against stored IDs
     * @returns {{id: string, value: *}|null} Matching entry or null if no match exists
     */
    static async getUserDataByPrefix(deps, username, keyPrefix) {
        return await deps.call(ApplicationUtils.getUserDataByPrefix, username, keyPrefix);
    }
    
    /**
     * Check if a user data key or key prefix exists
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} username - The username to check for
     * @param {string} keyOrPrefix - The exact key or prefix to check for
     * @param {boolean} prefixMatch - If true, checks for keys starting with keyOrPrefix
     * @returns {Promise<boolean>} True if key/prefix exists
     */
    static async hasUserDataKey(deps, username, keyOrPrefix, prefixMatch = false) {
        return await deps.call(ApplicationUtils.hasUserDataKey, username, keyOrPrefix, prefixMatch);
    }
    
    /**
     * Lock a spreadsheet tab for a user
     * 
     * MUTATION METHOD - Excluded from caching
     * Does NOT accept deps parameter or use deps.call()
     * Calls ApplicationUtils directly to trigger cache invalidation
     * 
     * @param {string} spreadsheet - The spreadsheet name (e.g., 'INVENTORY', 'PACK_LISTS')
     * @param {string} tab - The tab name
     * @param {string} user - The user email claiming the lock
     * @returns {Promise<boolean>} Success status
     */
    static async lockSheet(spreadsheet, tab, user, deviceId = null) {
        return await ApplicationUtils.lockSheet(spreadsheet, tab, user, deviceId);
    }
    
    /**
     * Unlock a spreadsheet tab
     * 
     * MUTATION METHOD - Excluded from caching
     * Does NOT accept deps parameter or use deps.call()
     * Calls ApplicationUtils directly to trigger cache invalidation
     * 
     * @param {string} spreadsheet - The spreadsheet name
     * @param {string} tab - The tab name
     * @param {string} user - The user email releasing the lock
     * @returns {Promise<boolean>} Success status
     */
    static async unlockSheet(spreadsheet, tab, user) {
        //console.log(`[api.unlockSheet] Called with spreadsheet=${spreadsheet}, tab=${tab}, user=${user}`);
        const result = await ApplicationUtils.unlockSheet(spreadsheet, tab, user);
        //console.log(`[api.unlockSheet] ApplicationUtils.unlockSheet returned:`, result);
        return result;
    }
    
    /**
     * Force unlock a spreadsheet tab (admin override)
     * This bypasses user validation and backs up any autosaved data before removing it
     * 
     * MUTATION METHOD - Excluded from caching
     * Does NOT accept deps parameter or use deps.call()
     * 
     * @param {string} spreadsheet - The spreadsheet name (e.g., 'INVENTORY', 'PACK_LISTS')
     * @param {string} tab - The tab name (e.g., 'FURNITURE', 'ATSC 2025 NAB')
     * @param {string} reason - Optional reason for force unlock (for logging/audit)
     * @returns {Promise<Object>} Result object { success, backupCount, deletedCount, lockOwner, message }
     */
    static async forceUnlockSheet(spreadsheet, tab, reason = '') {
        //console.log(`[api.forceUnlockSheet] Called with spreadsheet=${spreadsheet}, tab=${tab}, reason=${reason}`);
        //console.log(`[api.forceUnlockSheet] ApplicationUtils type:`, typeof ApplicationUtils);
        //console.log(`[api.forceUnlockSheet] ApplicationUtils.forceUnlockSheet type:`, typeof ApplicationUtils.forceUnlockSheet);
        const result = await ApplicationUtils.forceUnlockSheet(spreadsheet, tab, reason);
        //console.log(`[api.forceUnlockSheet] ApplicationUtils.forceUnlockSheet returned:`, result);
        return result;
    }
    
    /**
     * Get lock details for a spreadsheet tab
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} spreadsheet - The spreadsheet name
     * @param {string} tab - The tab name
     * @param {string} [currentUser] - Optional current user email to filter out their own locks
     * @returns {Promise<Object|null>} Lock details or null if not locked
     */
    static async getSheetLock(deps, spreadsheet, tab, currentUser = null) {
        return await deps.call(ApplicationUtils.getSheetLock, spreadsheet, tab, currentUser);
    }
    
    /**
     * Get lock status for a packlist (specialized for analysis pipeline)
     * 
     * PASS-THROUGH METHOD - Not wrapped, calls already-wrapped ApplicationUtils
     * Does NOT accept deps parameter - delegates to ApplicationUtils which handles caching
     * 
     * This is a convenience wrapper for getSheetLock that's designed for use
     * in analysis configurations where only the tab name is provided.
     * 
     * @param {string} tabName - The packlist tab name
     * @param {string} [currentUser] - Optional current user email to filter out their own locks
     * @returns {Promise<Object|null>} Lock details or null if not locked (or locked by current user)
     */
    static async getPacklistLock(deps, tabName, currentUser = null) {
        const result = await deps.call(ApplicationUtils.getSheetLock, 'PACK_LISTS', tabName, currentUser);
        //console.log(`[Requests.getPacklistLock] Lock result for "${tabName}":`, result);
        return result;
    }
    
    /**
     * Get lock status for an inventory category (specialized for analysis pipeline)
     * 
     * PASS-THROUGH METHOD - Not wrapped, calls already-wrapped ApplicationUtils
     * Does NOT accept deps parameter - delegates to ApplicationUtils which handles caching
     * 
     * This is a convenience wrapper for getSheetLock that's designed for use
     * in analysis configurations where only the tab name is provided.
     * 
     * @param {string} tabName - The inventory category tab name
     * @param {string} [currentUser] - Optional current user email to filter out their own locks
     * @returns {Promise<Object|null>} Lock details or null if not locked (or locked by current user)
     */
    static async getInventoryLock(deps, tabName, currentUser = null) {
        const result = await deps.call(ApplicationUtils.getSheetLock, 'INVENTORY', tabName, currentUser);
        //console.log(`[Requests.getInventoryLock] Lock result for "${tabName}":`, result);
        return result;
    }
    
    /**
     * Get mapped inventory tab data (with default mapping and optional filters).
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tabOrItemName - Tab name or item name to resolve tab
     * @param {Object} [mapping] - Optional mapping object
     * @param {Object} [filters] - Optional filter parameters
     * @returns {Promise<Array<Object>>}
     */
    static async getInventoryTabData(deps, tabOrItemName, mapping, filters, referenceDate) {
        return await deps.call(InventoryUtils.getInventoryTabData, tabOrItemName, mapping, filters, referenceDate);
    }
    
    /**
     * Get all inventory data from all tabs (excluding INDEX)
     * Each item is tagged with its category tab
     * @param {Object} deps - Dependency decorator for tracking calls
     * @returns {Promise<Array<Object>>} - All inventory items with tab property
     */
    static async getAllInventoryData(deps) {
        // Get all available tabs for INVENTORY
        const tabs = await deps.call(Requests.getAvailableTabs, 'INVENTORY');
        const inventoryTabs = tabs.filter(tab => tab.title !== 'INDEX');
        
        const allData = [];
        
        // Load data from each tab
        for (const tab of inventoryTabs) {
            try {
                const tabData = await deps.call(InventoryUtils.getInventoryTabData, tab.title, undefined, undefined, undefined);
                
                // Add tab information to each item
                if (Array.isArray(tabData)) {
                    const itemsWithTab = tabData.map(item => ({
                        ...item,
                        tab: tab.title
                    }));
                    allData.push(...itemsWithTab);
                }
            } catch (tabError) {
                console.warn(`[API] Failed to load data from tab ${tab.title}:`, tabError);
                // Continue loading other tabs even if one fails
            }
        }
        
        return allData;
    }
    
    /**
     * Save mapped inventory tab data (with default mapping and optional filters).
     * 
     * MUTATION METHOD - Excluded from caching
     * Does NOT accept deps parameter or use deps.call()
     * Triggers cache invalidation through InventoryUtils.saveInventoryTabData()
     * 
     * @param {Array<Object>} mappedData - Array of mapped inventory objects
     * @param {string} tabOrItemName - Tab name or item name to resolve tab
     * @param {Object} [mapping] - Optional mapping object
     * @param {Object} [filters] - Optional filter parameters
     * @returns {Promise<boolean>}
     */
    static async saveInventoryTabData(mappedData, tabOrItemName, mapping, filters, referenceDate, options = {}) {
        const username = authState.user?.email || null;
        const { scheduledDate, note, ...rest } = options;
        return await InventoryUtils.saveInventoryTabData(mappedData, tabOrItemName, mapping, filters, username, {
            source: 'web',
            scheduledDate,
            note,
            ...rest
        });
    }
    
    /**
     * Save pack list data for a project
     * 
     * MUTATION METHOD - Excluded from caching
     * Does NOT accept deps parameter or use deps.call()
     * Triggers cache invalidation through PackListUtils.savePackList()
     * 
     * @param {Array<Object>} crates - Array of crate objects (with keys/values, Items array)
     * @param {string} projectIdentifier - The project identifier (tab name)
     * @returns {Promise<boolean>} Success status
     */
    static async savePackList(crates, projectIdentifier) {
        console.log("API.savePackList called for project:", projectIdentifier);
        const username = authState.user?.email || null;
        // Pass data directly to PackListUtils.savePackList; transformation is handled there
        return await PackListUtils.savePackList(projectIdentifier, crates, null, username, {
            source: 'web'
        });
    }

    /**
     * Get production schedule data for the table (all, or filtered by overlap params and optional filters).
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {Object|string} [parameters] - Optional: date range or show identifier
     * @param {Object} [filters] - Optional filter parameters
     * @returns {Promise<Array<Object>>}
     */
    static async getProductionScheduleData(deps, parameters = null, filters = null) {
        return await deps.call(ProductionUtils.getOverlappingShows, parameters, filters);
    }

    /**
     * Compute Identifier from client, year, and show data
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} showName - The name of the show
     * @param {string} clientName - The name of the client
     * @param {number} year - The year of the show
     * @returns {Promise<string>} The computed identifier
     */
    static async computeIdentifier(deps, showName, clientName, year) {
        return deps.call(ProductionUtils.computeIdentifier, showName, clientName, year);
    }

    /**
     * Analyze a schedule row's client/show value against reference index data.
     * Returns a clickable alert object when attention is needed, otherwise null.
     * @param {Object} deps
     * @param {string} rawName
     * @param {'client'|'show'} referenceType
     * @returns {Promise<Object|null>}
     */
    static async checkScheduleReferenceState(deps, rawName, referenceType) {
        return await deps.call(ProductionUtils.checkReferenceNameState, rawName, referenceType);
    }

    /**
     * Build modal resolution options for a schedule client/show reference value.
     * @param {Object} deps
     * @param {'client'|'show'} referenceType
     * @param {string} rawValue
     * @param {boolean} includeAllCandidates
     * @returns {Promise<{referenceType:string, rawValue:string, options:Array<Object>}>}
     */
    static async getScheduleReferenceResolutionOptions(deps, referenceType, rawValue, includeAllCandidates = false) {
        return await deps.call(ProductionUtils.getReferenceResolutionOptions, referenceType, rawValue, includeAllCandidates);
    }

    /**
     * Ensure CACHE index rows exist for client/show values found in schedule rows.
     * Mutation — uncached.
     * @param {Array<Object>} scheduleRows - Rows containing Client and Show fields
     * @returns {Promise<{clientsAdded:number, showsAdded:number}>}
     */
    static async ensureScheduleReferenceRows(scheduleRows) {
        return await ProductionUtils.ensureScheduleReferenceRows(scheduleRows);
    }

    /**
     * Update exactly one abbreviation cell in CACHE reference tabs.
     * Mutation — uncached.
     * @param {'Clients'|'Shows'} referenceTab
     * @param {string} name
     * @param {string} abbreviation
     * @returns {Promise<{updated:boolean, addedRow:boolean, rowNumber:number|null}>}
     */
    static async updateScheduleReferenceAbbreviation(referenceTab, name, abbreviation) {
        return await ProductionUtils.updateReferenceAbbreviation(referenceTab, name, abbreviation);
    }

    /**
     * Add a new canonical client/show reference name.
     * Mutation — uncached.
     * @param {'client'|'show'} referenceType
     * @param {string} name
     * @returns {Promise<{added:boolean,rowNumber:number|null}>}
     */
    static async addScheduleReferenceName(referenceType, name) {
        const referenceTab = referenceType === 'show' ? 'Shows' : 'Clients';
        return await ProductionUtils.addReferenceName(referenceTab, name);
    }

    /**
     * Append an abbreviation token to an indexed client/show.
     * Mutation — uncached.
     * @param {'client'|'show'} referenceType
     * @param {string} canonicalName
     * @param {string} abbreviation
     * @returns {Promise<{updated:boolean,addedRow:boolean,rowNumber:number|null,abbreviations:string}>}
     */
    static async appendScheduleReferenceAbbreviation(referenceType, canonicalName, abbreviation) {
        const referenceTab = referenceType === 'show' ? 'Shows' : 'Clients';
        return await ProductionUtils.appendReferenceAbbreviation(referenceTab, canonicalName, abbreviation);
    }

    /**
     * Add a custom canonical client/show name and attach the unresolved value as an abbreviation.
     * Mutation — uncached.
     * @param {'client'|'show'} referenceType
     * @param {string} canonicalName
     * @param {string} abbreviation
     * @returns {Promise<{applied:boolean,addedRow:boolean,rowNumber:number|null,canonicalName:string,abbreviation:string,conflict:Object|null}>}
     */
    static async addCustomScheduleReferenceEntry(referenceType, canonicalName, abbreviation) {
        return await ProductionUtils.addCustomReferenceEntry(referenceType, canonicalName, abbreviation);
    }

    /**
     * Get show details by project identifier
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} identifier - Project identifier (e.g., "LOCKHEED MARTIN 2025 NGAUS")
     * @returns {Promise<Object|null>} Show details object or null if not found
     */
    static async getShowDetails(deps, identifier) {
        return await deps.call(ProductionUtils.getShowDetails, identifier);
    }

    /**
     * Get the ship date for a project as an ISO date string (YYYY-MM-DD).
     * @param {Object} deps
     * @param {string} projectIdentifier
     * @returns {Promise<string|null>}
     */
    static async getProjectShipDate(deps, projectIdentifier) {
        return await deps.call(ProductionUtils.getProjectShipDate, projectIdentifier);
    }

    static async getProjectReturnDate(deps, projectIdentifier) {
        return await deps.call(ProductionUtils.getProjectReturnDate, projectIdentifier);
    }

    /**
     * Get a full item timeline for a date window.
     * Rows: inventory changes, scheduled changes, show ship/return events.
     * @param {Object} deps
     * @param {string} itemId - Item identifier (e.g. "F-101")
     * @param {string} startDate - ISO date string (YYYY-MM-DD), window start
     * @param {string} endDate - ISO date string (YYYY-MM-DD), window end
     * @returns {Promise<Array<{date, event, note, change, quantity}>>}
     */
    static async getItemTimeline(deps, itemId, startDate, endDate) {
        return await deps.call(InventoryUtils.getItemTimeline, itemId, startDate, endDate);
    }

    /**
     * Get the minimum inventory quantity for an item over a date range.
     * @param {Object} deps
     * @param {string} itemId
     * @param {string|null} startDate - ISO date string (YYYY-MM-DD)
     * @param {string|null} endDate - ISO date string (YYYY-MM-DD)
     * @returns {Promise<number|null>}
     */
    static async getItemMinQuantityInRange(deps, itemId, startDate, endDate) {
        return await deps.call(InventoryUtils.getItemMinQuantityInRange, itemId, startDate, endDate);
    }

    /**
     * Check if a packlist exists for a schedule row
     * Used by reactive store analysis to enrich schedule data with packlist information
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {Object} scheduleRow - Full schedule row object with Show, Client, Year properties
     * @returns {Promise<Object>} Object with { exists: boolean, identifier: string|null }
     */
    static async checkPacklistExists(deps, rowData) {
        // Compute the identifier from the extracted columns
        const identifier = await deps.call(ProductionUtils.computeIdentifier, rowData.Show, rowData.Client, rowData.Year);
        
        // Get available tabs and check if packlist exists
        const availableTabs = await deps.call(Database.getTabs, 'PACK_LISTS');
        const tab = await deps.call(ProductionUtils.findPackListTab, identifier, availableTabs);
        
        return {
            exists: !!tab,
            identifier: identifier
        };
    }

    /**
     * Guess ship date if missing based on other date fields
     * Used by reactive store analysis to fill in missing ship dates
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {Object} scheduleRow - Full schedule row object
     * @returns {Promise<string|undefined>} Guessed ship date or undefined (to preserve existing)
     */
    static async guessShipDate(deps, rowData) {
        // Only guess if Ship field is empty or null
        if (!rowData.Ship || rowData.Ship.toString().trim() === '') {
            return await deps.call(ProductionUtils.guessShipDate, rowData);
        }
        // Return undefined to preserve existing ship date
        return undefined;
    }

    /**
     * Get item image URL from Google Drive
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} itemNumber - The item number to search for
     * @returns {Promise<string|null>} Direct image URL or null if not found
     */
    static async getItemImageUrl(deps, itemNumber) {
        return await deps.call(Database.getItemImageUrl, itemNumber);
    }

    /**
     * Get the tab name for a specific item
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} itemName - The item name/ID to search for
     * @returns {Promise<string|null>} Tab name or null if not found
     */
    static async getTabNameForItem(deps, itemName) {
        return await deps.call(InventoryUtils.getTabNameForItem, itemName);
    }

    /**
     * Extract item number from text using regex
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} text - Text to search for item number
     * @returns {Promise<string|null>} Item number or null if not found
     */
    static async extractItemNumber(deps, text) {
        const extracted = await deps.call(PackListUtils.extractItemFromText, text);
        return extracted.itemNumber;
    }

    /**
     * Extract quantity from text using regex
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} text - Text to search for quantity
     * @returns {Promise<number>} Quantity found or 1 if no quantity specified
     */
    static async extractQuantity(deps, text) {
        const extracted = await deps.call(PackListUtils.extractItemFromText, text);
        return extracted.quantity;
    }

    /**
     * Extract hardware item information from text by checking against HARDWARE inventory
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} text - Text to extract hardware item information from
     * @returns {Promise<Object>} Object with {quantity: number, itemNumber: string|null, description: string}
     */
    static async extractHardwareFromText(deps, text) {
        return await deps.call(PackListUtils.extractHardwareFromText, text);
    }

    /**
     * Compare item description with inventory description and return alert if mismatch
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {Object} item - Item object from packlist
     * @param {string} item['Extracted Item'] - The item number to look up in inventory
     * @param {string} item.Description - The current item description to compare
     * @param {string} item['Packing/shop notes'] - Alternative source for description
     * @returns {Promise<Object|null>} Alert object if match is poor, null if good match
     */
    static async checkDescriptionMatch(deps, itemData) {
        // Extract item number and description from the extracted columns
        const itemNumber = itemData['Extracted Item'];
        const description = itemData.Description || itemData['Packing/shop notes'] || '';
        
        if (!itemNumber || !description) {
            return null;
        }
        
        // Get comparison result from business logic layer
        const result = await deps.call(PackListUtils.checkDescriptionMatch, itemNumber, description);
        
        if (!result) {
            return null;
        }
        
        // Build alert object based on comparison result
        if (!result.inventoryFound) {
            return {
                type: 'item warning',
                color: 'purple',
                clickable: true,
                message: `No inventory description`,
                score: 0,
                error: result.error
            };
        }

        const color = result.score < 0.5 ? 'purple' : 'white';

        // Return alert if match is less than 100%
        if (result.score < 1) {
            return {
                type: 'description mismatch',
                color: color,
                clickable: true,
                message: `Description mismatch`,
                score: result.score,
                packlistDescription: result.packlistDescription,
                inventoryDescription: result.inventoryDescription
            };
        }
        
        // Good match, no alert needed
        return null;
    }

    /**
     * Check edit history source timeline and create an alert for CAD-overwritten rows.
     * Condition: most recent edit source is CAD and a prior web/app edit exists.
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string|Object} rawHistory - EditHistory string or parsed object
     * @returns {Promise<Object|null>} Alert object for AppData or null
     */
    static async checkCadSourceHistory(deps, rawHistory) {
        if (!rawHistory) {
            return null;
        }

        let parsedHistory;
        if (typeof rawHistory === 'string') {
            try {
                parsedHistory = JSON.parse(rawHistory);
            } catch (error) {
                return null;
            }
        } else if (typeof rawHistory === 'object') {
            parsedHistory = rawHistory;
        } else {
            return null;
        }

        const history = Array.isArray(parsedHistory?.h) ? parsedHistory.h : [];
        if (history.length === 0) {
            return null;
        }

        const normalizeSource = (entry) => {
            const sourceValue = String(entry?.s || entry?.source || 'web').toLowerCase();
            if (sourceValue === 'app') return 'web';
            return sourceValue;
        };

        const mostRecent = history[0];
        const mostRecentSource = normalizeSource(mostRecent);
        if (mostRecentSource !== 'cad') {
            return null;
        }

        const hasPriorWebOrAppEdit = history
            .slice(1)
            .some(entry => normalizeSource(entry) === 'web');

        if (!hasPriorWebOrAppEdit) {
            return null;
        }

        // CAD block is contiguous from newest entry while source is cad.
        const leadingCadEntries = [];
        for (const entry of history) {
            if (normalizeSource(entry) === 'cad') {
                leadingCadEntries.push(entry);
            } else {
                break;
            }
        }

        // Find the most recent web/app edit before any cad changes.
        const previousWebEntry = history
            .slice(leadingCadEntries.length)
            .find(entry => normalizeSource(entry) === 'web') || null;

        const previousWebSummary = previousWebEntry
            ? `${previousWebEntry.u || 'unknown'} at ${EditHistoryUtils.formatTimestampHuman(previousWebEntry.t)}`
            : 'unknown';

        // To restore pre-CAD state, apply old values from leading CAD entries newest->oldest.
        const restoreChanges = [];
        leadingCadEntries.forEach(entry => {
            if (Array.isArray(entry?.c)) {
                entry.c.forEach(change => {
                    if (change && change.n !== undefined) {
                        restoreChanges.push({ n: change.n, o: change.o });
                    }
                });
            }
        });

        return {
            type: 'cad-source-change',
            color: 'yellow',
            clickable: true,
            message: `changed in cad by ${mostRecent?.u || 'unknown'}`,
            cadUser: mostRecent?.u || 'unknown',
            previousWebSummary,
            previousWebEntry,
            restoreChanges,
            sourceTimeline: history.map(entry => ({
                s: normalizeSource(entry),
                u: entry?.u || 'unknown',
                t: entry?.t || null
            }))
        };
    }

    /**
     * Get item quantities summary for a project (transformed to table format)
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} projectIdentifier - The project identifier
     * @returns {Promise<Array<Object>>} Array of item objects for table display
     */
    static async getItemQuantitiesSummary(deps, projectIdentifier) {
        //sleep for a long time to simulate loading
        return await deps.call(PackListUtils.getItemQuantitiesSummary, projectIdentifier);
    }

    /**
     * Get item quantities summary for multiple shows based on search parameters
     * Finds shows matching the search criteria, then extracts items from them
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {Object|Array} filter - Schedule filter parameters (e.g., { dateFilters: [...] }) or legacy array of identifiers
     * @param {Object|string} searchParams - Search parameters for text filters, or legacy itemCategoryFilter
     * @param {string|undefined} itemCategoryFilter - Optional category filter (new signature) or undefined
     * @returns {Promise<Array<Object>>} Array of item objects with quantities per show
     */
    static async getMultipleShowsItemsSummary(deps, filter = null, searchParams = null, itemCategoryFilter = undefined, includeEmptyShows = true) {
        // Legacy signature: (deps, projectIdentifiers, itemCategoryFilter)
        if (Array.isArray(filter)) {
            return await deps.call(PackListUtils.extractItemsFromMultipleShows, filter, searchParams);
        }
        
        // New signature: (deps, filterParams, searchParams, itemCategoryFilter)
        // Find all shows matching the search criteria
        const shows = await deps.call(ProductionUtils.getOverlappingShows, filter, searchParams);
        
        // Extract identifiers from shows
        let projectIdentifiers = shows
            .map(s => s.Identifier || null)
            .filter(id => id);
        
        // If some shows don't have identifiers, compute them
        if (projectIdentifiers.length < shows.length) {
            const computedIdentifiers = await Promise.all(
                shows.map(async (s) => {
                    if (s.Identifier) return s.Identifier;
                    // Compute identifier via API if not present
                    if (s.Show && s.Client && s.Year) {
                        return await deps.call(ProductionUtils.computeIdentifier, s.Show, s.Client, parseInt(s.Year));
                    }
                    return null;
                })
            );
            projectIdentifiers = computedIdentifiers.filter(id => id);
        }
        
        // Extract items from the identified shows
        // Convert string filter to array as extractItemsFromMultipleShows expects an array
        const categoryFilterArray = itemCategoryFilter ? [itemCategoryFilter] : undefined;
        return await deps.call(PackListUtils.extractItemsFromMultipleShows, projectIdentifiers, categoryFilterArray, includeEmptyShows);
    }

    /**
     * Get packlist summary description
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} projectIdentifier - The project identifier (tab name)
     * @returns {Promise<string>} Formatted description string
     */
    static async getPacklistDescription(deps, projectIdentifier) {
        const summary = await deps.call(PackListUtils.getPacklistSummary, projectIdentifier);
        
        if (summary.totalCrates === 0 && summary.totalItems === 0) {
            return 'Empty packlist';
        }

        const parts = [];
        
        if (summary.totalCrates > 0) {
            parts.push(`${summary.totalCrates} crate${summary.totalCrates !== 1 ? 's' : ''}`);
        }
        
        if (summary.itemCount > 0) {
            parts.push(`${summary.itemCount} unique item${summary.itemCount !== 1 ? 's' : ''}`);
        }
        
        if (summary.totalItems > 0) {
            parts.push(`${summary.totalItems} total item${summary.totalItems !== 1 ? 's' : ''}`);
        }

        return parts.join('<br>');
    }

    /**
     * Get inventory quantity for a specific item
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} itemId - The item ID to look up
     * @returns {Promise<number|null>} Available inventory quantity, or null if item not found in inventory
     */
    static async getItemInventoryQuantity(deps, itemId, referenceDate) {
        return await deps.call(PackListUtils.getItemInventoryQuantity, itemId, referenceDate);
    }

    /**
     * Compute inventory report summary for a single item across a set of shows.
     * Returns startDate, endDate, inventoryQty, and minQty (worst-case remaining).
     * @param {Object} deps
     * @param {string} itemId
     * @param {Object} shows - Map of { showIdentifier: qty }
     * @returns {Promise<{startDate: string|null, endDate: string|null, inventoryQty: number|null, minQty: number|null}>}
     */
    static async getItemReportSummary(deps, rowData) {
        return await deps.call(InventoryUtils.getItemReportSummary, rowData);
    }

    /**
     * Get overlapping projects that use a specific item
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} currentProjectId - Current project identifier
     * @param {string} itemId - Item ID to check for conflicts
     * @returns {Promise<Array<string>>} Array of overlapping project identifiers that use this item
     */
    static async getItemOverlappingShows(deps, currentProjectId, itemId) {
        return await deps.call(PackListUtils.getItemOverlappingShows, currentProjectId, itemId);
    }

    /**
     * Calculate remaining quantity for an item based on inventory, current usage, and overlapping shows
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} currentProjectId - Current project identifier
     * @param {string} itemId - Item ID to calculate remaining quantity for
     * @returns {Promise<number|null>} Remaining available quantity, or null if item not found in inventory
     */
    static async calculateRemainingQuantity(deps, currentProjectId, itemId, referenceDate) {
        return await deps.call(PackListUtils.calculateRemainingQuantity, currentProjectId, itemId, referenceDate);
    }

    /**
     * Check inventory levels for an item and return alert if low/shortage
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {Object} item - Item object from packlist
     * @param {string} item['Extracted Item'] - The item number to check
     * @param {string} currentProjectId - Current project identifier
     * @returns {Promise<Object|null>} Alert object if inventory is low/shortage, null if sufficient
     */
    static async checkInventoryLevel(deps, item, currentProjectId) {
        // item is the full item object (needed for all fields for context)
        const itemNumber = item['Extracted Item'];
        
        if (!itemNumber || !currentProjectId) {
            return null;
        }
        
        try {
            // Resolve ship date so remaining quantity reflects inventory at time of packing
            const shipDate = await deps.call(ProductionUtils.getProjectShipDate, currentProjectId);
            const referenceDate = shipDate || todayISOString();

            // Get remaining quantity from business logic layer
            const remaining = await deps.call(PackListUtils.calculateRemainingQuantity, currentProjectId, itemNumber, referenceDate);
            
            // Check if item not found in inventory
            if (remaining === null) {
                return {
                    type: 'item not found',
                    color: 'yellow',
                    clickable: true,
                    message: 'Not in inventory',
                    remaining: null
                };
            }
            
            // Build alert object based on inventory level
            if (remaining < 0) {
                return {
                    type: 'item shortage',
                    color: 'red',
                    clickable: true,
                    message: `Shortage: ${Math.abs(remaining)} units short`,
                    remaining
                };
            } else if (remaining === 0) {
                return {
                    type: 'item warning',
                    color: 'yellow',
                    clickable: true,
                    message: 'No inventory buffer',
                    remaining
                };
            } else if (remaining <= 2) {
                return {
                    type: 'low-inventory',
                    color: 'white',
                    clickable: true,
                    message: `Low: ${remaining} remaining`,
                    remaining
                };
            }
            
            // Sufficient inventory, no alert needed
            return null;
        } catch (error) {
            console.error(`Error checking inventory for ${itemNumber}:`, error);
            return null;
        }
    }

    /**
     * Get full item description from inventory
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} itemId - The item identifier
     * @returns {Promise<string>} Full item description
     */
    static async getItemDescription(deps, itemId, referenceDate) {
        return await deps.call(InventoryUtils.getItemDescription, itemId, referenceDate);
    }

    /**
     * Get inventory rows that have a pending entry matching the given effective date.
     * Used to populate the scheduled-change editor modal.
     * @param {Object} deps
     * @param {string} tabOrItemName
     * @param {number} effectiveDateDeciseconds
     * @param {Object} [mapping]
     * @returns {Promise<Array<Object>>}
     */
    static async getInventoryRowsForPendingEntry(deps, tabOrItemName, effectiveDateDeciseconds, mapping) {
        return await deps.call(InventoryUtils.getInventoryRowsForPendingEntry, tabOrItemName, effectiveDateDeciseconds, mapping);
    }

    /**
     * Check and apply any pending inventory changes due today or earlier.
     * Mutation — uncached. Saves the tab if any changes were applied.
     * @param {string} tabOrItemName
     * @returns {Promise<{ applied: boolean }>}
     */
    static async checkAndApplyPendingChanges(tabOrItemName) {
        const username = authState.user?.email || null;
        return await InventoryUtils.checkAndApplyPendingChanges(tabOrItemName, username);
    }

    /**
     * Update a scheduled pending change entry (by effectiveDateDeciseconds) on matching rows.
     * Mutation — uncached. Only the EditHistory column is written back.
     * @param {string} tabOrItemName
     * @param {Array<Object>} originalRows
     * @param {Array<Object>} editedRows
     * @param {number} effectiveDateDeciseconds
     * @param {string} [note]
     * @returns {Promise<boolean>}
     */
    static async savePendingChangeEntry(tabOrItemName, originalRows, editedRows, effectiveDateDeciseconds, note) {
        const username = authState.user?.email || null;
        return await InventoryUtils.savePendingChangeEntry(tabOrItemName, originalRows, editedRows, effectiveDateDeciseconds, note, username);
    }

    /**
     * Delete a scheduled pending change entry by effectiveDateDeciseconds.
     * Mutation — uncached.
     * @param {string} tabOrItemName
     * @param {number} effectiveDateDeciseconds
     * @returns {Promise<boolean>}
     */
    static async deletePendingChangeEntry(tabOrItemName, effectiveDateDeciseconds) {
        const username = authState.user?.email || null;
        return await InventoryUtils.deletePendingChangeEntry(tabOrItemName, effectiveDateDeciseconds, username);
    }

}

/**
 * Wrap the API class with automatic caching and dependency tracking.
 * 
 * MUTATION METHODS ARE EXCLUDED from wrapping to prevent circular dependencies:
 * - saveData: Triggers cache invalidation via Database.setData()
 * - createNewTab: Modifies sheet structure via Database.createTab()
 * - showTabs: Modifies sheet visibility via Database.showTabs()
 * - hideTabs: Modifies sheet visibility via Database.hideTabs()
 * - saveInventoryTabData: Triggers cache invalidation via InventoryUtils.saveInventoryTabData()
 * - savePackList: Triggers cache invalidation via PackListUtils.savePackList()
 * - storeUserData: Triggers cache invalidation via ApplicationUtils.storeUserData()
 * - lockSheet: Triggers cache invalidation via ApplicationUtils.lockSheet()
 * - unlockSheet: Triggers cache invalidation via ApplicationUtils.unlockSheet()
 * - forceUnlockSheet: Triggers cache invalidation via ApplicationUtils.forceUnlockSheet()
 * 
 * These mutation methods are passed through without modification, preserving their original
 * signatures (no deps parameter) and allowing them to trigger invalidation independently.
 */
export const Requests = wrapMethods(
    Requests_uncached, 
    'api', 
    [
        'saveData', 'createNewTab', 'showTabs', 'hideTabs',
        'saveInventoryTabData', 'savePackList', 'storeUserData',
        'lockSheet', 'unlockSheet', 'forceUnlockSheet',
        'checkAndApplyPendingChanges', 'savePendingChangeEntry', 'deletePendingChangeEntry',
        'ensureScheduleReferenceRows', 'updateScheduleReferenceAbbreviation',
        'addScheduleReferenceName', 'appendScheduleReferenceAbbreviation',
        'addCustomScheduleReferenceEntry'
    ], // Mutation methods
    ['computeIdentifier'], // Infinite cache methods
    {} // No custom cache durations needed - lock methods delegate to ApplicationUtils caching
);