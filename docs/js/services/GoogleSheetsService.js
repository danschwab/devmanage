import { GoogleSheetsAuth, SPREADSHEET_IDS, GetTopFuzzyMatch } from '../index.js';

export class GoogleSheetsService {
    // Add static cache for all spreadsheets
    static sheetCache = {
        timestamp: {},
        data: {},
        TTL: 5 * 60 * 1000 // 5 minutes
    };

    // Static cache for production schedule identifier dependencies
    static prodSchedIdentifierCache = {
        clients: null,
        shows: null,
        timestamp: 0,
        TTL: 5 * 60 * 1000 // 5 minutes
    };

    // Exponential backoff helper for Google Sheets API calls
    static async withExponentialBackoff(fn, maxRetries = 5, initialDelay = 500) {
        let attempt = 0;
        let delay = initialDelay;
        while (true) {
            try {
                return await fn();
            } catch (err) {
                // Check for rate limit or quota errors
                const isRateLimit = err && (
                    (err.status && (err.status === 429 || err.status === 403)) ||
                    (err.result && err.result.error && (
                        err.result.error.status === 'RESOURCE_EXHAUSTED' ||
                        err.result.error.status === 'PERMISSION_DENIED' ||
                        err.result.error.message?.toLowerCase().includes('rate limit') ||
                        err.result.error.message?.toLowerCase().includes('quota')
                    ))
                );
                if (!isRateLimit || attempt >= maxRetries) throw err;
                await new Promise(res => setTimeout(res, delay));
                delay *= 2;
                attempt++;
            }
        }
    }

    static async getSheetData(spreadsheetId, range, useCache = true) {
        // Check cache first if enabled
        if (useCache) {
            const now = Date.now();
            const cacheKey = `${spreadsheetId}:${range}`;
            if (this.sheetCache.data[cacheKey] && 
                now - (this.sheetCache.timestamp[cacheKey] || 0) < this.sheetCache.TTL) {
                console.log(`Cache hit for ${cacheKey}`);
                return this.sheetCache.data[cacheKey];
            }
        }

        // Fetch new data
        await GoogleSheetsAuth.checkAuth();
        const response = await GoogleSheetsService.withExponentialBackoff(() =>
            gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId,
                range,
            })
        );

        // Update cache if enabled
        if (useCache) {
            const cacheKey = `${spreadsheetId}:${range}`;
            this.sheetCache.data[cacheKey] = response.result.values;
            this.sheetCache.timestamp[cacheKey] = Date.now();
        }

        return response.result.values;
    }

    static clearCache(spreadsheetId = null, range = null) {
        if (!spreadsheetId) {
            // Clear all cache
            this.sheetCache.data = {};
            this.sheetCache.timestamp = {};
            return;
        }

        const prefix = `${spreadsheetId}:`;
        Object.keys(this.sheetCache.data).forEach(key => {
            if (key.startsWith(prefix) && (!range || key === `${spreadsheetId}:${range}`)) {
                delete this.sheetCache.data[key];
                delete this.sheetCache.timestamp[key];
            }
        });
    }

    /**
     * Extracts item quantities from pack list content.
     * @param {object} packList - The pack list content object.
     * @returns {object} Map of itemId to quantity.
     */
    static extractItemsFromPackList(packList) {
        const itemRegex = /(?:\(([0-9]+)\))?\s*([A-Z]+-[0-9]+[a-zA-Z]?)/;
        const itemMap = {};
        packList.crates.forEach(crate => {
            crate.items.forEach(row => {
                row.forEach(cell => {
                    if (!cell) return;
                    const match = cell.match(itemRegex);
                    if (match && match[2]) {
                        const qty = parseInt(match[1] || "1", 10);
                        const id = match[2];
                        itemMap[id] = (itemMap[id] || 0) + qty;
                    }
                });
            });
        });
        return itemMap;
    }

    static async checkItemQuantities(projectIdentifier) {
        console.group(`Checking quantities for project: ${projectIdentifier}`);
        try {
            // 1. Get pack list
            console.log('1. Getting pack list...');
            let packList;
            try {
                packList = await this.getPackListContent(projectIdentifier);
                console.log('Pack list retrieved:', packList);
            } catch (err) {
                console.error('Error getting pack list:', err);
                throw new Error('Failed to get pack list for project: ' + projectIdentifier);
            }

            // 2. Extract items (now using extracted function)
            console.log('2. Extracting items from pack list...');
            const itemMap = this.extractItemsFromPackList(packList);
            const itemIds = Object.keys(itemMap);

            // 3. Get inventory quantities FIRST
            console.log('3. Getting inventory quantities...');
            let inventoryInfo;
            try {
                inventoryInfo = await this.getInventoryInformation(itemIds, "QTY");
            } catch (err) {
                console.error('Error getting inventory:', err);
                throw new Error('Failed to get inventory information');
            }

            // Remove items with no inventory quantity
            const validItemIds = itemIds.filter(id => {
                const inventoryObj = inventoryInfo.find(i => i.itemName === id);
                return inventoryObj && inventoryObj.QTY !== null && inventoryObj.QTY !== undefined && inventoryObj.QTY !== '';
            });

            // 4. Initialize result with inventory and requested, and set remaining to inventory - requested
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

            // 5. Get overlapping shows
            console.log('5. Checking for overlapping shows...');
            let overlappingIds;
            try {
                overlappingIds = await this.getOverlappingShows({ identifier: projectIdentifier });
            } catch (err) {
                console.error('Error getting overlapping shows:', err);
                throw new Error('Failed to get overlapping shows');
            }

            // 6. Process overlapping shows and decrement remaining for each found item
            console.log('6. Processing overlapping shows...');
            for (const otherId of overlappingIds) {
                if (otherId === projectIdentifier) continue;
                try {
                    const otherPack = await this.getPackListContent(otherId);
                    if (!otherPack) continue;
                    // Use extractItemsFromPackList to get items and their quantities for the overlapping show
                    const overlapItemMap = this.extractItemsFromPackList(otherPack);
                    Object.entries(overlapItemMap).forEach(([id, qty]) => {
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

    static async getOverlappingShows(parameters) {
        console.group(`Getting overlapping shows for:`, parameters);
        try {
            await GoogleSheetsAuth.checkAuth();
            const tabName = "ProductionSchedule";
            
            // Use cached data for production schedule
            const data = await this.getSheetData(SPREADSHEET_IDS.PROD_SCHED, `${tabName}!A:J`);
            const headers = data[0];

            console.log('1. Verifying tab exists...');
            const tabs = await this.getSheetTabs(SPREADSHEET_IDS.PROD_SCHED);
            if (!tabs.includes(tabName)) {
                console.warn(`Tab "${tabName}" not found, skipping overlap check`);
                console.groupEnd();
                return [];
            }
            console.log('Tab found:', tabName);

            console.log('2. Getting headers...');
            const idx = (name) => {
                const index = headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
                console.log(`Column "${name}" found at index: ${index}`);
                return index;
            };

            const idxIdentifier = headers.findIndex(h => h.toLowerCase() === "identifier");
            const idxYear = headers.findIndex(h => h.toLowerCase() === "year");
            const idxShip = headers.findIndex(h => h.toLowerCase() === "ship");
            const idxReturn = headers.findIndex(h => h.toLowerCase() === "expected return date");
            const idxSStart = headers.findIndex(h => h.toLowerCase() === "s. start");
            const idxSEnd = headers.findIndex(h => h.toLowerCase() === "s. end");
            const idxShowName = headers.findIndex(h => h.toLowerCase() === "show name" || h.toLowerCase() === "show");
            const idxClient = headers.findIndex(h => h.toLowerCase() === "client");

            let year, startDate, endDate;
            console.log('5. Processing parameters...');

            if (typeof parameters === "string" || parameters.identifier) {
                const identifier = parameters.identifier || parameters;
                console.log(`Looking for show: ${identifier}`);

                // Instead of searching by Identifier column, use computeProdSchedIdentifier
                let foundRow = null;
                for (const row of data) {
                    // Compute identifier for this row
                    const showName = row[idxShowName];
                    const client = row[idxClient];
                    const yearVal = row[idxYear];
                    const computedIdentifier = await this.computeProdSchedIdentifier(showName, client, yearVal);
                    if (computedIdentifier === identifier) {
                        foundRow = row;
                        break;
                    }
                }

                if (!foundRow) {
                    console.warn(`Show ${identifier} not found in schedule`);
                    console.groupEnd();
                    return [];
                }
                console.log('Found show row:', foundRow);

                year = foundRow[idxYear];
                console.log(`Show year: ${year}`);

                let ship = this.parseDate(foundRow[idxShip]);
                let ret = this.parseDate(foundRow[idxReturn]);
                console.log('Initial dates:', { ship, ret });

                if (!ship) {
                    let sStart = this.parseDate(foundRow[idxSStart]);
                    ship = sStart ? new Date(sStart.getTime() - 10 * 86400000) : null;
                    console.log('Using adjusted start date:', ship);
                }
                if (!ret) {
                    let sEnd = this.parseDate(foundRow[idxSEnd]);
                    ret = sEnd ? new Date(sEnd.getTime() + 10 * 86400000) : null;
                    console.log('Using adjusted end date:', ret);
                }

                // Ensure ship and ret are in the correct year
                if (ship && ship.getFullYear() != year) {
                    ship.setFullYear(Number(year));
                    console.log('Adjusted ship year:', ship);
                }
                if (ret && ret.getFullYear() != year) {
                    ret.setFullYear(Number(year));
                    console.log('Adjusted return year:', ret);
                }
                // Ensure ret date is after ship date; if not, add a year to ret
                if (ship && ret && ret <= ship) {
                    ret.setFullYear(ret.getFullYear() + 1);
                    console.log('Adjusted return to next year:', ret);
                }

                startDate = ship;
                endDate = ret;
            } else {
                year = parameters.year;
                startDate = this.parseDate(parameters.startDate);
                endDate = this.parseDate(parameters.endDate);
                console.log('Using direct parameters:', { year, startDate, endDate });
            }

            if (!year || !startDate || !endDate) {
                console.warn('Missing required date information');
                console.groupEnd();
                return [];
            }

            console.log('6. Finding overlaps...');
            const overlaps = [];
            for (const row of data) {
                if (!row[idxYear] || row[idxYear] != year) continue;

                // Compute identifier for this row
                const showName = row[idxShowName];
                const client = row[idxClient];
                const yearVal = row[idxYear];
                const computedIdentifier = await this.computeProdSchedIdentifier(showName, client, yearVal);

                let ship = this.parseDate(row[idxShip]) || 
                    (this.parseDate(row[idxSStart]) ? 
                        new Date(this.parseDate(row[idxSStart]).getTime() - 10 * 86400000) : 
                        null);
                let ret = this.parseDate(row[idxReturn]) || 
                    (this.parseDate(row[idxSEnd]) ? 
                        new Date(this.parseDate(row[idxSEnd]).getTime() + 10 * 86400000) : 
                        null);

                if (ship && ship.getFullYear() != year) {
                    ship.setFullYear(Number(year));
                }
                if (ret && ret.getFullYear() != year) {
                    ret.setFullYear(Number(year));
                }
                if (ship && ret && ret <= ship) {
                    ret.setFullYear(ret.getFullYear() + 1);
                }

                if (!ship || !ret) {
                    console.log(`Skipping ${computedIdentifier}: missing dates`);
                    continue;
                }

                if (ret >= startDate && ship <= endDate) {
                    console.log(`Found overlap: ${computedIdentifier}`, {
                        ship,
                        ret,
                        overlapsWithStart: startDate,
                        overlapsWithEnd: endDate
                    });
                    overlaps.push(computedIdentifier);
                }
            }

            console.log('Overlapping shows found:', overlaps);
            console.groupEnd();
            return overlaps;
        } catch (error) {
            console.error('Failed to check overlapping shows:', error);
            console.groupEnd();
            return [];
        }
    }

    // Helper method for date parsing
    static parseDate(val) {
        if (!val) return null;
        const d = new Date(val);
        return isNaN(d) ? null : d;
    }

    static async getInventoryInformation(itemName, retreiveInformation) {
        console.group('Getting inventory information');
        try {
            const itemNames = Array.isArray(itemName) ? itemName : [itemName];
            const infoFields = Array.isArray(retreiveInformation) ? retreiveInformation : [retreiveInformation];
            console.log('Processing request for:', { itemNames, infoFields });

            // Step 1: Get INDEX tab data
            console.log('1. Getting INDEX tab data...');
            const indexData = await this.getSheetData(SPREADSHEET_IDS.INVENTORY, 'INDEX!A:B');
            console.log('INDEX data retrieved:', indexData);

            // Process prefix mapping (skip header row)
            const prefixToTab = {};
            indexData.slice(1).forEach(row => {
                if (row[0] && row[1]) {
                    prefixToTab[row[0]] = row[1];
                    console.log(`Mapped prefix ${row[0]} to tab ${row[1]}`);
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
                console.log(`Mapped item ${item} to tab ${tab}`);
            });

            // Process each tab
            const results = [];
            const errors = [];

            for (const [tab, items] of Object.entries(itemsByTab)) {
                console.log(`Processing tab ${tab}`);
                try {
                    // Get or fetch tab data (modified to use general cache)
                    let tabData = await this.getSheetData(SPREADSHEET_IDS.INVENTORY, `${tab}!A:Z`);

                    // First row contains headers
                    const headers = tabData[0];
                    const infoIdxs = infoFields.map(field => {
                        const idx = headers.findIndex(h => h?.toLowerCase() === field.toLowerCase());
                        if (idx === -1) {
                            throw new Error(`Column '${field}' not found in tab ${tab}`);
                        }
                        return idx;
                    });

                    // Process items with logging
                    items.forEach(item => {
                        const originalItem = item;
                        let searchItem = item;
                        let foundRow = null;

                        // Try searching by item number alone if it contains a hyphen
                        if (item.includes('-')) {
                            const itemNumber = item.split('-')[1];
                            console.log(`Searching for stripped item: ${itemNumber} (original: ${originalItem})`);
                            foundRow = tabData.slice(1).find(r => r[0] === itemNumber);

                            // If not found, try searching for the full item (prefix + number)
                            if (!foundRow) {
                                console.log(`Not found as '${itemNumber}', trying full item: ${originalItem}`);
                                foundRow = tabData.slice(1).find(r => r[0] === originalItem);
                            }
                        } else {
                            // Try searching for the item as-is
                            foundRow = tabData.slice(1).find(r => r[0] === item);
                        }

                        const obj = { itemName: originalItem }; // Use original item name in result
                        if (foundRow) {
                            console.log(`Found row for ${originalItem}:`, foundRow);
                            infoFields.forEach((field, i) => {
                                obj[field] = foundRow[infoIdxs[i]] ?? null;
                                console.log(`${field}: ${obj[field]}`);
                            });
                        } else {
                            console.log(`No row found for ${originalItem}`);
                            infoFields.forEach(field => obj[field] = null);
                        }
                        results.push(obj);
                    });

                } catch (error) {
                    console.error(`Error processing tab ${tab}:`, error);
                    errors.push(`Tab ${tab}: ${error.message}`);
                    items.forEach(item => {
                        const obj = { itemName: item };
                        infoFields.forEach(field => obj[field] = null);
                        results.push(obj);
                    });
                }
            }

            console.log('Final results:', results);
            console.groupEnd();
            return results;

        } catch (error) {
            console.error('Failed to get inventory information:', error);
            console.groupEnd();
            throw new Error(`Failed to get inventory information: ${error.message}`);
        }
    }

    static async getPackListContent(projectIdentifier, itemColumnsStart = "Pack") {
        await GoogleSheetsAuth.checkAuth();
        
        // First verify the tab exists
        const tabs = await this.getSheetTabs(SPREADSHEET_IDS.PACK_LISTS);
        if (!tabs.includes(projectIdentifier)) {
            console.warn(`Pack list tab "${projectIdentifier}" not found, skipping`);
            return null;
        }

        // Use cache for full sheet data
        const response = await GoogleSheetsService.withExponentialBackoff(() =>
            gapi.client.sheets.spreadsheets.get({
                spreadsheetId: SPREADSHEET_IDS.PACK_LISTS,
                ranges: [`${projectIdentifier}`],
                includeGridData: true
            })
        );
        
        const sheetData = response.result.sheets[0].data[0].rowData;

        const headerRow = sheetData[2].values.map(cell => cell.formattedValue);
        const itemStartIndex = headerRow.findIndex(header => header == itemColumnsStart);
        
        if (itemStartIndex === -1) {
            throw new Error(`Header "${itemColumnsStart}" not found in the header row.`);
        }
        
        const result = {
            headers: {
                main: headerRow.slice(0, itemStartIndex),
                items: headerRow.slice(itemStartIndex)
            },
            crates: []
        };

        let currentCrate = null;

        // Process rows starting from row 4 (index 3)
        for (let i = 3; i < sheetData.length; i++) {
            const row = sheetData[i];
            const rowValues = row.values.map(cell => cell?.formattedValue || null);
            const crateInfo = rowValues.slice(0, itemStartIndex);
            const crateContents = rowValues.slice(itemStartIndex);

            if (crateInfo.some(cell => cell)) {
                if (currentCrate) {
                    result.crates.push(currentCrate);
                }
                currentCrate = {
                    info: crateInfo,
                    items: []
                };
            }

            if (crateContents.some(cell => cell)) {
                currentCrate.items.push(crateContents);
            }
        }

        if (currentCrate) {
            result.crates.push(currentCrate);
        }

        return result;
    }
    
    static async getTableHeaders(spreadsheetId, tabName, headerRow = 1) {
        await GoogleSheetsAuth.checkAuth();
        try {
            const response = await GoogleSheetsService.withExponentialBackoff(() =>
                gapi.client.sheets.spreadsheets.get({
                    spreadsheetId,
                    ranges: [`'${tabName}'!${headerRow}:${headerRow}`],
                    includeGridData: true
                })
            );
            
            return response.result.sheets[0].data[0].rowData[0].values
                .map(cell => cell.formattedValue)
                .filter(value => value);
        } catch (error) {
            console.error(`Failed to get headers for tab "${tabName}":`, error);
            throw new Error(`Unable to access tab "${tabName}". The tab may not exist or you may not have permission.`);
        }
    }

    static async searchTable(spreadsheetId, tabName, headerName, searchValue) {
        await GoogleSheetsAuth.checkAuth();
        const headers = await this.getTableHeaders(spreadsheetId, tabName);
        const headerIndex = headers.findIndex(h => 
            h?.toString().toLowerCase() === headerName.toString().toLowerCase()
        );

        if (headerIndex === -1) {
            throw new Error(`Header "${headerName}" not found`);
        }

        const lastCol = String.fromCharCode(65 + headers.length - 1);
        const range = `${tabName}!A1:${lastCol}`;
        
        const searchResponse = await GoogleSheetsService.withExponentialBackoff(() =>
            gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId,
                range,
                majorDimension: 'ROWS'
            })
        );

        const allData = searchResponse.result.values || [];
        const filteredData = allData.slice(1).filter(row => 
            row[headerIndex]?.toString().toLowerCase().includes(searchValue.toLowerCase())
        );

        return {
            headers,
            data: filteredData
        };
    }

    static async setSheetData(spreadsheetId, tabName, updates) {
        await GoogleSheetsAuth.checkAuth();

        // If updates is an array (cell updates), use batchUpdate
        if (Array.isArray(updates)) {
            const data = updates.map(({row, col, value}) => ({
                range: `${tabName}!${String.fromCharCode(65 + col)}${row + 1}`,
                values: [[value]]
            }));
            const request = {
                spreadsheetId,
                resource: {
                    data: data,
                    valueInputOption: 'USER_ENTERED'
                }
            };
            try {
                await GoogleSheetsService.withExponentialBackoff(() =>
                    gapi.client.sheets.spreadsheets.values.batchUpdate(request)
                );
                return true;
            } catch (error) {
                console.error('Error updating sheet:', error);
                throw error;
            }
        }

        // If updates is an object with type: 'full-table', use update with range and values
        if (updates && updates.type === 'full-table' && Array.isArray(updates.values)) {
            // Determine starting row and column
            const startRow = typeof updates.startRow === 'number' ? updates.startRow : 0;
            const startCol = 0;
            const numRows = updates.values.length;
            const numCols = updates.values[0]?.length || 1;
            const endColLetter = String.fromCharCode(65 + startCol + numCols - 1);
            const range = `${tabName}!A${startRow + 1}:${endColLetter}${startRow + numRows}`;

            // If the data would extend beyond the current sheet, add rows first
            if (typeof gapi !== 'undefined' && gapi.client?.sheets?.spreadsheets?.get) {
                const sheetInfo = await GoogleSheetsService.withExponentialBackoff(() =>
                    gapi.client.sheets.spreadsheets.get({
                        spreadsheetId,
                        ranges: [tabName],
                        includeGridData: false
                    })
                );
                const sheet = sheetInfo.result.sheets.find(s => s.properties.title === tabName);
                if (sheet) {
                    const sheetRowCount = sheet.properties.gridProperties.rowCount;
                    const requiredRows = startRow + numRows;
                    if (requiredRows > sheetRowCount) {
                        await GoogleSheetsService.withExponentialBackoff(() =>
                            gapi.client.sheets.spreadsheets.batchUpdate({
                                spreadsheetId,
                                resource: {
                                    requests: [
                                        {
                                            appendDimension: {
                                                sheetId: sheet.properties.sheetId,
                                                dimension: 'ROWS',
                                                length: requiredRows - sheetRowCount
                                            }
                                        }
                                    ]
                                }
                            })
                        );
                    }
                }
            }

            // ...existing code for update...
            await GoogleSheetsService.withExponentialBackoff(() =>
                gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: updates.values
                    }
                })
            );
            return true;
        }

        throw new Error('Invalid updates format for setSheetData');
    }

    static async getSheetTabs(spreadsheetId) {
        await GoogleSheetsAuth.checkAuth();
        const response = await GoogleSheetsService.withExponentialBackoff(() =>
            gapi.client.sheets.spreadsheets.get({
                spreadsheetId
            })
        );
        return response.result.sheets.map(sheet => sheet.properties.title);
    }

    static async cacheData(spreadsheetId, cacheName, content) {
        try {
            await GoogleSheetsAuth.checkAuth();
            // Don't cache empty content
            if (!content || content.trim() === '') {
                return false;
            }
            // Don't cache empty locations
            if (!cacheName || cacheName.trim() === '') {
                return false;
            }

            const contentDiv = document.getElementById('content');
            if (!contentDiv) return false;

            const userEmail = await GoogleSheetsAuth.getUserEmail();
            if (!userEmail) throw new Error('User not authenticated');

            const timestamp = new Date().toISOString();

            // Format tab name (sanitize email for sheet name)
            const tabName = `Cache - ${userEmail.replace(/[^a-z0-9]/gi, '_')}`;

            try {
                // Try to get existing tab
                // Force bypass of local cache for this call
                await this.getSheetData(spreadsheetId, `${tabName}!A1:A`, false);
            } catch (error) {
                if (error.status === 401) {
                    console.warn('Unauthorized. Attempting re-authentication...');
                    await GoogleSheetsAuth.authenticate(false);
                    // Retry after re-auth
                    return this.cacheData(spreadsheetId, cacheName, content);
                }
                // Tab doesn't exist, create it with headers
                await gapi.client.sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    resource: {
                        requests: [{
                            addSheet: {
                                properties: { title: tabName }
                            }
                        }]
                    }
                });

                // Add headers
                await this.setSheetData(spreadsheetId, tabName, [
                    { row: 0, col: 0, value: "Cache Name" },
                    { row: 0, col: 1, value: "Last Modified" },
                    { row: 0, col: 2, value: "Content" }
                ]);
            }

            // Get existing pages (skip header row) - bypass local cache
            const existingData = await this.getSheetData(spreadsheetId, `${tabName}!A2:C`, false) || [];

            // Find page index or append to end
            const rowIndex = existingData.findIndex(row => row[0] === cacheName);
            const targetRow = rowIndex >= 0 ? rowIndex + 1 : existingData.length + 1;

            // Update cache data
            const updates = [
                { row: targetRow, col: 0, value: cacheName },
                { row: targetRow, col: 1, value: timestamp },
                { row: targetRow, col: 2, value: content }
            ];

            await this.setSheetData(spreadsheetId, tabName, updates);
            return true;
        } catch (error) {
            console.error('Error caching data:', error);
            throw error;
        }
    }
    
    static async getCachedData(spreadsheetId, cacheName, maxAgeMs = Infinity) {
        try {
            await GoogleSheetsAuth.checkAuth();
            const userEmail = await GoogleSheetsAuth.getUserEmail();
            if (!userEmail) return null;
            
            // Format tab name (sanitize email for sheet name)
            const tabName = `Cache - ${userEmail.replace(/[^a-z0-9]/gi, '_')}`;
            
            try {
                // Try to get existing tab
                await gapi.client.sheets.spreadsheets.get({
                    spreadsheetId,
                    ranges: [`${tabName}!A1:A`]
                });
            } catch (error) {
                if (error.status === 401) {
                    console.warn('Unauthorized. Attempting re-authentication...');
                    await GoogleSheetsAuth.authenticate(false);
                    // Retry after re-auth
                    return this.getCachedData(spreadsheetId, cacheName, maxAgeMs);
                }
                // Tab doesn't exist
                return null;
            }
            
            // Get existing pages
            const existingData = await this.getSheetData(spreadsheetId, `${tabName}!A2:C`) || [];
            
            // Find page using hash without # symbol
            const pageRow = existingData.find(row => row[0] === cacheName);
            
            if (pageRow) {
                const timestamp = new Date(pageRow[1]).getTime();
                const now = Date.now();
                if (now - timestamp <= maxAgeMs) {
                    const contentDiv = document.getElementById('content');
                    if (!contentDiv) return null;
                    return pageRow[2]; // Return cached content for content div
                }
            }
            return null;
        } catch (error) {
            console.error('Failed to get cached data:', error);
            throw error;
        }
    }

    /**
     * Compute the "Identifier" value for a production schedule row.
     * @param {string} a2 - The value from column A (Show Name)
     * @param {string} b2 - The value from column B (Client Name)
     * @param {string} c2 - The value from column C (Year)
     * @returns {Promise<string>} The computed identifier string.
     */
    static async computeProdSchedIdentifier(a2, b2, c2) {
        console.log('computeProdSchedIdentifier inputs:', { a2, b2, c2 });
        // If A2 is blank, return blank
        if (!a2 || !a2.trim()) {
            console.log('computeProdSchedIdentifier output:', '');
            return '';
        }

        // Check cache validity
        const now = Date.now();
        if (
            !this.prodSchedIdentifierCache.clients ||
            !this.prodSchedIdentifierCache.shows ||
            now - this.prodSchedIdentifierCache.timestamp > this.prodSchedIdentifierCache.TTL
        ) {
            // Fetch and cache Clients and Shows data
            await GoogleSheetsAuth.checkAuth();
            // Clients: [A, B] columns
            const clientsData = await this.getSheetData(SPREADSHEET_IDS.PROD_SCHED, "Clients!A2:B");
            // Shows: [A, B] columns
            const showsData = await this.getSheetData(SPREADSHEET_IDS.PROD_SCHED, "Shows!A2:B");
            this.prodSchedIdentifierCache.clients = {
                names: clientsData.map(row => row[0] || ''),
                abbrs: clientsData.map(row => row[1] || '')
            };
            this.prodSchedIdentifierCache.shows = {
                names: showsData.map(row => row[0] || ''),
                abbrs: showsData.map(row => row[1] || '')
            };
            this.prodSchedIdentifierCache.timestamp = now;
        }

        // Fuzzy match client
        let clientMatch = '';
        try {
            clientMatch = GetTopFuzzyMatch(
                b2,
                this.prodSchedIdentifierCache.clients.names,
                this.prodSchedIdentifierCache.clients.abbrs
            );
        } catch (e) {
            clientMatch = b2 || '';
        }

        // Fuzzy match show
        let showMatch = '';
        try {
            showMatch = GetTopFuzzyMatch(
                a2,
                this.prodSchedIdentifierCache.shows.names,
                this.prodSchedIdentifierCache.shows.abbrs,
                2.5
            );
        } catch (e) {
            showMatch = a2 || '';
        }

        // Compose identifier
        const identifier = `${clientMatch} ${c2 || ''} ${showMatch}`.trim();
        console.log('computeProdSchedIdentifier output:', identifier);
        return identifier;
    }
}
