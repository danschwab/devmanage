import { GoogleSheetsAuth, buildTable } from '../index.js';

export class GoogleSheetsService {
    
    static async getPackListContent(spreadsheetId, tabName, itemColumnsStart = "Pack") {
        await GoogleSheetsAuth.checkAuth();
        const response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId,
            ranges: [`${tabName}`],
            includeGridData: true
        });
        const sheetData = response.result.sheets[0].data[0].rowData;
        // Extract the header row: row 3.
        const headerRow = sheetData[2].values.map(cell => cell.formattedValue);
        // Find the index of the itemColumnsStart header.
        const itemStartIndex = headerRow.findIndex(header => header == itemColumnsStart);
        if (itemStartIndex === -1) {
            throw new Error(`Header "${itemColumnsStart}" not found in the header row.`);
        }
        // Extract only the columns to the left of itemColumnsStart.
        const filteredHeaderRow = headerRow.slice(0, itemStartIndex);
        filteredHeaderRow.push("Items");

        const mainTableData = [];
        let currentCrateRow = null;
        let currentCrateContents = [];

        // Iterate through rows starting from row 4 (index 3).
        for (let i = 3; i < sheetData.length; i++) {
            const row = sheetData[i];
            const rowValues = row.values.map(cell => cell?.formattedValue || null);
            const crateInfo = rowValues.slice(0, itemStartIndex);
            const crateContents = rowValues.slice(itemStartIndex);

            if (crateInfo.some(cell => cell)) {
                // If we encounter a new crate row, finalize the previous crate row.
                if (currentCrateRow) {
                    const itemData = document.createElement('div');
                    itemData.classList.add('pack-list-item-data');
                    if (currentCrateContents.length > 0) {
                        const itemTable = buildTable(
                            currentCrateContents,
                            [headerRow.slice(itemStartIndex)]
                        );
                        itemData.appendChild(itemTable);
                    }
                    currentCrateRow.push(itemData);
                    mainTableData.push(currentCrateRow);
                }
                // Start a new crate row.
                currentCrateRow = [...crateInfo];
                currentCrateContents = [];
            }

            // Add crate contents if any.
            if (crateContents.some(cell => cell)) {
                currentCrateContents.push(crateContents);
            }
        }

        // Finalize the last crate row if it exists.
        if (currentCrateRow) {
            const itemData = document.createElement('div');
            itemData.classList.add('pack-list-item-data');
            if (currentCrateContents.length > 0) {
                const itemTable = buildTable(
                    currentCrateContents,
                    [headerRow.slice(itemStartIndex)]
                );
                itemData.appendChild(itemTable);
            }
            currentCrateRow.push(itemData);
            mainTableData.push(currentCrateRow);
        }

        // Use buildTable to generate the DOM content to return.
        const table = buildTable(mainTableData, filteredHeaderRow);

        return table;
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
