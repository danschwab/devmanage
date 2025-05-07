export function buildTable(data, headers, hideColumns = [], editColumns = []) {
    const tableData = data.data || data;
    const table = document.createElement('table');

    // Filter out empty headers and hidden columns
    const visibleIndexes = headers
        .map((header, index) => hideColumns.includes(header) ? null : index)
        .filter(index => index !== null);
    const editIndexes = headers
        .map((header, index) => editColumns.includes(header) ? null : index)
        .filter(index => index !== null);
    
    // Are there any visible indexes?
    if (visibleIndexes.length = 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = visibleIndexes.length || 1;
        td.textContent = 'No columns visible';
        td.style.textAlign = 'center';
        tr.appendChild(td);
        tbody.appendChild(tr);
    } else {

        // Create header row
        if (headers.length > 0) { 
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            headers.forEach((header, colIndex) => {
                if (visibleIndexes.includes(colIndex)) {
                    const th = document.createElement('th');
                    th.textContent = header;
                    headerRow.appendChild(th);
                }
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
                row.forEach((cell, colIndex) => {
                    if (visibleIndexes.includes(colIndex)) {
                        const td = document.createElement('td');
                        if (editIndexes.includes(colIndex)) {
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
            td.colSpan = visibleIndexes.length || 1;
            td.textContent = 'No data available';
            td.style.textAlign = 'center';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }
    }
    table.appendChild(tbody);

    return table;
}