import { Database, CacheManager } from '../../index.js';

/**
 * Utility functions for inventory operations
 */
export class InventoryUtils {
    /**
     * Get information about specific inventory items
     * @param {string|string[]} itemName - Item ID(s) to look up
     * @param {string|string[]} fields - Field(s) to retrieve
     * @param {string} [trackingId] - Optional tracking ID for dependency tracking
     * @returns {Promise<Array<Object>>} Item information
     */
    static async getItemInfo(itemName, fields, trackingId = null) {
        // Generate cache key
        const itemNames = Array.isArray(itemName) ? itemName : [itemName];
        const infoFields = Array.isArray(fields) ? fields : [fields];
        const cacheKey = `items:${itemNames.join(',')}-fields:${infoFields.join(',')}`;
        
        // Check cache first
        const cachedValue = CacheManager.get(
            CacheManager.NAMESPACES.INVENTORY, 
            cacheKey, 
            trackingId
        );
        
        if (cachedValue !== null) {
            return cachedValue;
        }
        
        // If not in cache, fetch the data
        try {
            // Fetch INDEX data directly from Database
            const indexData = await Database.getData('INVENTORY', 'INDEX!A:B', true, trackingId);

            // Process prefix mapping (skip header row)
            const prefixToTab = {};
            indexData.slice(1).forEach(row => {
                if (row[0] && row[1]) {
                    prefixToTab[row[0]] = row[1];
                }
            });

            // Group items by tab
            const itemsByTab = {};
            const unmappedItems = [];
            itemNames.forEach(item => {
                if (!item) return;
                let [prefix] = item.split('-');
                let tab = prefixToTab[prefix];
                if (!tab && prefix?.length > 0) {
                    prefix = prefix[0];
                    tab = prefixToTab[prefix];
                }
                if (!tab) {
                    unmappedItems.push(item);
                    return;
                }
                if (!itemsByTab[tab]) itemsByTab[tab] = [];
                itemsByTab[tab].push(item);
            });

            // Process each tab
            const results = [];
            const errors = [];

            for (const [tab, items] of Object.entries(itemsByTab)) {
                try {
                    // Get tab data directly from Database
                    let tabData = await Database.getData('INVENTORY', `${tab}!A:Z`, true, trackingId);

                    // First row contains headers
                    const headers = tabData[0];
                    const infoIdxs = infoFields.map(field => {
                        const idx = headers.findIndex(h => h?.toLowerCase() === field.toLowerCase());
                        if (idx === -1) {
                            throw new Error(`Column '${field}' not found in tab ${tab}`);
                        }
                        return idx;
                    });

                    // Process items
                    items.forEach(item => {
                        const originalItem = item;
                        let foundRow = null;

                        // Try searching by item number alone if it contains a hyphen
                        if (item.includes('-')) {
                            const itemNumber = item.split('-')[1];
                            
                            foundRow = tabData.slice(1).find(r => r[0] === itemNumber);

                            // If not found, try searching for the full item (prefix + number)
                            if (!foundRow) {
                                foundRow = tabData.slice(1).find(r => r[0] === originalItem);
                            }
                        } else {
                            // Try searching for the item as-is
                            foundRow = tabData.slice(1).find(r => r[0] === item);
                        }

                        const obj = { itemName: originalItem }; // Use original item name in result
                        if (foundRow) {
                            infoFields.forEach((field, i) => {
                                obj[field] = foundRow[infoIdxs[i]] ?? null;
                            });
                        } else {
                            infoFields.forEach(field => obj[field] = null);
                        }
                        results.push(obj);
                    });
                } catch (error) {
                    errors.push(`Tab ${tab}: ${error.message}`);
                    items.forEach(item => {
                        const obj = { itemName: item };
                        infoFields.forEach(field => obj[field] = null);
                        results.push(obj);
                    });
                }
            }

            // Add unmapped items to results
            unmappedItems.forEach(item => {
                const obj = { itemName: item };
                infoFields.forEach(field => obj[field] = null);
                results.push(obj);
            });

            // Cache the result
            CacheManager.set(
                CacheManager.NAMESPACES.INVENTORY,
                cacheKey,
                results,
                CacheManager.EXPIRATIONS.SHORT,
                [],
                trackingId
            );
            
            return results;
        } catch (error) {
            console.error('Failed to get inventory information:', error);
            throw new Error(`Failed to get inventory information: ${error.message}`);
        }
    }
}