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
            // Add header for drag handle column
            const dragHandleTh = document.createElement('th');
            dragHandleTh.style.padding = '0';
            dragHandleTh.style.minWidth = '0';
            dragHandleTh.style.border = 'none';
            dragHandleTh.style.backgroundColor = 'transparent';
            headerRow.insertBefore(dragHandleTh, headerRow.firstChild);
            
            thead.appendChild(headerRow);
            table.appendChild(thead);
        }

        // Create data rows
        if (Array.isArray(tableData) && tableData.length > 0) {
            tableData.forEach((row, rowIndex) => {
                if (!Array.isArray(row)) return;
                const tr = document.createElement('tr');
                tr.classList.add('draggable');
                
                // Add drag handle
                const dragHandle = document.createElement('td');
                dragHandle.className = 'row-drag-handle';
                tr.appendChild(dragHandle);
                
                let isDragging = false;
                let startX = 0;
                let startY = 0;
                let dragClone = null;
                
                dragHandle.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    isDragging = true;
                    startX = e.clientX;
                    startY = e.clientY;
                    
                    // Create floating clone
                    dragClone = tr.cloneNode(true);
                    dragClone.classList.add('row-clone');
                    dragClone.style.position = 'fixed';
                    dragClone.style.width = `${tr.offsetWidth}px`;
                    dragClone.style.left = `${tr.getBoundingClientRect().left}px`;
                    dragClone.style.top = `${e.clientY - tr.offsetHeight/2}px`;
                    document.body.appendChild(dragClone);
                    
                    tr.classList.add('dragging');
                });
                
                document.addEventListener('mousemove', (e) => {
                    if (!isDragging || !dragClone) return;
                    const deltaX = e.clientX - startX;
                    const deltaY = e.clientY - startY;
                    dragClone.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                });
                
                document.addEventListener('mouseup', () => {
                    if (!isDragging) return;
                    isDragging = false;
                    tr.classList.remove('dragging');
                    if (dragClone) {
                        dragClone.remove();
                        dragClone = null;
                    }
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