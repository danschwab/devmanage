import { Database, InventoryUtils, ProductionUtils, wrapMethods, cleanTextForComparison, GetParagraphMatchRating } from '../index.js';

/**
 * Utility functions for pack list operations
 */
class packListUtils_uncached {
    /**
     * Get pack list content
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} projectIdentifier - The project identifier
     * @param {string} [itemColumnsStart="Pack"] - Column header where item data begins
     * @returns {Promise<Object>} Pack list content
     */
    static async getContent(deps, projectIdentifier, itemColumnsStart = "Pack") {
        // First verify the tab exists
        const tabs = await deps.call(Database.getTabs, 'PACK_LISTS');
        const tabExists = tabs.some(tab => tab.title === projectIdentifier);
        if (!tabExists) {
            console.warn(`Pack list tab "${projectIdentifier}" not found, skipping`);
            return null;
        }
        // Fetch the raw sheet data (2D array)
        const sheetData = await deps.call(Database.getData, 'PACK_LISTS', projectIdentifier, null);
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
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} projectIdentifier - The project identifier
     * @returns {Promise<object>} Map of itemId to quantity
     */
    static async extractItems(deps, projectIdentifier) {
        // Get pack list content (array of crate objects with Items arrays)
        const crates = await deps.call(PackListUtils.getContent, projectIdentifier, "Pack");

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
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tabName - The sheet/tab name.
     * @param {Array<Object>} crates - Array of crate objects, each with info and items arrays.
     * @param {Object} [headers] - { main: [...], items: [...] } (optional)
     * @returns {Promise<boolean>} Success status
     */
    static async savePackList(tabName, mappedData, headers = null) {
        console.log('[PackListUtils.savePackList] crates input:', mappedData);

        const originalSheetData = await Database.getData('PACK_LISTS', tabName, null);
        const metadataRows = originalSheetData.slice(0, 2);
        const headerRow = originalSheetData[2] || [];

        const itemColumnsStart = headerRow.findIndex(h => h === 'Pack');
        const mainHeaders = headerRow.slice(0, itemColumnsStart);
        const itemHeaders = headerRow.slice(itemColumnsStart);

        // Clean crates: only keep properties in mainHeaders, and for Items only keep itemHeaders
        const cleanCrates = Array.isArray(mappedData) ? mappedData.map(crate => {
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



        /**
     * Check item quantities for a project
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} projectIdentifier - The project identifier
     * @returns {Promise<object>} Inventory status for all items
     */
    static async checkItemQuantities(deps, projectIdentifier) {
        //console.group(`Checking quantities for project: ${projectIdentifier}`);
        try {
            // 1. Get pack list items
            //console.log('1. Getting pack list items...');
            const itemMap = await deps.call(PackListUtils.extractItems, projectIdentifier);
            const itemIds = Object.keys(itemMap);

            // If there are no items in the pack list, return
            if (!itemIds.length) {
                //console.log('No items found in pack list, returning.');
                //console.groupEnd();
                return {};
            }

            // 2. Get inventory quantities
            //console.log('2. Getting inventory quantities...');
            let inventoryInfo;
            try {
                inventoryInfo = await deps.call(InventoryUtils.getItemInfo, itemIds, "quantity");
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
            //console.log('4. Checking for overlapping shows...');
            let overlappingIds;
            try {
                overlappingIds = await deps.call(ProductionUtils.getOverlappingShows, { identifier: projectIdentifier });
            } catch (err) {
                console.error('Error getting overlapping shows:', err);
                throw new Error('Failed to get overlapping shows');
            }

            // 5. Process overlapping shows
            //console.log('5. Processing overlapping shows...');
            for (const overlapRow of overlappingIds) {
                // Extract identifier from the row object
                const otherId = overlapRow.Identifier || 
                               await deps.call(ProductionUtils.computeIdentifier, overlapRow.Show, overlapRow.Client, overlapRow.Year);

                if (otherId === projectIdentifier) continue;
                
                try {
                    const otherItemMap = await deps.call(PackListUtils.extractItems, otherId);
                    Object.entries(otherItemMap).forEach(([id, qty]) => {
                        if (result[id]) {
                            result[id].remaining -= qty;
                            if (!result[id].overlapping.includes(otherId)) {
                                result[id].overlapping.push(otherId);
                            }
                        }
                    });
                } catch (e) {
                    //console.warn(`Failed to process overlapping show ${otherId}:`, e);
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

    /**
     * Compare item description with inventory description
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} itemNumber - The item number to look up in inventory
     * @param {string} description - The current item description to compare
     * @returns {Promise<Object|null>} Comparison result with score and descriptions, or null if no comparison possible
     */
    static async checkDescriptionMatch(deps, itemNumber, description) {
        if (!itemNumber || !description) {
            return null;
        }

        try {
            // Get inventory description for this item
            const inventoryDescription = await deps.call(InventoryUtils.getItemDescription, itemNumber);
            
            if (!inventoryDescription) {
                return {
                    itemNumber,
                    inventoryFound: false,
                    score: 0
                };
            }

            // Clean both descriptions for comparison (remove item codes and quantities)
            const cleanPacklistDesc = cleanTextForComparison(description);
            const cleanInventoryDesc = cleanTextForComparison(inventoryDescription);

            // Calculate similarity score
            const matchScore = GetParagraphMatchRating(cleanPacklistDesc, cleanInventoryDesc);

            return {
                itemNumber,
                inventoryFound: true,
                score: matchScore,
                packlistDescription: cleanPacklistDesc,
                inventoryDescription: cleanInventoryDesc
            };

        } catch (error) {
            console.error('Error checking description match:', error);
            return {
                itemNumber,
                inventoryFound: false,
                score: 0,
                error: error.message
            };
        }
    }

    /**
     * Get item quantities summary for a project (transformed to table format)
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} projectIdentifier - The project identifier
     * @returns {Promise<Array<Object>>} Array of item objects for table display
     */
    static async getItemQuantitiesSummary(deps, projectIdentifier) {
        const quantitiesMap = await deps.call(PackListUtils.extractItems, projectIdentifier);
        
        // Transform to array format for table display
        return Object.entries(quantitiesMap).map(([itemId, quantity]) => ({
            itemId,
            quantity,
            tabName: null,        // Will be filled by first analysis
            available: null,      // Will be filled by second analysis
            remaining: null,      // Will be filled by fourth analysis  
            overlappingShows: []  // Will be filled by third analysis
        }));
    }

    /**
     * Get inventory quantity for a specific item
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} itemId - The item ID to look up
     * @returns {Promise<number>} Available inventory quantity
     */
    static async getItemInventoryQuantity(deps, itemId) {
        const inventoryInfo = await deps.call(InventoryUtils.getItemInfo, itemId, ['quantity']);
        const item = inventoryInfo.find(i => i.itemName === itemId);
        return item ? parseInt(item.quantity || "0", 10) : 0;
    }

    /**
     * Get overlapping projects that use a specific item
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} currentProjectId - Current project identifier
     * @param {string} itemId - Item ID to check for conflicts
     * @returns {Promise<Array<string>>} Array of overlapping project identifiers that use this item
     */
    static async getItemOverlappingShows(deps, currentProjectId, itemId) {
        // Get all overlapping projects for this project
        const overlappingProjects = await deps.call(ProductionUtils.getOverlappingShows, { identifier: currentProjectId });
        
        const conflictingShows = [];
        
        // Check each overlapping project to see if it uses this item
        for (const projectRow of overlappingProjects) {
            const projectId = projectRow.Identifier || 
                            await deps.call(ProductionUtils.computeIdentifier, projectRow.Show, projectRow.Client, projectRow.Year);
            
            if (projectId === currentProjectId) continue;
            
            try {
                const projectItems = await deps.call(PackListUtils.extractItems, projectId);
                if (projectItems[itemId] && projectItems[itemId] > 0) {
                    conflictingShows.push(projectId);
                }
            } catch (e) {
                // Ignore projects that can't be loaded
            }
        }
        
        return conflictingShows;
    }

    /**
     * Calculate remaining quantity for an item based on inventory, current usage, and overlapping shows
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} currentProjectId - Current project identifier
     * @param {string} itemId - Item ID to calculate remaining quantity for
     * @returns {Promise<number>} Remaining available quantity
     */
    static async calculateRemainingQuantity(deps, currentProjectId, itemId) {
        if (!itemId || !currentProjectId) {
            return 0;
        }

        // Run inventory lookup and overlapping shows check in parallel
        const [inventoryQuantity, overlappingShows, currentProjectItems] = await Promise.all([
            deps.call(PackListUtils.getItemInventoryQuantity, itemId),
            deps.call(PackListUtils.getItemOverlappingShows, currentProjectId, itemId),
            deps.call(PackListUtils.extractItems, currentProjectId)
        ]);

        const currentProjectUsage = currentProjectItems[itemId] || 0;
        let totalUsed = currentProjectUsage;
        
        // Add quantities from overlapping shows (leveraging cache)
        for (const projectId of overlappingShows) {
            try {
                const projectItems = await deps.call(PackListUtils.extractItems, projectId);
                totalUsed += projectItems[itemId] || 0;
            } catch (e) {
                // Ignore if project can't be loaded
            }
        }
        
        return inventoryQuantity - totalUsed;
    }
}

export const PackListUtils = wrapMethods(packListUtils_uncached, 'packlist_utils', ['savePackList']);