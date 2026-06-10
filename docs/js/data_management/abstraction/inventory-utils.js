import { Database, ProductionUtils, PackListUtils, wrapMethods, parseDate, toISODateString, searchFilter, todayISOString, ApplicationUtils, invalidateCache, EditHistoryUtils } from '../index.js';

/** Normalize an identifier for loose matching (strips spaces, case, non-alphanumeric) */
function _normalizeId(v) { return String(v || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); }

/**
 * Utility functions for inventory operations
 */
class inventoryUtils_uncached {
    static DEFAULT_INVENTORY_MAPPING = {
        itemNumber: 'ITEM#',
        quantity: 'QTY',
        description: 'Description',
        notes: 'NOTES',
        edithistory: 'EditHistory'
    };

    static async getTabNameForItem(deps, itemName) {
        const indexData = await deps.call(Database.getData, 'INVENTORY', 'INDEX', { prefix: 'PREFIX', tab: 'INVENTORY' });
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
        
        // If prefix lookup failed, check HARDWARE table for exact item number match
        if (!tab) {
            try {
                const hardwareData = await deps.call(Database.getData, 'INVENTORY', 'HARDWARE', inventoryUtils_uncached.DEFAULT_INVENTORY_MAPPING);
                const hardwareItem = hardwareData.find(item => item.itemNumber === itemName);
                if (hardwareItem) {
                    return 'HARDWARE';
                }
            } catch (error) {
                console.error('Error checking HARDWARE table:', error);
            }
        }
        
        return tab || null;
    }

    static async getItemInfo(deps, itemName, fields, referenceDate) {
        const itemNames = Array.isArray(itemName) ? itemName : [itemName];
        const infoFields = Array.isArray(fields) ? fields : [fields];
        const itemsByTab = {};
        const unmappedItems = [];
        for (const item of itemNames) {
            if (!item) continue;
            const tab = await deps.call(InventoryUtils.getTabNameForItem, item);
            if (!tab) {
                unmappedItems.push(item);
                continue;
            }
            if (!itemsByTab[tab]) itemsByTab[tab] = [];
            itemsByTab[tab].push(item);
        };
        const refDeciseconds = referenceDate ? Math.floor(parseDate(referenceDate).getTime() / 100) : null;
        const results = [];
        for (const [tab, items] of Object.entries(itemsByTab)) {
            try {
                let tabData = await deps.call(Database.getData, 'INVENTORY', tab, inventoryUtils_uncached.DEFAULT_INVENTORY_MAPPING);
                if (refDeciseconds) {
                    const { updatedItems } = EditHistoryUtils.applyPendingChangesToData(tabData, refDeciseconds);
                    tabData = updatedItems;
                }
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

    static async getInventoryTabData(deps, tabOrItemName, mapping = inventoryUtils_uncached.DEFAULT_INVENTORY_MAPPING, filters = null, referenceDate) {

        // Get all tabs on the inventory sheet
        const allTabs = await deps.call(Database.getTabs, 'INVENTORY');

        // Check if the tab exists
        const tabExists = allTabs.some(tab => tab.title === tabOrItemName);
        let resolvedTabName = tabOrItemName;

        if (!tabExists) {
            const foundTab = await deps.call(InventoryUtils.getTabNameForItem, tabOrItemName);
            if (!foundTab) throw new Error(`Inventory tab for "${tabOrItemName}" not found and could not be resolved from INDEX.`);
            resolvedTabName = foundTab;
        }

        // Get tab data as JS objects (mapping transforms 2D array to objects)
        let tabData = await deps.call(Database.getData, 'INVENTORY', resolvedTabName, mapping);

        // If a referenceDate is provided, project the data to that date by applying
        // any pending changes due on or before that date (in-memory, no save).
        if (referenceDate) {
            const refDeciseconds = Math.floor(parseDate(referenceDate).getTime() / 100);
            const { updatedItems } = EditHistoryUtils.applyPendingChangesToData(tabData, refDeciseconds);
            tabData = updatedItems;
        }

        // Apply search filter if filters are provided (after transformation to objects)
        if (filters) {
            tabData = searchFilter(tabData, filters);
        }

        return tabData;
    }

    static async saveInventoryTabData(mappedData, tabOrItemName, mapping = inventoryUtils_uncached.DEFAULT_INVENTORY_MAPPING, filters = null, username = null, options = {}) {
        const { source = 'web', scheduledDate = null, note = '' } = options;
        
        const allTabs = await Database.getTabs('INVENTORY');
        const tabExists = allTabs.some(tab => tab.title === tabOrItemName);
        let resolvedTabName = tabOrItemName;

        if (!tabExists) {
            const foundTab = await InventoryUtils.getTabNameForItem(tabOrItemName);
            if (!foundTab) throw new Error(`Inventory tab for "${tabOrItemName}" not found and could not be resolved from INDEX.`);
            resolvedTabName = foundTab;
        }
        
        // CRITICAL: Check lock status before saving to prevent conflicts
        const lockInfo = await ApplicationUtils.getSheetLock('INVENTORY', resolvedTabName, username);
        if (lockInfo && lockInfo.user !== username) {
            const errorMsg = `Cannot save: inventory category is locked by ${lockInfo.user}`;
            console.warn(`[InventoryUtils.saveInventoryTabData] ${errorMsg}`);
            throw new Error(errorMsg);
        }
        
        // Lock management is now handled by components via watchers on global locks store
        // Components acquire locks on edit mode entry and release on save completion

        // If a future scheduledDate is provided, store changes as pending instead of applying
        const todayISO = todayISOString();
        const effectiveDate = scheduledDate || todayISO;
        const isFuture = effectiveDate > todayISO;

        if (isFuture) {
            // Compute diff against existing data and create pending entries
            const existingData = await Database.getData('INVENTORY', resolvedTabName, mapping);
            const shortUser = username ? username.split('@')[0] : 'unknown';
            const effectiveDeciseconds = Math.floor(parseDate(effectiveDate).getTime() / 100);

            // For a new row (no match in existing data), build a bare version:
            // item number is saved immediately with all content fields zeroed/empty,
            // and any non-default content is added as a pending scheduled change.
            const buildBareRow = (item) => {
                const bare = {};
                for (const key of Object.keys(item)) {
                    if (['AppData', 'MetaData'].includes(key)) continue;
                    if (key === 'itemNumber' || key === 'edithistory' || key === 'EditHistory') {
                        bare[key] = item[key];
                    } else {
                        // Numeric fields → 0, string fields → ''
                        const num = parseFloat(item[key]);
                        bare[key] = (!isNaN(num) && String(item[key]).trim() !== '') ? 0 : '';
                    }
                }
                return bare;
            };

            const updatedRows = (Array.isArray(mappedData) ? mappedData : Array.from(mappedData)).map(item => {
                const existingItem = existingData.find(row => row.itemNumber === item.itemNumber);
                // Use existing row as base, or a bare new row for new items
                const baseItem = existingItem || buildBareRow(item);

                const changes = [];
                for (const key of Object.keys(item)) {
                    if (['edithistory', 'EditHistory', 'AppData', 'MetaData'].includes(key)) continue;
                    if (String(item[key]) !== String(baseItem[key] ?? '')) {
                        const existingNum = parseFloat(baseItem[key]);
                        const newNum = parseFloat(item[key]);
                        const bothNumeric = !isNaN(existingNum) && !isNaN(newNum)
                            && String(baseItem[key]).trim() !== ''
                            && String(item[key]).trim() !== '';
                        let ne = item[key];
                        if (bothNumeric) {
                            const delta = newNum - existingNum;
                            ne = delta >= 0 ? `+${delta}` : `${delta}`;
                        }
                        changes.push({ n: key, ne });
                    }
                }

                if (changes.length === 0) return baseItem;

                const pendingEntry = EditHistoryUtils.createPendingEntry(shortUser, changes, effectiveDeciseconds, note);
                const updatedEH = EditHistoryUtils.appendToPendingChanges(baseItem.edithistory || baseItem.EditHistory, pendingEntry);
                return { ...baseItem, edithistory: updatedEH };
            });

            return await Database.setData('INVENTORY', resolvedTabName, updatedRows, mapping, {
                username,
                identifierKey: 'itemNumber',
                source: note || 'scheduled',
                skipMetadata: true
            });
        }

        let saveResult;
        try {
            if (filters) {
                // Fetch existing data from the tab
                const existingData = await Database.getData('INVENTORY', resolvedTabName, mapping);

                // Prepare batch updates
                const updates = mappedData.filter(item => {
                    const existingItem = existingData.find(row => row.itemNumber === item.itemNumber);
                    return existingItem && JSON.stringify(existingItem) !== JSON.stringify(item);
                });

                // Send updates one by one with username
                for (const update of updates) {
                    await Database.updateRow('INVENTORY', resolvedTabName, update, mapping, { username, source });
                }

                saveResult = true;
            } else {
                if (mappedData && typeof mappedData === 'object' && mappedData.__v_isReactive) {
                    mappedData = Array.from(mappedData);
                }

                // Save JS objects using mapping with edithistory options
                // Use note as the source descriptor when provided
                saveResult = await Database.setData('INVENTORY', resolvedTabName, mappedData, mapping, {
                    username,
                    identifierKey: 'itemNumber',
                    source: note || source
                });
            }
        } finally {
            // Lock management is handled by components
            // No lock release needed here
        }

        return saveResult;
    }


    /**
     * Check item availability for a project
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} projectIdentifier - Project identifier
     * @returns {Promise<Object>} Item availability map
     */
    static async checkItemAvailability(deps, projectIdentifier) {
        
        try {
            // Look up the show's ship date so inventory reflects the state at time of packing
            const shipDate = await deps.call(ProductionUtils.getProjectShipDate, projectIdentifier);
            const referenceDate = shipDate || todayISOString();

            // 1. Get pack list items (all packlists for this show, including suffix variants)
            const itemMap = await deps.call(PackListUtils.extractAllItemsForShow, projectIdentifier);
            const itemIds = Object.keys(itemMap);

            // If no items, return empty result
            if (!itemIds.length) {
                return {};
            }

            // Get inventory quantities as of ship date
            let inventoryInfo = await deps.call(InventoryUtils.getItemInfo, itemIds, "QTY", referenceDate);
            
            // Filter valid items and build result
            const result = {};
            itemIds.forEach(itemId => {
                const qty = inventoryInfo.find(i => i.itemName === itemId)?.quantity ?? null;
                if (qty !== null) {
                    result[itemId] = { available: qty, allocated: 0, onOrder: 0 };
                }
            });

            // Get overlapping shows
            let overlappingIds = await deps.call(ProductionUtils.getOverlappingShows, {
                dateFilters: [
                    { column: 'Return', value: projectIdentifier, type: 'after' },
                    { column: 'Ship', value: projectIdentifier, type: 'before' }
                ]
            });
            
            // Deduplicate to prevent double-counting items when a show has multiple booths
            overlappingIds = await deps.call(ProductionUtils.deduplicateScheduleByShow, overlappingIds);
            const packlistTabs = await deps.call(Database.getTabs, 'PACK_LISTS');
            
            // Process overlapping shows
            for (const overlapRow of overlappingIds) {
                // Use Direction-1 matching: schedule row → packlist tab(s)
                const matchingTabs = await deps.call(ProductionUtils.findPacklistTabsForScheduleRow, overlapRow, packlistTabs);
                const overlapId = matchingTabs[0]?.title ||
                    overlapRow.Identifier ||
                    await deps.call(ProductionUtils.computeIdentifier, overlapRow.Show, overlapRow.Client, overlapRow.Year);
                
                if (_normalizeId(overlapId) === _normalizeId(projectIdentifier)) continue;
                
                const overlapInfo = await deps.call(PackListUtils.extractAllItemsForShow, overlapId);
                
                for (const itemId of Object.keys(overlapInfo)) {
                    if (!result[itemId]) continue;
                    
                    const allocated = result[itemId].allocated + (overlapInfo[itemId].allocated || 0);
                    const onOrder = result[itemId].onOrder + (overlapInfo[itemId].onOrder || 0);
                    result[itemId] = { ...result[itemId], allocated, onOrder };
                }
            }
            
            return result;
        } catch (error) {
            console.error('Failed to check quantities:', error);
            throw error;
        }
    }

    /**
     * Get inventory description for a specific item
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} itemNumber - The item number to look up
     * @returns {Promise<string|null>} Item description or null if not found
     */
    static async getItemDescription(deps, itemNumber, referenceDate) {
        if (!itemNumber) return null;
        
        try {
            const itemInfo = await deps.call(InventoryUtils.getItemInfo, itemNumber, ['description'], referenceDate);
            return itemInfo?.[0]?.description || null;
        } catch (error) {
            console.error(`Failed to get description for item ${itemNumber}:`, error);
            return null;
        }
    }



    /**
     * Returns inventory rows that have a pending entry matching the given
     * effective date (deciseconds). Used to populate the change history editor.
     * @param {Object} deps
     * @param {string} tabOrItemName
     * @param {number} effectiveDateDeciseconds
     * @param {Object} [mapping]
     * @returns {Promise<Array<Object>>}
     */
    static async getInventoryRowsForPendingEntry(deps, tabOrItemName, effectiveDateDeciseconds, mapping = inventoryUtils_uncached.DEFAULT_INVENTORY_MAPPING) {
        const allTabs = await deps.call(Database.getTabs, 'INVENTORY');
        const tabExists = allTabs.some(tab => tab.title === tabOrItemName);
        let resolvedTabName = tabOrItemName;
        if (!tabExists) {
            const foundTab = await deps.call(InventoryUtils.getTabNameForItem, tabOrItemName);
            if (!foundTab) throw new Error(`Inventory tab for "${tabOrItemName}" not found.`);
            resolvedTabName = foundTab;
        }
        const rows = await deps.call(Database.getData, 'INVENTORY', resolvedTabName, mapping);
        return rows.filter(row => {
            const pending = EditHistoryUtils.getPendingEntries(row.edithistory || row.EditHistory);
            return pending.some(e => e.t === effectiveDateDeciseconds);
        });
    }

    /**
     * Check and apply any pending changes due today or earlier for a given tab.
     * Mutation — uncached. Saves the tab once if any changes were applied.
     * @param {string} tabOrItemName
     * @param {string} [username]
     * @param {Object} [mapping]
     * @returns {Promise<{ applied: boolean }>}
     */
    static async checkAndApplyPendingChanges(tabOrItemName, username = null, mapping = inventoryUtils_uncached.DEFAULT_INVENTORY_MAPPING) {
        console.log(`[InventoryUtils] Checking for pending changes to apply for "${tabOrItemName}"...`);
        
        const allTabs = await Database.getTabs('INVENTORY');
        const tabExists = allTabs.some(tab => tab.title === tabOrItemName);
        let resolvedTabName = tabOrItemName;
        if (!tabExists) {
            const foundTab = await InventoryUtils.getTabNameForItem(tabOrItemName);
            if (!foundTab) return { applied: false };
            resolvedTabName = foundTab;
        }

        const rows = await Database.getData('INVENTORY', resolvedTabName, mapping);
        const todayDeciseconds = Math.floor(new Date().setHours(0, 0, 0, 0) / 100);
        const { updatedItems, hasChanges } = EditHistoryUtils.applyPendingChangesToData(rows, todayDeciseconds);

        if (!hasChanges) return { applied: false };

        await Database.setData('INVENTORY', resolvedTabName, updatedItems, mapping, {
            username,
            identifierKey: 'itemNumber',
            skipMetadata: true
        });
        return { applied: true };
    }

    /**
     * Update the pending change entry matching effectiveDateDeciseconds on each
     * of the provided rows. Only the EditHistory column is written back.
     * Mutation — uncached.
     * @param {string} tabOrItemName
     * @param {Array<Object>} originalRows - Original rows before edits (current field values)
     * @param {Array<Object>} editedRows - Rows as edited in the modal (future field values)
     * @param {number} effectiveDateDeciseconds
     * @param {string} [note] - Updated note (≤25 chars)
     * @param {string} [username]
     * @param {Object} [mapping]
     * @returns {Promise<boolean>}
     */
    static async savePendingChangeEntry(tabOrItemName, originalRows, editedRows, effectiveDateDeciseconds, note = null, username = null, mapping = inventoryUtils_uncached.DEFAULT_INVENTORY_MAPPING) {
        console.log(`[InventoryUtils] Saving pending change entry for "${tabOrItemName}"...`);
        
        const allTabs = await Database.getTabs('INVENTORY');
        const tabExists = allTabs.some(tab => tab.title === tabOrItemName);
        let resolvedTabName = tabOrItemName;
        if (!tabExists) {
            const foundTab = await InventoryUtils.getTabNameForItem(tabOrItemName);
            if (!foundTab) throw new Error(`Inventory tab for "${tabOrItemName}" not found.`);
            resolvedTabName = foundTab;
        }

        const updatedRows = originalRows.map(origRow => {
            const editedRow = editedRows.find(r => r.itemNumber === origRow.itemNumber);
            if (!editedRow) return origRow;

            const ehKey = Object.prototype.hasOwnProperty.call(origRow, 'edithistory') ? 'edithistory' : 'EditHistory';
            const parsed = EditHistoryUtils.parseEditHistory(origRow[ehKey]) || {};
            if (!Array.isArray(parsed.p)) return origRow;

            parsed.p = parsed.p.map(entry => {
                if (entry.t !== effectiveDateDeciseconds) return entry;
                // Rebuild c from diff between original and edited rows
                const newChanges = entry.c.map(ch => {
                    const editedVal = editedRow[ch.n];
                    return { n: ch.n, ne: editedVal !== undefined ? editedVal : ch.ne };
                });
                return {
                    ...entry,
                    c: newChanges,
                    s: note !== null ? String(note).slice(0, 25) : entry.s
                };
            });

            return { ...origRow, [ehKey]: JSON.stringify(parsed) };
        });

        return await Database.setData('INVENTORY', resolvedTabName, updatedRows, mapping, {
            username,
            identifierKey: 'itemNumber',
            skipMetadata: true
        });
    }

    /**
     * Build a full item timeline for a given item within a date window.
     * Returns an array of events sorted chronologically:
     *   - Inventory changes (from edithistory.h) with event "Inv. Change"
     *   - Scheduled pending changes (from edithistory.p) with event "Scheduled"
     *   - Show ship events (event "Ships", note = project identifier)
     *   - Show return events (event "Returns", note = project identifier)
     *
     * Quantity column reflects the inventory state after each event.
     *
     * @param {Object} deps
     * @param {string} itemId - Item identifier (e.g. "F-101")
     * @param {string} startDate - ISO date string for window start (inclusive)
     * @param {string} endDate - ISO date string for window end (inclusive)
     * @returns {Promise<Array<{date: string, event: string, note: string, change: string, quantity: number|null}>>}
     */
    static async getItemTimeline(deps, itemId, startDate, endDate) {
        if (!itemId) return [];

        // Resolve tab and raw row
        const tab = await deps.call(InventoryUtils.getTabNameForItem, itemId);
        if (!tab) return [];

        const tabData = await deps.call(Database.getData, 'INVENTORY', tab, inventoryUtils_uncached.DEFAULT_INVENTORY_MAPPING);

        // Normalise item lookup (strip tab prefix if present)
        let lookupId = itemId;
        if (itemId.includes('-')) {
            const suffix = itemId.split('-')[1];
            const found = tabData.find(r => r.itemNumber === suffix) ? suffix : itemId;
            lookupId = found;
        }
        const row = tabData.find(r => r.itemNumber === lookupId) || tabData.find(r => r.itemNumber === itemId);
        if (!row) return [];

        const currentQty = parseInt(row.quantity ?? row.QTY ?? 0, 10) || 0;
        const parsed = EditHistoryUtils.parseEditHistory(row.edithistory || row.EditHistory) || {};
        const history = Array.isArray(parsed.h) ? parsed.h : [];
        const pending = Array.isArray(parsed.p) ? parsed.p : [];

        const startParsed = startDate ? parseDate(startDate) : null;
        const endParsed   = endDate   ? parseDate(endDate)   : null;
        const startDs = startParsed ? Math.floor(startParsed.getTime() / 100) : null;
        const endDs   = endParsed   ? Math.floor(new Date(endParsed.getTime()).setHours(23, 59, 59, 999) / 100) : null;

        // All events carry internal _delta (relative) or _absoluteQty (anchor) for the forward pass.
        const events = [];

        // ── Phase 2: Inventory history entries ──
        // Walk newest-first to compute per-entry deltas via backward replay from currentQty.
        // The opening balance is derived here: when the replay first crosses startDate,
        // runningQty has been rewound past all post-startDate changes — that is the qty at startDate.
        let runningQty = currentQty;
        let startQty = currentQty;
        let openingBalanceSet = false;

        for (const entry of history) {
            const ds = entry.t;
            const date = toISODateString(new Date(ds * 100));

            // Capture opening balance the moment we see the first entry strictly BEFORE startDate.
            // Using strict less-than ensures entries ON startDate are fully rewound before capture,
            // so the balance reflects qty before any startDate changes (preventing double-count).
            if (!openingBalanceSet && startDs !== null && ds < startDs) {
                startQty = runningQty;
                openingBalanceSet = true;
            }

            let delta = 0;
            const changeLabels = [];
            if (Array.isArray(entry.c)) {
                for (const ch of entry.c) {
                    if (ch.n === 'quantity' || ch.n === 'QTY') {
                        const oldVal = parseInt(ch.o, 10) || 0;
                        delta = runningQty - oldVal;
                        changeLabels.push(`quantity: ${delta >= 0 ? '+' + delta : delta}`);
                    } else {
                        changeLabels.push(ch.n);
                    }
                }
            }

            const inWindow = (!startDs || ds >= startDs) && (!endDs || ds <= endDs);
            if (inWindow) {
                const noteText = entry.u ? (entry.s ? `${entry.u}: ${entry.s}` : entry.u) : (entry.s || '');
                events.push({
                    date,
                    event: 'Inv. Change',
                    note: noteText,
                    change: changeLabels.join(', ') || '',
                    quantity: null,
                    _delta: delta
                });
            }

            // Rewind regardless of window (needed to correctly replay earlier entries)
            if (Array.isArray(entry.c)) {
                for (const ch of entry.c) {
                    if (ch.n === 'quantity' || ch.n === 'QTY') {
                        runningQty = parseInt(ch.o, 10) || 0;
                    }
                }
            }
        }

        // If all history entries are after startDate (or there is no history),
        // runningQty is fully rewound to before any recorded changes — correct opening balance.
        if (!openingBalanceSet) {
            startQty = runningQty;
        }

        // Opening balance row — used as the forward-pass anchor
        if (startDate) {
            events.push({ date: startDate, event: 'Balance', note: '', change: '', quantity: startQty, _done: true });
        }

        // ── Phase 3: Pending (scheduled) entries ──
        for (const entry of pending) {
            const ds = entry.t;
            const date = toISODateString(new Date(ds * 100));
            const inWindow = (!startDs || ds >= startDs) && (!endDs || ds <= endDs);
            if (!inWindow) continue;

            const changeLabels = [];
            let qtyDelta = 0;
            if (Array.isArray(entry.c)) {
                for (const ch of entry.c) {
                    const ne = ch.ne;
                    const label = (typeof ne === 'string' && /^[+-]/.test(ne))
                        ? `quantity: ${ne.startsWith('+') ? ne : (parseInt(ne, 10) >= 0 ? '+' + ne : ne)}`
                        : `${ch.n}: ${ne}`;
                    changeLabels.push(label);
                    // Accumulate quantity delta so the forward pass stacks entries correctly.
                    // ne is always a delta string (e.g. '+2', '-1') for numeric fields.
                    if ((ch.n === 'quantity' || ch.n === 'QTY') && typeof ne === 'string' && /^[+\-]\d/.test(ne)) {
                        qtyDelta += parseFloat(ne);
                    }
                }
            }

            const scheduledNote = entry.u ? (entry.s ? `${entry.u}: ${entry.s}` : entry.u) : (entry.s || '');
            events.push({
                date,
                event: 'Scheduled',
                note: scheduledNote,
                change: changeLabels.join(', '),
                quantity: null,
                _delta: qtyDelta
            });
        }

        // ── Phase 4: Show ship / return events ──
        if (startDate && endDate) {
            try {
                // Find shows whose window overlaps [startDate, endDate]:
                //   show ships on/before endDate  AND  show returns on/after startDate
                const overlapping = await deps.call(ProductionUtils.getOverlappingShows, {
                    dateFilters: [
                        { column: 'Ship',   value: endDate,   type: 'before' },
                        { column: 'Return', value: startDate, type: 'after'  }
                    ]
                });

                // Deduplicate to prevent double-counting items when a show has multiple booths
                const deduplicated = await deps.call(ProductionUtils.deduplicateScheduleByShow, overlapping);
                const packlistTabs = await deps.call(Database.getTabs, 'PACK_LISTS');

                for (const showRow of deduplicated) {
                    // Use Direction-1 matching: schedule row → packlist tab(s)
                    const matchingTabs = await deps.call(ProductionUtils.findPacklistTabsForScheduleRow, showRow, packlistTabs);
                    const identifier = matchingTabs[0]?.title ||
                        showRow.Identifier ||
                        await deps.call(ProductionUtils.computeIdentifier, showRow.Show, showRow.Client, showRow.Year);

                    let packedQty = 0;
                    try {
                        const showItems = await deps.call(PackListUtils.extractAllItemsForShow, identifier);
                        //console.log('[timeline] extractItems for', identifier, '→', showItems);
                        packedQty = showItems[itemId] || 0;
                        if (!packedQty) continue;
                    } catch (_) {
                        continue;
                    }

                    const shipDate = await deps.call(ProductionUtils.getProjectShipDateFromRow, showRow);
                    const returnDate = await deps.call(ProductionUtils.getProjectReturnDateFromRow, showRow);
                    //console.log('[timeline]', identifier, '| shipDate:', shipDate, '| returnDate:', returnDate, '| window:', startDate, '→', endDate);

                    if (shipDate) {
                        const shipDs = Math.floor(parseDate(shipDate).getTime() / 100);
                        const shipInWindow = (!startDs || shipDs >= startDs) && (!endDs || shipDs <= endDs);
                        //console.log('[timeline] ship window check:', shipDate, '| inWindow:', shipInWindow, '| startDs:', startDs, 'shipDs:', shipDs, 'endDs:', endDs);
                        if (shipInWindow) {
                            events.push({ date: shipDate, event: 'Ships', note: identifier, change: `quantity: -${packedQty}`, quantity: null, _delta: -packedQty });
                        }
                    }
                    if (returnDate) {
                        const retDs = Math.floor(parseDate(returnDate).getTime() / 100);
                        const retInWindow = (!startDs || retDs >= startDs) && (!endDs || retDs <= endDs);
                        //console.log('[timeline] return window check:', returnDate, '| inWindow:', retInWindow);
                        if (retInWindow) {
                            events.push({ date: returnDate, event: 'Returns', note: identifier, change: `quantity: +${packedQty}`, quantity: null, _delta: packedQty });
                        }
                    }
                }
            } catch (err) {
                console.error('[timeline] error in show events phase:', err);
            }
        }

        // ── Phase 5: Sort ──
        const eventOrder = { 'Balance': -1, 'Returns': 0, 'Inv. Change': 1, 'Scheduled': 2, 'Ships': 3 };
        events.sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            return (eventOrder[a.event] ?? 9) - (eventOrder[b.event] ?? 9);
        });

        // ── Phase 6: Forward pass — accumulate running quantity ──
        let fwdQty = startQty;
        for (const event of events) {
            if (event._done) {
                // Balance row: already has qty; reset accumulator
                fwdQty = event.quantity;
            } else {
                fwdQty += (event._delta ?? 0);
                event.quantity = fwdQty;
            }
            delete event._delta;
            delete event._done;
        }

        return events;
    }

    /**
     * Compute a per-item inventory report summary across a set of shows.
     * Returns start/end date range, inventory quantity, and the worst-case
     * (minimum) remaining quantity across all simultaneous show demand.
     *
     * Uses getItemTimeline via getItemMinQuantityInRange to properly account
     * for all inventory changes (historical and pending) combined with show demands.
     *
     * @param {Object} deps
     * @param {string} itemId - Item identifier (e.g. "F-101")
     * @param {Object} shows - Map of { showIdentifier: qty } for this item
     * @returns {Promise<{startDate: string|null, endDate: string|null, inventoryQty: number|null, minQty: number|null}>}
     */
    static async getItemReportSummary(deps, rowData) {
        const { itemId, shows } = rowData || {};
        if (!itemId || !shows || Object.keys(shows).length === 0) {
            return { startDate: null, endDate: null, inventoryQty: null, minQty: null };
        }

        const showIds = Object.keys(shows).filter(id => (shows[id] || 0) > 0);
        if (showIds.length === 0) {
            return { startDate: null, endDate: null, inventoryQty: null, minQty: null };
        }

        // Fetch ship and return dates for all shows
        const showDates = await Promise.all(
            showIds.map(async (showId) => {
                const [shipDate, returnDate] = await Promise.all([
                    deps.call(ProductionUtils.getProjectShipDate, showId).catch(() => null),
                    deps.call(ProductionUtils.getProjectReturnDate, showId).catch(() => null)
                ]);
                return { showId, qty: shows[showId] || 0, shipDate, returnDate };
            })
        );

        // Determine date range
        const shipDates = showDates.map(s => s.shipDate).filter(Boolean).sort();
        const returnDates = showDates.map(s => s.returnDate).filter(Boolean).sort();
        const startDate = shipDates[0] || null;
        const endDate = returnDates[returnDates.length - 1] || startDate;

        // Get inventory qty as of the earliest ship date
        const refDate = startDate || todayISOString();
        const inventoryQty = await deps.call(PackListUtils.getItemInventoryQuantity, itemId, refDate);

        if (inventoryQty === null) {
            return { startDate, endDate, inventoryQty: null, minQty: null };
        }

        // Use the timeline-backed minimum helper directly and do not post-process
        // quantities after loading.
        const minQty = await deps.call(InventoryUtils.getItemMinQuantityInRange, itemId, startDate, endDate);

        return { startDate, endDate, inventoryQty, minQty };
    }

    /**
     * Get the minimum inventory quantity for an item over a date range.
     * Delegates to getItemTimeline and returns the lowest quantity value seen.
     * @param {Object} deps
     * @param {string} itemId
     * @param {string|null} startDate - ISO date string (YYYY-MM-DD)
     * @param {string|null} endDate - ISO date string (YYYY-MM-DD)
     * @returns {Promise<number|null>} Minimum quantity in the range, or null if no data
     */
    static async getItemMinQuantityInRange(deps, itemId, startDate, endDate) {
        if (!itemId) return null;
        // getItemTimeline only includes show ship/return events when both dates are provided.
        // Use a 2-year fallback so the full demand window is always evaluated.
        let effectiveEnd = endDate;
        if (!effectiveEnd) {
            const d = new Date();
            d.setFullYear(d.getFullYear() + 2);
            effectiveEnd = toISODateString(d);
        }
        const events = await deps.call(InventoryUtils.getItemTimeline, itemId, startDate, effectiveEnd);
        const quantities = events.map(e => e.quantity).filter(q => q !== null && q !== undefined && !isNaN(q));
        return quantities.length > 0 ? Math.min(...quantities) : null;
    }

    /**
     * Remove a pending change entry by effectiveDateDeciseconds from matching rows
     * and save the updated EditHistory back. Mutation — uncached.
     * @param {string} tabOrItemName
     * @param {number} effectiveDateDeciseconds
     * @param {string} [username]
     * @param {Object} [mapping]
     * @returns {Promise<boolean>}
     */
    static async deletePendingChangeEntry(tabOrItemName, effectiveDateDeciseconds, username = null, mapping = inventoryUtils_uncached.DEFAULT_INVENTORY_MAPPING) {
        const allTabs = await Database.getTabs('INVENTORY');
        const tabExists = allTabs.some(tab => tab.title === tabOrItemName);
        let resolvedTabName = tabOrItemName;
        if (!tabExists) {
            const foundTab = await InventoryUtils.getTabNameForItem(tabOrItemName);
            if (!foundTab) throw new Error(`Inventory tab for "${tabOrItemName}" not found.`);
            resolvedTabName = foundTab;
        }

        const rows = await Database.getData('INVENTORY', resolvedTabName, mapping);
        const updatedRows = rows.map(row => {
            const ehKey = Object.prototype.hasOwnProperty.call(row, 'edithistory') ? 'edithistory' : 'EditHistory';
            const parsed = EditHistoryUtils.parseEditHistory(row[ehKey]);
            if (!parsed || !Array.isArray(parsed.p)) return row;
            const filtered = parsed.p.filter(e => e.t !== effectiveDateDeciseconds);
            if (filtered.length === parsed.p.length) return row;
            return { ...row, [ehKey]: JSON.stringify({ ...parsed, p: filtered }) };
        });

        return await Database.setData('INVENTORY', resolvedTabName, updatedRows, mapping, {
            username,
            identifierKey: 'itemNumber',
            skipMetadata: true
        });
    }

}

export const InventoryUtils = wrapMethods(inventoryUtils_uncached, 'inventory_utils', [
    'saveInventoryTabData',
    'checkAndApplyPendingChanges',
    'savePendingChangeEntry',
    'deletePendingChangeEntry'
]);