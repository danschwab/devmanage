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
        const dataRows = sheetData.slice(3).map(row => {
            return row.values.slice(0, itemStartIndex).map(cell => cell.formattedValue);
        });
        // Filter out empty rows
        const filteredDataRows = dataRows.filter(row => row.some(cell => cell));
        // Add a single column to the end called "Items" for the item data. Add a special flag to the data rows to indicate that this is the item data.
        filteredHeaderRow.push("Items");
        filteredDataRows.forEach(row => {
            // Item data div added into the last column of the row.
            const itemData = document.createElement('div');
            itemData.classList.add('pack-list-item-data');
            row.push(itemData);
        });
        // Use buildTable to generate the dom content to return.
        const table = buildTable(filteredDataRows, filteredHeaderRow);
        
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
