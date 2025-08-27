import { Database, Mutations, ProductionUtils, wrapMethods, searchFilter } from '../index.js';

/**
 * Utility functions for inventory operations
 */
class inventoryUtils_uncached {
    static DEFAULT_INVENTORY_MAPPING = {
        itemNumber: 'ITEM#',
        quantity: 'QTY',
        description: 'Description',
        notes: 'NOTES'
    };

    static async getTabNameForItem(itemName) {
        const indexData = await Database.getData('INVENTORY', 'INDEX', { prefix: 'PREFIX', tab: 'INVENTORY' });
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
        const itemNames = Array.isArray(itemName) ? itemName : [itemName];
        const infoFields = Array.isArray(fields) ? fields : [fields];
        const itemsByTab = {};
        const unmappedItems = [];
        for (const item of itemNames) {
            if (!item) continue;
            const tab = await InventoryUtils.getTabNameForItem(item);
            if (!tab) {
                unmappedItems.push(item);
                return;
            }
            if (!itemsByTab[tab]) itemsByTab[tab] = [];
            itemsByTab[tab].push(item);
        };
        const results = [];
        for (const [tab, items] of Object.entries(itemsByTab)) {
            try {
                let tabData = await Database.getData('INVENTORY', tab, inventoryUtils_uncached.DEFAULT_INVENTORY_MAPPING);
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

    static async getInventoryTabData(tabOrItemName, mapping = inventoryUtils_uncached.DEFAULT_INVENTORY_MAPPING, filters = null) {

        // Get all tabs on the inventory sheet
        const allTabs = await Database.getTabs('INVENTORY');

        // Check if the tab exists
        const tabExists = allTabs.some(tab => tab.title === tabOrItemName);
        let resolvedTabName = tabOrItemName;

        if (!tabExists) {
            const foundTab = await InventoryUtils.getTabNameForItem(tabOrItemName);
            if (!foundTab) throw new Error(`Inventory tab for "${tabOrItemName}" not found and could not be resolved from INDEX.`);
            resolvedTabName = foundTab;
        }

        // Get tab data as JS objects (mapping transforms 2D array to objects)
        let tabData = await Database.getData('INVENTORY', resolvedTabName, mapping);

        // Apply search filter if filters are provided (after transformation to objects)
        if (filters) {
            tabData = searchFilter(tabData, filters);
        }

        return tabData;
    }

    static async saveInventoryTabData(tabOrItemName, mappedData, mapping = inventoryUtils_uncached.DEFAULT_INVENTORY_MAPPING, filters = null) {
        const allTabs = await Database.getTabs('INVENTORY');
        const tabExists = allTabs.some(tab => tab.title === tabOrItemName);
        let resolvedTabName = tabOrItemName;

        if (!tabExists) {
            const foundTab = await InventoryUtils.getTabNameForItem(tabOrItemName);
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
        return await Mutations.setData('INVENTORY', resolvedTabName, mappedData, mapping);
    }


    /**
     * Check item availability for a project
     * @param {string} projectIdentifier - Project identifier
     * @returns {Promise<Object>} Item availability map
     */
    static async checkItemAvailability(projectIdentifier) {
        //console.group(`Checking quantities for project: ${projectIdentifier}`);
        
        try {
            // 1. Get pack list items
            //console.log('1. Getting pack list items...');
            const itemMap = await PackListUtils.extractItems(projectIdentifier);
            const itemIds = Object.keys(itemMap);

            // If no items, return empty result
            if (!itemIds.length) {
                //console.log('No items found in pack list');
                //console.groupEnd();
                return {};
            }

            // Get inventory quantities
            //console.log('2. Getting inventory quantities...');
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
            //console.log('4. Checking for overlapping shows...');
            let overlappingIds = await ProductionUtils.getOverlappingShows({ identifier: projectIdentifier });
            
            // Process overlapping shows
            for (const overlapRow of overlappingIds) {
                // Extract identifier from the row object
                const overlapId = overlapRow.Identifier || 
                                 await ProductionUtils.computeIdentifier(overlapRow.Show, overlapRow.Client, overlapRow.Year);
                
                if (overlapId === projectIdentifier) continue;
                
                //console.log(` - Checking overlap with project: ${overlapId}`);
                const overlapInfo = await PackListUtils.extractItems(overlapId);
                
                for (const itemId of Object.keys(overlapInfo)) {
                    if (!result[itemId]) continue;
                    
                    const allocated = result[itemId].allocated + (overlapInfo[itemId].allocated || 0);
                    const onOrder = result[itemId].onOrder + (overlapInfo[itemId].onOrder || 0);
                    result[itemId] = { ...result[itemId], allocated, onOrder };
                }
            }
            
            //console.log('Final results:', result);
            //console.groupEnd();
            
            return result;
        } catch (error) {
            console.error('Failed to check quantities:', error);
            //console.groupEnd();
            throw error;
        }
    }

}

export const InventoryUtils = wrapMethods(inventoryUtils_uncached, 'inventory_utils');