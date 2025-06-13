import { GoogleSheetsAuth, SPREADSHEET_IDS } from '../index.js';

export class GoogleSheetsService {
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

            // 2. Extract items
            console.log('2. Extracting items from pack list...');
            const itemRegex = /(?:\(([0-9]+)\))?\s*([A-Z]+-[0-9]+)/;
            const itemMap = {};
            packList.crates.forEach((crate, crateIndex) => {
                console.log(`Processing crate ${crateIndex + 1}:`, crate);
                crate.items.forEach((row, rowIndex) => {
                    row.forEach((cell, cellIndex) => {
                        if (!cell) return;
                        const match = cell.match(itemRegex);
                        if (match && match[2]) {
                            const qty = parseInt(match[1] || "1", 10);
                            const id = match[2];
                            itemMap[id] = (itemMap[id] || 0) + qty;
                            console.log(`Found item: ${id}, quantity: ${qty} (total: ${itemMap[id]})`);
                        }
                    });
                });
            });
            const itemIds = Object.keys(itemMap);
            console.log('Total items found:', itemIds.length, itemMap);

            // 3. Get overlapping shows
            console.log('3. Checking for overlapping shows...');
            let overlappingIds;
            try {
                overlappingIds = await this.getOverlappingShows({ identifier: projectIdentifier });
                console.log('Overlapping shows found:', overlappingIds);
            } catch (err) {
                console.error('Error getting overlapping shows:', err);
                throw new Error('Failed to get overlapping shows');
            }

            // 4. Process overlapping shows
            console.log('4. Processing overlapping shows...');
            const overlapItemTotals = {};
            for (const otherId of overlappingIds) {
                if (otherId === projectIdentifier) continue;
                console.log(`Processing overlapping show: ${otherId}`);
                try {
                    const otherPack = await this.getPackListContent(otherId);
                    console.log(`Pack list retrieved for ${otherId}:`, otherPack);
                    otherPack.crates.forEach(crate => {
                        crate.items.forEach(row => {
                            row.forEach(cell => {
                                if (!cell) return;
                                const match = cell.match(itemRegex);
                                if (match && match[2]) {
                                    const qty = parseInt(match[1] || "1", 10);
                                    const id = match[2];
                                    if (itemIds.includes(id)) {
                                        overlapItemTotals[id] = (overlapItemTotals[id] || 0) + qty;
                                        console.log(`Found overlapping item: ${id}, quantity: ${qty} (total: ${overlapItemTotals[id]})`);
                                    }
                                }
                            });
                        });
                    });
                } catch (e) {
                    console.warn(`Failed to process overlapping show ${otherId}:`, e);
                }
            }
            console.log('Overlapping totals:', overlapItemTotals);

            // 5. Get inventory quantities
            console.log('5. Getting inventory quantities...');
            let inventoryInfo;
            try {
                inventoryInfo = await this.getInventoryInformation(itemIds, "QTY");
                console.log('Inventory information retrieved:', inventoryInfo);
            } catch (err) {
                console.error('Error getting inventory:', err);
                throw new Error('Failed to get inventory information');
            }

            // 6. Calculate final quantities
            console.log('6. Calculating final quantities...');
            const result = {};
            itemIds.forEach(id => {
                const inventoryQty = parseInt(inventoryInfo.find(i => i.itemName === id)?.QTY || "0", 10);
                const overlapQty = overlapItemTotals[id] || 0;
                const projectQty = itemMap[id] || 0;
                result[id] = {
                    inventory: inventoryQty,
                    requested: projectQty,
                    overlapping: overlapQty,
                    available: inventoryQty - overlapQty
                };
                console.log(`Item ${id} summary:`, result[id]);
            });

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
        try {
            await GoogleSheetsAuth.checkAuth();
            const tabName = "ProductionSchedule";
            const tabs = await this.getSheetTabs(SPREADSHEET_IDS.PROD_SCHED);
            if (!tabs.includes(tabName)) {
                return [];
            }
            const headers = await this.getTableHeaders(SPREADSHEET_IDS.PROD_SCHED, tabName);
            const lastCol = String.fromCharCode(65 + headers.length - 1);
            const range = `'${tabName}'!A2:${lastCol}`;
            const data = await this.getSheetData(SPREADSHEET_IDS.PROD_SCHED, range);

            const idx = (name) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
            const idxIdentifier = idx("Identifier");
            const idxYear = idx("Year");
            const idxShip = idx("Ship");
            const idxReturn = idx("Expected Return Date");
            const idxSStart = idx("S. Start");
            const idxSEnd = idx("S. End");

            let year, startDate, endDate;

            if (typeof parameters === "string" || parameters.identifier) {
                const identifier = parameters.identifier || parameters;
                const row = data.find(r => r[idxIdentifier] === identifier);
                if (!row) {
                    return [];
                }
                year = row[idxYear];
                let ship = this.parseDate(row[idxShip]);
                let ret = this.parseDate(row[idxReturn]);
                if (!ship) {
                    let sStart = this.parseDate(row[idxSStart]);
                    ship = sStart ? new Date(sStart.getTime() - 10 * 86400000) : null;
                }
                if (!ret) {
                    let sEnd = this.parseDate(row[idxSEnd]);
                    ret = sEnd ? new Date(sEnd.getTime() + 10 * 86400000) : null;
                }
                if (ship && ship.getFullYear() != year) {
                    ship.setFullYear(Number(year));
                }
                if (ret && ret.getFullYear() != year) {
                    ret.setFullYear(Number(year));
                }
                if (ship && ret && ret <= ship) {
                    ret.setFullYear(ret.getFullYear() + 1);
                }
                startDate = ship;
                endDate = ret;
            } else {
                year = parameters.year;
                startDate = this.parseDate(parameters.startDate);
                endDate = this.parseDate(parameters.endDate);
            }

            if (!year || !startDate || !endDate) {
                return [];
            }

            const overlaps = [];
            for (const row of data) {
                if (!row[idxIdentifier] || row[idxYear] != year) continue;
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
                    continue;
                }
                if (ret >= startDate && ship <= endDate) {
                    overlaps.push(row[idxIdentifier]);
                }
            }
            return overlaps;
        } catch (error) {
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
        try {
            // Normalize input to arrays
            const itemNames = Array.isArray(itemName) ? itemName : [itemName];
            const infoFields = Array.isArray(retreiveInformation) ? retreiveInformation : [retreiveInformation];

            // Validate inputs
            if (!itemNames.length || !infoFields.length) {
                throw new Error('No items or fields specified for inventory lookup');
            }

            // Step 1: Get INDEX tab data with error handling
            const indexTab = 'INDEX';
            let indexData;
            try {
                indexData = await this.getSheetData(SPREADSHEET_IDS.INVENTORY, `${indexTab}!A2:B`);
                if (!indexData || !indexData.length) {
                    throw new Error('INDEX tab is empty or missing');
                }
            } catch (error) {
                console.error('Failed to read INDEX tab:', error);
                throw new Error('Unable to read inventory index. The INDEX tab may not exist.');
            }

            // Process prefix mapping
            const prefixToTab = {};
            indexData.forEach(row => {
                if (row[0] && row[1]) prefixToTab[row[0]] = row[1];
            });

            if (Object.keys(prefixToTab).length === 0) {
                throw new Error('No valid prefix mappings found in INDEX tab');
            }

            // Step 2: Group itemNames by prefix with validation
            const itemsByTab = {};
            const unmappedItems = [];
            itemNames.forEach(item => {
                if (!item) return;
                let [prefix] = item.split('-');
                let tab = prefixToTab[prefix];
                if (!tab && prefix && prefix.length > 0) {
                    // Try using just the first character as prefix
                    prefix = prefix[0];
                    tab = prefixToTab[prefix];
                }
                if (!tab) {
                    unmappedItems.push(item);
                    return;
                }
                if (!itemsByTab[tab]) itemsByTab[tab] = [];
                itemsByTab[tab].push(item);
            });

            if (unmappedItems.length > 0) {
                console.warn('Some items could not be mapped to inventory tabs:', unmappedItems);
            }

            // Step 3: Process each tab with error handling
            const results = [];
            const errors = [];

            for (const [tab, items] of Object.entries(itemsByTab)) {
                try {
                    const headers = await this.getTableHeaders(SPREADSHEET_IDS.INVENTORY, tab);

                    // currently assuming first column is 'Item'
                    const itemColIdx = 0//headers.findIndex(h => h.toLowerCase() === 'item');
                    //
                    //if (itemColIdx === -1) {
                    //    throw new Error(`No 'Item' column found in tab ${tab}`);
                    //}

                    const infoIdxs = infoFields.map(field => {
                        const idx = headers.findIndex(h => h.toLowerCase() === field.toLowerCase());
                        if (idx === -1) {
                            throw new Error(`Column '${field}' not found in tab ${tab}`);
                        }
                        return idx;
                    });

                    const range = `${tab}!A2:${String.fromCharCode(65 + headers.length - 1)}`;
                    const data = await this.getSheetData(SPREADSHEET_IDS.INVENTORY, range);

                    items.forEach(item => {
                        const row = data?.find(r => r[itemColIdx] === item);
                        const obj = { itemName: item };
                        if (row) {
                            infoFields.forEach((field, i) => {
                                obj[field] = row[infoIdxs[i]] ?? null;
                            });
                        } else {
                            infoFields.forEach(field => obj[field] = null);
                        }
                        results.push(obj);
                    });
                } catch (error) {
                    console.error(`Error processing tab ${tab}:`, error);
                    errors.push(`Tab ${tab}: ${error.message}`);
                    // Add null results for items in this tab
                    items.forEach(item => {
                        const obj = { itemName: item };
                        infoFields.forEach(field => obj[field] = null);
                        results.push(obj);
                    });
                }
            }

            if (errors.length > 0) {
                console.warn('Encountered errors while fetching inventory information:', errors);
            }

            return results;

        } catch (error) {
            console.error('Failed to get inventory information:', error);
            throw new Error(`Failed to get inventory information: ${error.message}`);
        }
    }

    static async getPackListContent(projectIdentifier, itemColumnsStart = "Pack") {
        await GoogleSheetsAuth.checkAuth();
        const response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_IDS.PACK_LISTS,
            ranges: [`${projectIdentifier}`],
            includeGridData: true
        });
        
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
    
    static async getSheetData(spreadsheetId, range) {
        await GoogleSheetsAuth.checkAuth();
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });
        return response.result.values;
    }

    static async getTableHeaders(spreadsheetId, tabName, headerRow = 1) {
        await GoogleSheetsAuth.checkAuth();
        try {
            const response = await gapi.client.sheets.spreadsheets.get({
                spreadsheetId,
                ranges: [`'${tabName}'!${headerRow}:${headerRow}`],
                includeGridData: true
            });
            
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
        
        const searchResponse = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
            majorDimension: 'ROWS'
        });

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
        
        // Convert 0-based indices to A1 notation (add 1 for 1-based sheet indexing)
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
            await gapi.client.sheets.spreadsheets.values.batchUpdate(request);
            return true;
        } catch (error) {
            console.error('Error updating sheet:', error);
            throw error;
        }
    }

    static async getSheetTabs(spreadsheetId) {
        await GoogleSheetsAuth.checkAuth();
        const response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId
        });
        
        return response.result.sheets.map(sheet => sheet.properties.title);
    }

    static async cacheData(spreadsheetId, cacheName, content) {
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

        await GoogleSheetsAuth.checkAuth();
        const userEmail = await GoogleSheetsAuth.getUserEmail();
        if (!userEmail) throw new Error('User not authenticated');
        
        const timestamp = new Date().toISOString();
        
        // Format tab name (sanitize email for sheet name)
        const tabName = `Cache - ${userEmail.replace(/[^a-z0-9]/gi, '_')}`;
        
        try {
            // Try to get existing tab
            await gapi.client.sheets.spreadsheets.get({
                spreadsheetId,
                ranges: [`${tabName}!A1:A`]
            });
        } catch (error) {
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
        
        // Get existing pages (skip header row)
        const existingData = await this.getSheetData(spreadsheetId, `${tabName}!A2:C`) || [];
        
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
    }
    
    static async getCachedData(spreadsheetId, cacheName, maxAgeMs = Infinity) {
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
    }
}
