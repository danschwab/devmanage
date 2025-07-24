import { Database, wrapMethods } from '../../index.js';

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
        const tabs = await Database.getTabs('PACK_LISTS', true);
        const tabExists = tabs.some(tab => tab.title === projectIdentifier);
        
        if (!tabExists) {
            console.warn(`Pack list tab "${projectIdentifier}" not found, skipping`);
            return null;
        }
        
        // Fetch the data directly from Database
        const sheetData = await Database.getData('PACK_LISTS', projectIdentifier);
        console.log('[PackListUtils.getContent] Loaded sheet data:', sheetData);

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
                    crateInfoObj[label] = idx < crateInfoArr.length && crateInfoArr[idx] !== undefined ? crateInfoArr[idx] : null;
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
                    itemObj[label] = idx < crateContentsArr.length && crateContentsArr[idx] !== undefined ? crateContentsArr[idx] : null;
                });
                currentCrate.Items.push(itemObj);
            }
        }

        if (currentCrate) {
            crates.push(currentCrate);
        }

        // Log the array of crate objects
        console.log('[PackListUtils.getContent] crates array:', crates);

        // Return just the array of crate objects
        return crates;
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

        // Remove all objects marked for deletion recursively
        function removeMarkedForDeletion(arr) {
            if (!Array.isArray(arr)) return arr;
            return arr
                .filter(obj => !(obj && obj['marked-for-deletion']))
                .map(obj => {
                    if (obj && typeof obj === 'object') {
                        const newObj = { ...obj };
                        Object.keys(newObj).forEach(key => {
                            if (Array.isArray(newObj[key])) {
                                newObj[key] = removeMarkedForDeletion(newObj[key]);
                            }
                        });
                        // Remove the marker property
                        delete newObj['marked-for-deletion'];
                        return newObj;
                    }
                    return obj;
                });
        }

        // Remove marked-for-deletion from crates and nested items
        const cleanCrates = removeMarkedForDeletion(crates);

        // If headers not provided, infer from first crate
        if (!headers && Array.isArray(cleanCrates) && cleanCrates.length > 0) {
            const firstCrate = cleanCrates[0];
            headers = {
                main: Object.keys(firstCrate).filter(k => k !== 'Items'),
                items: (Array.isArray(firstCrate.Items) && firstCrate.Items.length > 0)
                    ? Object.keys(firstCrate.Items[0])
                    : []
            };
        }
        if (!headers) throw new Error('Cannot determine headers for saving packlist');

        // Format data for Google Sheets: header row (row 3), then crate rows, then item rows, starting at row 4
        const result = [];
        // Header row (row 3 in sheet, so index 2)
        result.push([...headers.main, ...headers.items]);

        // For each crate, add crate info row and item rows
        cleanCrates.forEach(crate => {
            // Crate info row (main headers)
            const crateInfo = headers.main.map(label => crate[label]);
            result.push([...crateInfo, ...Array(headers.items.length).fill('')]);
            // Each item row (items headers)
            (crate.Items || []).forEach(itemObj => {
                const itemRow = headers.items.map(label => itemObj[label]);
                result.push([...Array(headers.main.length).fill(''), ...itemRow]);
            });
            // Spacer row: fill with as many empty strings as there are headers
            result.push(Array(headers.main.length + headers.items.length).fill(''));
        });

        // Remove trailing empty row if present
        if (
            result.length &&
            result[result.length - 1].every(cell => cell === '')
        ) {
            result.pop();
        }

        // Minimal logging of output data
        console.log('[PackListUtils.savePackList] Final array to save:', result);

        // Write to sheet starting at row 3 (1-based for Sheets API)
        await Database.setData('PACK_LISTS', tabName, {
            type: 'full-table',
            values: result,
            startRow: 2, // 1-based for Sheets API, so row 3
            removeRowsBelow: 4
        });

        return true;
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