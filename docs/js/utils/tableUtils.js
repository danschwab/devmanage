export function buildTable(data, headers, hideColumns = [], editColumns = []) {
    const tableData = data.data || data;
    const table = document.createElement('table');

    // Filter out empty headers and hidden columns
    const validHeaders = headers.filter((header, index) => header && !hideColumns.includes(index));
    const visibleIndexes = headers.map((_, index) => !hideColumns.includes(index));
    
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
            // Only create cells for visible columns
            row.forEach((cell, index) => {
                if (!hideColumns.includes(index)) {
                    const td = document.createElement('td');
                    if (editColumns.includes(colIndex)) {
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.value = cell || '';
                        input.dataset.originalValue = cell || '';
                        input.dataset.rowIndex = rowIndex;
                        input.dataset.colIndex = colIndex;
                        input.dataset.dirty = 'false';
                        
                        input.addEventListener('input', (e) => {
                            const target = e.target;
                            target.dataset.dirty = (target.value !== target.dataset.originalValue).toString();
                        });
                        
                        td.appendChild(input);
                    } else {
                        td.textContent = cell || '';
                    }
                    tr.appendChild(td);
                }
            });
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