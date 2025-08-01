import { Database, wrapMethods } from '../index.js';

/**
 * Utility functions for pack list operations
 */
class packListUtils {
    /**
     * Get pack list content
     * @param {string} projectIdentifier - The project identifier
     * @param {string} [itemColumnsStart="Pack"] - Column header where item data begins
     * @returns {Promise<Object>} Pack list content
     */
    static async getContent(projectIdentifier, itemColumnsStart = "Pack") {
        // First verify the tab exists
        const tabs = await Database.getTabs('PACK_LISTS');
        const tabExists = tabs.some(tab => tab.title === projectIdentifier);
        if (!tabExists) {
            console.warn(`Pack list tab "${projectIdentifier}" not found, skipping`);
            return null;
        }
        // Fetch the raw sheet data (2D array)
        const sheetData = await Database.getData('PACK_LISTS', projectIdentifier, null);
        if (!sheetData || sheetData.length < 4) return [];
        // Extract headers (typically row 3)
        const headerRow = sheetData[2] || [];
        const itemStartIndex = headerRow.findIndex(header => header === itemColumnsStart);
        if (itemStartIndex === -1) {
            throw new Error(`Header "${itemColumnsStart}" not found in the header row.`);
        }
        const mainHeaders = headerRow.slice(0, itemStartIndex);
        const itemHeaders = headerRow.slice(itemStartIndex);
        const crates = [];
        let currentCrate = null;
        // Process rows starting from row 4
        for (let i = 3; i < sheetData.length; i++) {
            const rowValues = sheetData[i] || [];
            const crateInfoArr = rowValues.slice(0, itemStartIndex);
            const crateContentsArr = rowValues.slice(itemStartIndex);
            // If crate info row, start a new crate
            if (crateInfoArr.some(cell => cell)) {
                if (currentCrate) {
                    crates.push(currentCrate);
                }
                // Map crate info to object with header keys (always include all headers)
                const crateInfoObj = {};
                mainHeaders.forEach((label, idx) => {
                    crateInfoObj[label] = idx < crateInfoArr.length && crateInfoArr[idx] !== undefined ? crateInfoArr[idx] : '';
                });
                currentCrate = {
                    ...crateInfoObj,
                    Items: []
                };
            }
            // If item row, add to current crate's Items array
            if (crateContentsArr.some(cell => cell) && currentCrate) {
                const itemObj = {};
                itemHeaders.forEach((label, idx) => {
                    itemObj[label] = idx < crateContentsArr.length && crateContentsArr[idx] !== undefined ? crateContentsArr[idx] : '';
                });
                currentCrate.Items.push(itemObj);
            }
        }
        if (currentCrate) {
            crates.push(currentCrate);
        }
        return crates;
    // ...existing code...
    }

    /**
     * Extracts item quantities from a project's pack list
     * @param {string} projectIdentifier - The project identifier
     * @returns {Promise<object>} Map of itemId to quantity
     */
    static async extractItems(projectIdentifier) {
        // Get pack list content (array of crate objects with Items arrays)
        const crates = await packListUtils.getContent(projectIdentifier, "Pack");

        // Return empty object if pack list not found
        if (!crates) return {};

        const itemRegex = /(?:\(([0-9]+)\))?\s*([A-Z]+-[0-9]+[a-zA-Z]?)/;
        const itemMap = {};

        crates.forEach(crate => {
            if (Array.isArray(crate.Items)) {
                crate.Items.forEach(itemObj => {
                    // For each property in the item object, check for item codes
                    Object.values(itemObj).forEach(cell => {
                        if (!cell) return;
                        const match = typeof cell === 'string' && cell.match(itemRegex);
                        if (match && match[2]) {
                            const qty = parseInt(match[1] || "1", 10);
                            const id = match[2];
                            itemMap[id] = (itemMap[id] || 0) + qty;
                        }
                    });
                });
            }
        });

        return itemMap;
    }

    /**
     * Save pack list data to the PACK_LISTS sheet.
     * @param {string} tabName - The sheet/tab name.
     * @param {Array<Object>} crates - Array of crate objects, each with info and items arrays.
     * @param {Object} [headers] - { main: [...], items: [...] } (optional)
     * @returns {Promise<boolean>} Success status
     */
    static async savePackList(tabName, crates, headers = null) {
        // Minimal logging of input data
        console.log('[PackListUtils.savePackList] crates input:', crates);

        // Read the original sheet data to get metadata and header row
        const originalSheetData = await Database.getData('PACK_LISTS', tabName, null);
        // Preserve metadata rows (rows 0 and 1)
        const metadataRows = originalSheetData.slice(0, 2);
        // Use the original header row (row 2)
        const headerRow = originalSheetData[2] || [];

        // Determine headers from original header row
        const itemColumnsStart = headerRow.findIndex(h => h === 'Pack');
        const mainHeaders = headerRow.slice(0, itemColumnsStart);
        const itemHeaders = headerRow.slice(itemColumnsStart);

        // Clean crates: only keep properties in mainHeaders, and for Items only keep itemHeaders
        const cleanCrates = Array.isArray(crates) ? crates.map(crate => {
            const cleanCrate = {};
            mainHeaders.forEach(h => {
                cleanCrate[h] = crate[h] !== undefined ? crate[h] : '';
            });
            cleanCrate.Items = Array.isArray(crate.Items)
                ? crate.Items.map(itemObj => {
                    const cleanItem = {};
                    itemHeaders.forEach(h => {
                        cleanItem[h] = itemObj[h] !== undefined ? itemObj[h] : '';
                    });
                    return cleanItem;
                })
                : [];
            return cleanCrate;
        }) : [];

        // If headers not provided, use those from original header row
        if (!headers) {
            headers = {
                main: mainHeaders,
                items: itemHeaders
            };
        }
        if (!headers) throw new Error('Cannot determine headers for saving packlist');

        const sheetData = [...metadataRows, headerRow];
        // Row 4+: crate/item data
        cleanCrates.forEach(crate => {
            // Crate info row
            const crateInfoArr = headers.main.map(h => crate[h] !== undefined ? crate[h] : '');
            const crateContentsArr = headers.items.map(h => '');
            sheetData.push([...crateInfoArr, ...crateContentsArr]);
            // Item rows
            if (Array.isArray(crate.Items)) {
                crate.Items.forEach(itemObj => {
                    const itemInfoArr = headers.main.map(() => '');
                    const itemContentsArr = headers.items.map(h => itemObj[h] !== undefined ? itemObj[h] : '');
                    sheetData.push([...itemInfoArr, ...itemContentsArr]);
                });
            }
        });
        // Save the sheet data (2D array), overwriting the whole tab
        return await Database.setData('PACK_LISTS', tabName, sheetData, null);
    }
}

// Mutation cache invalidation logic for pack list saves
const mutationKeys = ['savePackList'];
const getPackListAffectedKeysFn = {
    savePackList: (tabName) => [
        { namespace: 'database', key: `getData:["PACK_LISTS","${tabName}"]` },
        { namespace: 'packlist_utils', key: `getContent:["${tabName}","Pack"]` }
    ]
};

export const PackListUtils = wrapMethods(packListUtils, 'packlist_utils', mutationKeys, getPackListAffectedKeysFn);