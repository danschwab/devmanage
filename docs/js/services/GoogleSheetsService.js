import { GoogleSheetsAuth, buildTable } from '../index.js';

export class GoogleSheetsService {
    
    static async getOverlappingShows(spreadsheetId, tabName, parameters) {
        // Parameters can either be a project identifier string or a start and end date range

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


    static async getPackListContent(spreadsheetId, tabName, itemColumnsStart = "Pack") {
        await GoogleSheetsAuth.checkAuth();
        const response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId,
            ranges: [`${tabName}`],
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

    static async getPackListTable(spreadsheetId, tabName, itemColumnsStart = "Pack") {
        const content = await this.getPackListContent(spreadsheetId, tabName, itemColumnsStart);
        
        const mainTableData = content.crates.map(crate => {
            const itemData = document.createElement('div');
            itemData.classList.add('table-wrapper');
            if (crate.items.length > 0) {
                const itemTable = buildTable(
                    crate.items,
                    content.headers.items,
                    ['Pack', 'Check'],
                    [],
                    'pack-list-items'
                );
                itemData.appendChild(itemTable);
            }
            return [...crate.info, itemData];
        });

        const headers = [...content.headers.main, 'Items'];
        return buildTable(mainTableData, headers, [], [], 'pack-list');
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
}
