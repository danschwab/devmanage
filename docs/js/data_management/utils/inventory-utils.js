import { Database, wrapMethods, transformSheetData, reverseTransformSheetData } from '../../index.js';

/**
 * Utility functions for inventory operations
 */
class inventoryUtils {
    static DEFAULT_INVENTORY_MAPPING = {
        itemNumber: 'ITEM#',
        quantity: 'QTY',
        description: 'Description'
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
        const indexData = await Database.getData('INVENTORY', 'INDEX!A:B');
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
                let tabData = await Database.getData('INVENTORY', `${tab}!A:Z`);
                const headers = tabData[0];
                const infoIdxs = infoFields.map(field => {
                    const idx = headers.findIndex(h => h?.toLowerCase() === field.toLowerCase());
                    if (idx === -1) throw new Error(`Column '${field}' not found in tab ${tab}`);
                    return idx;
                });
                items.forEach(item => {
                    const originalItem = item;
                    let foundRow = null;
                    if (item.includes('-')) {
                        const itemNumber = item.split('-')[1];
                        foundRow = tabData.slice(1).find(r => r[0] === itemNumber);
                        if (!foundRow) {
                            foundRow = tabData.slice(1).find(r => r[0] === originalItem);
                        }
                    } else {
                        foundRow = tabData.slice(1).find(r => r[0] === item);
                    }
                    const obj = { itemName: originalItem };
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

    static async getInventoryTabData(tabOrItemName, mapping = inventoryUtils.DEFAULT_INVENTORY_MAPPING) {
        // Get all tabs on the inventory sheet
        const allTabs = await Database.getTabs('INVENTORY', true);
        const tabExists = allTabs.some(tab => tab.title === tabOrItemName);
        let resolvedTabName = tabOrItemName;

        if (!tabExists) {
            const indexData = await Database.getData('INVENTORY', 'INDEX!A:B');
            const foundTab = inventoryUtils.getTabNameForItem(tabOrItemName, indexData);
            if (!foundTab) throw new Error(`Inventory tab for "${tabOrItemName}" not found and could not be resolved from INDEX.`);
            resolvedTabName = foundTab;
        }

        // Get raw sheet data
        const rawData = await Database.getData('INVENTORY', resolvedTabName);
        // Transform using helper (no caching)
        return transformSheetData(rawData, mapping);
    }

    static async saveInventoryTabData(tabOrItemName, mappedData, mapping = inventoryUtils.DEFAULT_INVENTORY_MAPPING) {
        const allTabs = await Database.getTabs('INVENTORY', true);
        const tabExists = allTabs.some(tab => tab.title === tabOrItemName);
        let resolvedTabName = tabOrItemName;

        if (!tabExists) {
            const indexData = await Database.getData('INVENTORY', 'INDEX!A:B');
            const foundTab = inventoryUtils.getTabNameForItem(tabOrItemName, indexData);
            if (!foundTab) throw new Error(`Inventory tab for "${tabOrItemName}" not found and could not be resolved from INDEX.`);
            resolvedTabName = foundTab;
        }

        if (mappedData && typeof mappedData === 'object' && mappedData.__v_isReactive) {
            mappedData = Array.from(mappedData);
        }
        const originalData = await Database.getData('INVENTORY', resolvedTabName);
        const sheetData = reverseTransformSheetData(originalData, mapping, mappedData);
        return await Database.setData('INVENTORY', resolvedTabName, sheetData);
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