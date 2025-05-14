export function buildTable(data, headers, hideColumns = [], editColumns = []) {
    const tableData = data.data || data;
    const table = document.createElement('table');
    const tbody = document.createElement('tbody');

    // Filter out empty headers and hidden columns
    const visibleIndexes = headers
        .map((header, index) => hideColumns.includes(header) ? null : index)
        .filter(index => index !== null);
    const editIndexes = headers
        .map((header, index) => editColumns.includes(header) ? index : null)
        .filter(index => index !== null);
    
    // Are there any visible indexes?
    if (visibleIndexes.length === 0) {  // Fixed comparison operator from = to ===
        return formatError('<div class="error-message">No columns visible</div>');
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
        if (Array.isArray(tableData) && tableData.length > 0) {
            tableData.forEach((row, rowIndex) => {
                if (!Array.isArray(row)) return;
                const tr = document.createElement('tr');
                tr.draggable = true;
                tr.classList.add('draggable');
                
                let isDragging = false;
                let startY = 0;
                let startScroll = 0;
                
                tr.addEventListener('mousedown', (e) => {
                    e.preventDefault();  // Prevent default drag behavior
                    isDragging = true;
                    startY = e.clientY;
                    startScroll = tbody.scrollTop;
                    tr.classList.add('dragging');
                });

                tr.addEventListener('dragstart', (e) => {
                    e.preventDefault();  // Prevent Chrome's drag ghost image
                });
                
                document.addEventListener('mousemove', (e) => {
                    if (!isDragging) return;
                    const deltaY = e.clientY - startY;
                    tr.style.transform = `translateY(${deltaY}px)`;
                });
                
                document.addEventListener('mouseup', () => {
                    if (!isDragging) return;
                    isDragging = false;
                    tr.classList.remove('dragging');
                    tr.style.transform = '';
                });

                // Only create cells for visible columns
                row.forEach((cell, colIndex) => {
                    if (visibleIndexes.includes(colIndex)) {
                        const td = document.createElement('td');
                        if (cell instanceof HTMLElement) {
                            td.appendChild(cell);
                        } else {
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
                        }
                        tr.appendChild(td);
                    }
                });
                tbody.appendChild(tr);
            });
        } else {
            return formatError('<div class="error-message">No data available</div>');
        }
    }
    table.appendChild(tbody);

    return table;
}