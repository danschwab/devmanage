export function buildTable(data, headers) {
    const tableData = data.data || data;
    const table = document.createElement('table');

    // Filter out empty headers
    const validHeaders = headers.filter(header => header);
    
    // Create header row
    if (validHeaders.length > 0) {
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        validHeaders.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);
    }

    // Create data rows
    const tbody = document.createElement('tbody');
    if (Array.isArray(tableData) && tableData.length > 0) {
        tableData.forEach(row => {
            if (!Array.isArray(row)) return;
            const tr = document.createElement('tr');
            // Always create exactly the same number of cells as headers
            for (let i = 0; i < validHeaders.length; i++) {
                const td = document.createElement('td');
                td.textContent = row[i] || '';
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        });
    } else {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = validHeaders.length || 1;
        td.textContent = 'No data available';
        td.style.textAlign = 'center';
        tr.appendChild(td);
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    return table;
}