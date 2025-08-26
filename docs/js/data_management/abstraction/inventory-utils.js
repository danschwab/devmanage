import { Database, ProductionUtils, wrapMethods, searchFilter } from '../index.js';

/**
 * Utility functions for inventory operations
 */
class inventoryUtils {
    static DEFAULT_INVENTORY_MAPPING = {
        itemNumber: 'ITEM#',
        quantity: 'QTY',
        description: 'Description',
        notes: 'NOTES'
    };

    static getTabNameForItem(itemName, indexData) {
        // Build prefix-to-tab mapping from transformed objects
        const prefixToTab = {};
        indexData.forEach(row => {
            if (row.prefix && row.tab) {
                prefixToTab[row.prefix] = row.tab;
            }
        });
        
        let [prefix] = itemName.split('-');
        let tab = prefixToTab[prefix];
        if (!tab && prefix?.length > 0) {
            prefix = prefix[0];
            tab = prefixToTab[prefix];
        }
        return tab || null;
    }

    static async getItemInfo(itemName, fields) {
        // Generate cache key
        const itemNames = Array.isArray(itemName) ? itemName : [itemName];
        const infoFields = Array.isArray(fields) ? fields : [fields];
        const indexData = await Database.getData('INVENTORY', 'INDEX', { prefix: 'PREFIX', tab: 'INVENTORY' });
        const itemsByTab = {};
        const unmappedItems = [];
        itemNames.forEach(item => {
            if (!item) return;
            const tab = inventoryUtils.getTabNameForItem(item, indexData);
            if (!tab) {
                unmappedItems.push(item);
                return;
            }
            if (!itemsByTab[tab]) itemsByTab[tab] = [];
            itemsByTab[tab].push(item);
        });
        const results = [];
        for (const [tab, items] of Object.entries(itemsByTab)) {
            try {
                let tabData = await Database.getData('INVENTORY', tab, inventoryUtils.DEFAULT_INVENTORY_MAPPING);
                items.forEach(item => {
                    const originalItem = item;
                    let foundObj = null;
                    if (item.includes('-')) {
                        const itemNumber = item.split('-')[1];
                        foundObj = tabData.find(obj => obj.itemNumber === itemNumber);
                        if (!foundObj) {
                            foundObj = tabData.find(obj => obj.itemNumber === originalItem);
                        }
                    } else {
                        foundObj = tabData.find(obj => obj.itemNumber === item);
                    }
                    const obj = { itemName: originalItem };
                    if (foundObj) {
                        infoFields.forEach(field => {
                            obj[field] = foundObj[field] ?? null;
                        });
                    } else {
                        infoFields.forEach(field => obj[field] = null);
                    }
                    results.push(obj);
                });
            } catch (error) {
                items.forEach(item => {
                    const obj = { itemName: item };
                    infoFields.forEach(field => obj[field] = null);
                    results.push(obj);
                });
            }
        }
        unmappedItems.forEach(item => {
            const obj = { itemName: item };
            infoFields.forEach(field => obj[field] = null);
            results.push(obj);
        });
        return results;
    }

    static async getInventoryTabData(tabOrItemName, mapping = inventoryUtils.DEFAULT_INVENTORY_MAPPING, filters = null) {
        console.log('[InventoryUtils] getInventoryTabData called with:', { tabOrItemName, mapping, filters });
        console.log('[InventoryUtils] DEFAULT_INVENTORY_MAPPING:', inventoryUtils.DEFAULT_INVENTORY_MAPPING);

        // Get all tabs on the inventory sheet
        const allTabs = await Database.getTabs('INVENTORY');

        // Check if the tab exists
        const tabExists = allTabs.some(tab => tab.title === tabOrItemName);
        let resolvedTabName = tabOrItemName;

        if (!tabExists) {
            const indexData = await Database.getData('INVENTORY', 'INDEX', { prefix: 'PREFIX', tab: 'INVENTORY' });
            const foundTab = inventoryUtils.getTabNameForItem(tabOrItemName, indexData);
            if (!foundTab) throw new Error(`Inventory tab for "${tabOrItemName}" not found and could not be resolved from INDEX.`);
            resolvedTabName = foundTab;
        }

        console.log('[InventoryUtils] About to call Database.getData with mapping:', mapping);
        // Get tab data as JS objects (mapping transforms 2D array to objects)
        let tabData = await Database.getData('INVENTORY', resolvedTabName, mapping);
        console.log('[InventoryUtils] Transformed tab data (as objects):', tabData);

        // Apply search filter if filters are provided (after transformation to objects)
        if (filters) {
            tabData = searchFilter(tabData, filters);
            console.log('[InventoryUtils] Filtered tab data:', tabData);
        }

        return tabData;
    }

    static async saveInventoryTabData(tabOrItemName, mappedData, mapping = inventoryUtils.DEFAULT_INVENTORY_MAPPING, filters = null) {
        const allTabs = await Database.getTabs('INVENTORY');
        const tabExists = allTabs.some(tab => tab.title === tabOrItemName);
        let resolvedTabName = tabOrItemName;

        if (!tabExists) {
            const indexData = await Database.getData('INVENTORY', 'INDEX', { prefix: 'PREFIX', tab: 'INVENTORY' });
            const foundTab = inventoryUtils.getTabNameForItem(tabOrItemName, indexData);
            if (!foundTab) throw new Error(`Inventory tab for "${tabOrItemName}" not found and could not be resolved from INDEX.`);
            resolvedTabName = foundTab;
        }

        if (filters) {
            // Fetch existing data from the tab
            const existingData = await Database.getData('INVENTORY', resolvedTabName, mapping);

            // Prepare batch updates
            const updates = mappedData.filter(item => {
                const existingItem = existingData.find(row => row.itemNumber === item.itemNumber);
                return existingItem && JSON.stringify(existingItem) !== JSON.stringify(item);
            });

            // Send updates one by one
            for (const update of updates) {
                await Database.updateRow('INVENTORY', resolvedTabName, update, mapping);
            }

            return true;
        }

        if (mappedData && typeof mappedData === 'object' && mappedData.__v_isReactive) {
            mappedData = Array.from(mappedData);
        }

        // Save JS objects using mapping
        return await Database.setData('INVENTORY', resolvedTabName, mappedData, mapping);
    }



    /**
     * Check item quantities for a project
     * @param {string} projectIdentifier - The project identifier
     * @returns {Promise<object>} Inventory status for all items
     */
    static async checkItemQuantities(projectIdentifier) {
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
                inventoryInfo = await InventoryUtils.getItemInfo(itemIds, "quantity");
            } catch (err) {
                console.error('Error getting inventory:', err);
                throw new Error('Failed to get inventory information');
            }

            // Remove items with no inventory quantity
            const validItemIds = itemIds.filter(id => {
                const inventoryObj = inventoryInfo.find(i => i.itemName === id);
                return inventoryObj && inventoryObj.quantity !== null && inventoryObj.quantity !== undefined && inventoryObj.quantity !== '';
            });

            // 3. Initialize result with inventory and requested, and set remaining to inventory - requested
            const result = {};
            validItemIds.forEach(id => {
                const inventoryObj = inventoryInfo.find(i => i.itemName === id);
                const inventoryQty = parseInt(inventoryObj.quantity || "0", 10);
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
            for (const overlapRow of overlappingIds) {
                // Extract identifier from the row object
                const otherId = overlapRow.Identifier || 
                               await ProductionUtils.computeIdentifier(overlapRow.Show, overlapRow.Client, overlapRow.Year);

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
                const qty = inventoryInfo.find(i => i.itemName === itemId)?.quantity ?? null;
                if (qty !== null) {
                    result[itemId] = { available: qty, allocated: 0, onOrder: 0 };
                }
            });

            // Get overlapping shows
            console.log('4. Checking for overlapping shows...');
            let overlappingIds = await ProductionUtils.getOverlappingShows({ identifier: projectIdentifier });
            
            // Process overlapping shows
            for (const overlapRow of overlappingIds) {
                // Extract identifier from the row object
                const overlapId = overlapRow.Identifier || 
                                 await ProductionUtils.computeIdentifier(overlapRow.Show, overlapRow.Client, overlapRow.Year);
                
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

}

// Mutation cache invalidation logic for inventory saves
const mutationKeys = ['saveInventoryTabData'];
const getInventoryAffectedKeysFn = {
    saveInventoryTabData: (tabOrItemName) => [
        // Invalidate the actual data cache for the tab
        { namespace: 'database', key: `getData:["INVENTORY","${tabOrItemName}"]` },
        // Invalidate the inventory-utils cache for the tab
        { namespace: 'inventory_utils', key: `getInventoryTabData:["${tabOrItemName}",null]` }
    ]
};

export const InventoryUtils = wrapMethods(inventoryUtils, 'inventory_utils', mutationKeys, getInventoryAffectedKeysFn);