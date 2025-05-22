import { GoogleSheetsAuth } from '../index.js';

export class GoogleSheetsService {
    
    static async checkItemQuantities(spreadsheetId, projectIdentifier) {
        // 1. Get the items in the project pack list
        const packList = await this.getPackListContent(spreadsheetId, projectIdentifier);
        const itemHeaders = packList.headers.items;
        const itemRows = packList.crates.flatMap(crate => crate.items);

        // 2. Extract item IDs and quantities from description columns using regex
        // Regex: (?:\(([0-9]+)\))? ?([A-Z]+-[0-9]+)?
        const itemRegex = /(?:\(([0-9]+)\))?\s*([A-Z]+-[0-9]+)/;
        const itemMap = {}; // { itemId: totalQty }
        for (const row of itemRows) {
            for (const cell of row) {
                if (!cell) continue;
                const match = cell.match(itemRegex);
                if (match && match[2]) {
                    const qty = parseInt(match[1] || "1", 10);
                    const id = match[2];
                    itemMap[id] = (itemMap[id] || 0) + qty;
                }
            }
        }
        const itemIds = Object.keys(itemMap);

        // 3. Get all other projects that overlap with the given project
        const overlappingIds = await this.getOverlappingShows(spreadsheetId, { identifier: projectIdentifier });
        const otherProjects = overlappingIds.filter(id => id !== projectIdentifier);

        // 4. For each overlapping project, get their pack list and sum up item quantities
        const overlapItemTotals = {};
        for (const otherId of otherProjects) {
            try {
                const otherPack = await this.getPackListContent(spreadsheetId, otherId);
                const otherRows = otherPack.crates.flatMap(crate => crate.items);
                for (const row of otherRows) {
                    for (const cell of row) {
                        if (!cell) continue;
                        const match = cell.match(itemRegex);
                        if (match && match[2]) {
                            const qty = parseInt(match[1] || "1", 10);
                            const id = match[2];
                            if (itemIds.includes(id)) {
                                overlapItemTotals[id] = (overlapItemTotals[id] || 0) + qty;
                            }
                        }
                    }
                }
            } catch (e) {
                // Ignore missing/invalid pack lists
            }
        }

        // 5. Get inventory quantities for all items
        const inventoryInfo = await this.getInventoryInformation(spreadsheetId, itemIds, "Quantity");
        const inventoryMap = {};
        inventoryInfo.forEach(obj => {
            inventoryMap[obj.itemName] = parseInt(obj.Quantity || "0", 10);
        });

        // 6. Subtract total quantities in all overlapping shows from inventory quantities
        const result = {};
        for (const id of itemIds) {
            const inventoryQty = inventoryMap[id] || 0;
            const overlapQty = overlapItemTotals[id] || 0;
            const projectQty = itemMap[id] || 0;
            result[id] = {
                inventory: inventoryQty,
                requested: projectQty,
                overlapping: overlapQty,
                available: inventoryQty - overlapQty
            };
        }
        return result;
    }

    static async getOverlappingShows(spreadsheetId, parameters) {
        // parameters: { year, startDate, endDate } OR { identifier }
        await GoogleSheetsAuth.checkAuth();
        const tabName = "ProductionSchedule";
        const headers = await this.getTableHeaders(spreadsheetId, tabName);

        // Get all data
        const lastCol = String.fromCharCode(65 + headers.length - 1);
        const range = `${tabName}!A2:${lastCol}`;
        const data = await this.getSheetData(spreadsheetId, range);

        // Helper to parse date or return null
        const parseDate = (val) => {
            if (!val) return null;
            const d = new Date(val);
            return isNaN(d) ? null : d;
        };

        // Find header indices
        const idx = (name) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
        const idxIdentifier = idx("Identifier");
        const idxYear = idx("Year");
        const idxShip = idx("Ship");
        const idxReturn = idx("Expected Return Date");
        const idxSStart = idx("S. Start");
        const idxSEnd = idx("S. End");

        let year, startDate, endDate;

        if (typeof parameters === "string" || parameters.identifier) {
            // Find the row for the identifier
            const identifier = parameters.identifier || parameters;
            const row = data.find(r => r[idxIdentifier] === identifier);
            if (!row) return [];
            year = row[idxYear];
            // Try Ship/Return, fallback to S. Start/S. End +/- 10 days
            let ship = parseDate(row[idxShip]);
            let ret = parseDate(row[idxReturn]);
            if (!ship) {
                let sStart = parseDate(row[idxSStart]);
                ship = sStart ? new Date(sStart.getTime() - 10 * 86400000) : null;
            }
            if (!ret) {
                let sEnd = parseDate(row[idxSEnd]);
                ret = sEnd ? new Date(sEnd.getTime() + 10 * 86400000) : null;
            }
            startDate = ship;
            endDate = ret;
        } else {
            year = parameters.year;
            startDate = parseDate(parameters.startDate);
            endDate = parseDate(parameters.endDate);
        }

        if (!year || !startDate || !endDate) return [];

        // Find overlapping shows
        const overlaps = [];
        for (const row of data) {
            if (!row[idxIdentifier] || row[idxYear] != year) continue;

            // Get this row's date range
            let ship = parseDate(row[idxShip]);
            let ret = parseDate(row[idxReturn]);
            if (!ship) {
                let sStart = parseDate(row[idxSStart]);
                ship = sStart ? new Date(sStart.getTime() - 10 * 86400000) : null;
            }
            if (!ret) {
                let sEnd = parseDate(row[idxSEnd]);
                ret = sEnd ? new Date(sEnd.getTime() + 10 * 86400000) : null;
            }
            if (!ship || !ret) continue;

            // Check overlap
            if (ret >= startDate && ship <= endDate) {
                overlaps.push(row[idxIdentifier]);
            }
        }
        return overlaps;
    }

    static async getInventoryInformation(spreadsheetId, itemName, retreiveInformation) {
        // Normalize input to arrays
        const itemNames = Array.isArray(itemName) ? itemName : [itemName];
        const infoFields = Array.isArray(retreiveInformation) ? retreiveInformation : [retreiveInformation];

        // Step 1: Get INDEX tab data (prefix -> tab name)
        const indexTab = 'INDEX';
        const indexData = await this.getSheetData(spreadsheetId, `${indexTab}!A2:B`);
        const prefixToTab = {};
        indexData.forEach(row => {
            if (row[0] && row[1]) prefixToTab[row[0]] = row[1];
        });

        // Step 2: Group itemNames by prefix
        const itemsByTab = {};
        itemNames.forEach(item => {
            let [prefix] = item.split('-');
            let tab = prefixToTab[prefix];
            if (!tab && prefix && prefix.length > 0) {
            // Try using just the first character as prefix
            prefix = prefix[0];
            tab = prefixToTab[prefix];
            }
            if (!tab) return; // skip if prefix not found
            if (!itemsByTab[tab]) itemsByTab[tab] = [];
            itemsByTab[tab].push(item);
        });

        // Step 3: For each tab, get headers and data, then find requested info
        const results = [];
        for (const [tab, items] of Object.entries(itemsByTab)) {
            const headers = await this.getTableHeaders(spreadsheetId, tab);
            const itemColIdx = 0; // 'Item' is always the first column
            const infoIdxs = infoFields.map(field =>
                headers.findIndex(h => h.toLowerCase() === field.toLowerCase())
            );
            // Get all data from tab
            const data = await this.getSheetData(spreadsheetId, `${tab}!A2:${String.fromCharCode(65 + headers.length - 1)}`);
            items.forEach(item => {
                const row = data.find(r => r[itemColIdx] === item);
                if (row) {
                    const obj = { itemName: item };
                    infoFields.forEach((field, i) => {
                        obj[field] = row[infoIdxs[i]] ?? null;
                    });
                    results.push(obj);
                } else {
                    // Item not found, return nulls
                    const obj = { itemName: item };
                    infoFields.forEach(field => obj[field] = null);
                    results.push(obj);
                }
            });
        }
        return results;
    }

    static async getPackListContent(spreadsheetId, projectIdentifier, itemColumnsStart = "Pack") {
        await GoogleSheetsAuth.checkAuth();
        const response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId,
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
        const response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId,
            ranges: [`${tabName}!${headerRow}:${headerRow}`],
            includeGridData: true
        });
        
        return response.result.sheets[0].data[0].rowData[0].values
            .map(cell => cell.formattedValue)
            .filter(value => value);
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
        
        // Convert array indices to A1 notation
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

    static async cachePage(spreadsheetId) {
        // Don't cache empty locations
        const hash = window.location.hash;
        if (!hash || hash === '#') {
            return false;
        }

        const contentDiv = document.getElementById('content');
        if (!contentDiv) return false;

        await GoogleSheetsAuth.checkAuth();
        const userEmail = await GoogleSheetsAuth.getUserEmail();
        if (!userEmail) throw new Error('User not authenticated');
        
        // Get current page info using hash as the page identifier
        const pagePath = hash.substring(1); // Remove the # symbol
        const timestamp = new Date().toISOString();
        const pageContent = contentDiv.innerHTML;
        
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
                { row: 0, col: 0, value: "Page URL" },
                { row: 0, col: 1, value: "Last Modified" },
                { row: 0, col: 2, value: "Page Content" }
            ]);
        }
        
        // Get existing pages
        const existingData = await this.getSheetData(spreadsheetId, `${tabName}!A:C`) || [];
        
        // Find page index or append
        let rowIndex = existingData.findIndex(row => row[0] === pagePath) + 1;
        if (rowIndex === 0) {
            rowIndex = existingData.length + 1;
        }
        
        // Update cache data
        const updates = [
            { row: rowIndex, col: 0, value: pagePath },
            { row: rowIndex, col: 1, value: timestamp },
            { row: rowIndex, col: 2, value: pageContent }
        ];
        
        await this.setSheetData(spreadsheetId, tabName, updates);
        return true;
    }
    
    static async getCachedPage(spreadsheetId, maxAgeMs = Infinity) {
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
        const existingData = await this.getSheetData(spreadsheetId, `${tabName}!A:C`) || [];
        
        // Find page using hash without # symbol
        const pagePath = window.location.hash.substring(1);
        const pageRow = existingData.find(row => row[0] === pagePath);
        
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
