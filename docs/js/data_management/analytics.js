import { wrapMethods, InventoryUtils, PackListUtils, ProductionUtils } from '../index.js';

class analytics {
    /**
     * Check item quantities for a project
     * @param {string} projectIdentifier - The project identifier
     * @returns {Promise<object>} Inventory status for all items
     */
    static async checkItemQuantities(projectIdentifier) {
        // Generate cache key
        const cacheKey = `quantities:${projectIdentifier}`;
        
        // Check cache first
        const cachedValue = CacheManager.get(
            CacheManager.NAMESPACES.INVENTORY, 
            cacheKey, 
            trackingId
        );
        
        if (cachedValue !== null) {
            return cachedValue;
        }
        
        console.group(`Checking quantities for project: ${projectIdentifier}`);
        try {
            // 1. Get pack list items
            console.log('1. Getting pack list items...');
            const itemMap = await PackListUtils.extractItems(projectIdentifier);
            const itemIds = Object.keys(itemMap);

            // If there are no items in the pack list, return
            if (!itemIds.length) {
                console.log('No items found in pack list, returning.');
                console.groupEnd();
                return {};
            }

            // 2. Get inventory quantities
            console.log('2. Getting inventory quantities...');
            let inventoryInfo;
            try {
                inventoryInfo = await InventoryUtils.getItemInfo(itemIds, "QTY");
            } catch (err) {
                console.error('Error getting inventory:', err);
                throw new Error('Failed to get inventory information');
            }

            // Remove items with no inventory quantity
            const validItemIds = itemIds.filter(id => {
                const inventoryObj = inventoryInfo.find(i => i.itemName === id);
                return inventoryObj && inventoryObj.QTY !== null && inventoryObj.QTY !== undefined && inventoryObj.QTY !== '';
            });

            // 3. Initialize result with inventory and requested, and set remaining to inventory - requested
            const result = {};
            validItemIds.forEach(id => {
                const inventoryObj = inventoryInfo.find(i => i.itemName === id);
                const inventoryQty = parseInt(inventoryObj.QTY || "0", 10);
                const projectQty = itemMap[id] || 0;
                result[id] = {
                    inventory: inventoryQty,
                    requested: projectQty,
                    overlapping: [],
                    remaining: inventoryQty - projectQty
                };
            });

            // 4. Get overlapping shows
            console.log('4. Checking for overlapping shows...');
            let overlappingIds;
            try {
                overlappingIds = await ProductionUtils.getOverlappingShows({ identifier: projectIdentifier });
            } catch (err) {
                console.error('Error getting overlapping shows:', err);
                throw new Error('Failed to get overlapping shows');
            }

            // 5. Process overlapping shows
            console.log('5. Processing overlapping shows...');
            for (const otherId of overlappingIds) {
                if (otherId === projectIdentifier) continue;
                try {
                    const otherItemMap = await PackListUtils.extractItems(otherId);
                    Object.entries(otherItemMap).forEach(([id, qty]) => {
                        if (result[id]) {
                            result[id].remaining -= qty;
                            if (!result[id].overlapping.includes(otherId)) {
                                result[id].overlapping.push(otherId);
                            }
                        }
                    });
                } catch (e) {
                    console.warn(`Failed to process overlapping show ${otherId}:`, e);
                }
            }

            console.log('Final results:', result);
            console.groupEnd();
            
            return result;
        } catch (error) {
            console.error('Failed to check quantities:', error);
            console.groupEnd();
            throw error;
        }
    }

    /**
     * Check item availability for a project
     * @param {string} projectIdentifier - Project identifier
     * @returns {Promise<Object>} Item availability map
     */
    static async checkItemAvailability(projectIdentifier) {
        // Generate cache key
        const cacheKey = `quantities:${projectIdentifier}`;
        
        // Check cache first
        const cachedValue = CacheManager.get(
            CacheManager.NAMESPACES.INVENTORY, 
            cacheKey, 
            trackingId
        );
        
        if (cachedValue !== null) {
            return cachedValue;
        }
        
        console.group(`Checking quantities for project: ${projectIdentifier}`);
        
        try {
            // 1. Get pack list items
            console.log('1. Getting pack list items...');
            const itemMap = await PackListUtils.extractItems(projectIdentifier);
            const itemIds = Object.keys(itemMap);

            // If no items, return empty result
            if (!itemIds.length) {
                console.log('No items found in pack list');
                console.groupEnd();
                return {};
            }

            // Get inventory quantities
            console.log('2. Getting inventory quantities...');
            let inventoryInfo = await InventoryUtils.getItemInfo(itemIds, "QTY");
            
            // Filter valid items and build result
            const result = {};
            itemIds.forEach(itemId => {
                const qty = inventoryInfo.find(i => i.itemName === itemId)?.QTY ?? null;
                if (qty !== null) {
                    result[itemId] = { available: qty, allocated: 0, onOrder: 0 };
                }
            });

            // Get overlapping shows
            console.log('4. Checking for overlapping shows...');
            let overlappingIds = await ProductionUtils.getOverlappingShows({ identifier: projectIdentifier });
            
            // Process overlapping shows
            for (const { identifier: overlapId } of overlappingIds) {
                if (overlapId === projectIdentifier) continue;
                
                console.log(` - Checking overlap with project: ${overlapId}`);
                const overlapInfo = await PackListUtils.extractItems(overlapId);
                
                for (const itemId of Object.keys(overlapInfo)) {
                    if (!result[itemId]) continue;
                    
                    const allocated = result[itemId].allocated + (overlapInfo[itemId].allocated || 0);
                    const onOrder = result[itemId].onOrder + (overlapInfo[itemId].onOrder || 0);
                    result[itemId] = { ...result[itemId], allocated, onOrder };
                }
            }
            
            console.log('Final results:', result);
            console.groupEnd();
            
            return result;
        } catch (error) {
            console.error('Failed to check quantities:', error);
            console.groupEnd();
            throw error;
        }
    }

    // Event tracking method for analytics
    static trackEvent(eventName, eventData = {}) {
        // Implement your analytics tracking logic here
    }
}

export const Analytics = wrapMethods(analytics, 'analytics');