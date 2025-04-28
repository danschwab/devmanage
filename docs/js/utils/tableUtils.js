export function buildTable(data, headers, showColumns = [], editColumns = []) {
    const tableData = data.data || data;
    const table = document.createElement('table');

    // Filter headers based on showColumns (show all if showColumns is empty)
    const validHeaders = headers.filter((header, index) => 
        header && (showColumns.length === 0 || showColumns.includes(index))
    );

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
        const numColumns = validHeaders.length || Math.max(...tableData.map(row => row.length));
        tableData.forEach((row, rowIndex) => {
            if (!Array.isArray(row)) return;
            const tr = document.createElement('tr');
            
            // Iterate through all possible columns
            for (let colIndex = 0; colIndex < numColumns; colIndex++) {
                if (showColumns.length === 0 || showColumns.includes(colIndex)) {
                    const td = document.createElement('td');
                    const cell = row[colIndex];
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