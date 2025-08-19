import { Database, wrapMethods } from '../index.js';
import { searchFilter } from '../utils/searchFilter.js';

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
        // Build prefix-to-tab mapping
        const prefixToTab = {};
        indexData.slice(1).forEach(row => {
            if (row[0] && row[1]) {
                prefixToTab[row[0]] = row[1];
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
        const indexData = await Database.getData('INVENTORY', 'INDEX', { prefix: 'Prefix', tab: 'Tab' });
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
            const indexData = await Database.getData('INVENTORY', 'INDEX', { prefix: 'Prefix', tab: 'Tab' });
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
            const indexData = await Database.getData('INVENTORY', 'INDEX', { prefix: 'Prefix', tab: 'Tab' });
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