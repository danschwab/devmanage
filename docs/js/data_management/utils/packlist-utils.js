import { Database, CacheManager } from '../../index.js';

/**
 * Utility functions for pack list operations
 */
export class PackListUtils {
    /**
     * Get pack list content
     * @param {string} projectIdentifier - The project identifier
     * @param {string} [itemColumnsStart="Pack"] - Column header where item data begins
     * @param {string} [trackingId] - Optional tracking ID for dependency tracking
     * @returns {Promise<Object>} Pack list content
     */
    static async getContent(projectIdentifier, itemColumnsStart = "Pack", trackingId = null) {
        // Generate cache key
        const cacheKey = `packlist:${projectIdentifier}:${itemColumnsStart}`;
        
        // Check cache first
        const cachedValue = CacheManager.get(
            CacheManager.NAMESPACES.PACK_LISTS, 
            cacheKey, 
            trackingId
        );
        
        if (cachedValue !== null) {
            return cachedValue;
        }
        
        // If not in cache, fetch the data
        try {
            // First verify the tab exists
            const tabs = await Database.getTabs('PACK_LISTS', true, trackingId);
            const tabExists = tabs.some(tab => tab.title === projectIdentifier);
            
            if (!tabExists) {
                console.warn(`Pack list tab "${projectIdentifier}" not found, skipping`);
                return null;
            }
            
            // Fetch the data directly from Database
            const sheetData = await Database.getData('PACK_LISTS', projectIdentifier, true, trackingId);
            
            // Extract headers (typically row 3)
            const headerRow = sheetData[2] || [];
            const itemStartIndex = headerRow.findIndex(header => header === itemColumnsStart);
            
            if (itemStartIndex === -1) {
                throw new Error(`Header "${itemColumnsStart}" not found in the header row.`);
            }
            
            const result = {
                headers: {
                    main: headerRow.slice(0, itemStartIndex),
                    items: headerRow.slice(itemStartIndex)
                },
                crates: []
            };
    
            let currentCrate = null;
    
            // Process rows starting from row 4
            for (let i = 3; i < sheetData.length; i++) {
                const rowValues = sheetData[i] || [];
                const crateInfo = rowValues.slice(0, itemStartIndex);
                const crateContents = rowValues.slice(itemStartIndex);
    
                if (crateInfo.some(cell => cell)) {
                    if (currentCrate) {
                        result.crates.push(currentCrate);
                    }
                    currentCrate = {
                        info: crateInfo,
                        items: []
                    };
                }
    
                if (crateContents.some(cell => cell)) {
                    currentCrate.items.push(crateContents);
                }
            }
    
            if (currentCrate) {
                result.crates.push(currentCrate);
            }
    
            // Cache the result
            CacheManager.set(
                CacheManager.NAMESPACES.PACK_LISTS,
                cacheKey,
                result,
                CacheManager.EXPIRATIONS.MEDIUM,
                [],
                trackingId
            );
            
            return result;
        } catch (error) {
            console.error(`Error getting pack list content for ${projectIdentifier}:`, error);
            throw new Error(`Failed to retrieve pack list: ${error.message}`);
        }
    }

    /**
     * Extracts item quantities from a project's pack list
     * @param {string} projectIdentifier - The project identifier
     * @param {string} [trackingId] - Optional tracking ID for dependency tracking
     * @returns {Promise<object>} Map of itemId to quantity
     */
    static async extractItems(projectIdentifier, trackingId = null) {
        // Generate cache key
        const cacheKey = `extracted_items:${projectIdentifier}`;
        
        // Check cache first
        const cachedValue = CacheManager.get(
            CacheManager.NAMESPACES.PACK_LISTS, 
            cacheKey, 
            trackingId
        );
        
        if (cachedValue !== null) {
            return cachedValue;
        }
        
        try {
            // Get pack list content
            const packList = await this.getContent(projectIdentifier, "Pack", trackingId);
            
            // Return empty object if pack list not found
            if (!packList) return {};
            
            const itemRegex = /(?:\(([0-9]+)\))?\s*([A-Z]+-[0-9]+[a-zA-Z]?)/;
            const itemMap = {};
            
            packList.crates.forEach(crate => {
                crate.items.forEach(row => {
                    row.forEach(cell => {
                        if (!cell) return;
                        const match = cell.match(itemRegex);
                        if (match && match[2]) {
                            const qty = parseInt(match[1] || "1", 10);
                            const id = match[2];
                            itemMap[id] = (itemMap[id] || 0) + qty;
                        }
                    });
                });
            });
            
            // Cache the result
            CacheManager.set(
                CacheManager.NAMESPACES.PACK_LISTS,
                cacheKey,
                itemMap,
                CacheManager.EXPIRATIONS.MEDIUM,
                [],
                trackingId
            );
            
            return itemMap;
        } catch (error) {
            console.error(`Error extracting items for ${projectIdentifier}:`, error);
            throw new Error(`Failed to extract items: ${error.message}`);
        }
    }
}
