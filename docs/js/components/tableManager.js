export class TableManager {
    static dragState = {
        isDragging: false,
        startX: 0,
        startY: 0,
        dragClone: null,
        sourceRow: null,
        hoverTimer: null,
        lastHoveredElement: null
    };

    static formatError(message) {
        const div = document.createElement('div');
        div.innerHTML = message;
        return div;
    }

    static buildTable(data, headers, hideColumns = [], editColumns = [], dragId = null) {
        const tableData = data.data || data;
        const table = document.createElement('table');
        if (dragId) {
            table.classList.add(`drag-id-${dragId}`);
        }
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
            return this.formatError('<div class="error-message">No columns visible</div>');
        } else {

            // Create header row
            if (headers.length > 0) { 
                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');
                
                // Only add drag handle header if dragId provided
                if (dragId) {
                    const dragHandleTh = document.createElement('th');
                    dragHandleTh.style.padding = '0';
                    dragHandleTh.style.minWidth = '0';
                    dragHandleTh.style.border = 'none';
                    dragHandleTh.style.backgroundColor = 'transparent';
                    headerRow.appendChild(dragHandleTh);
                }

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
                    
                    // Only add drag functionality if dragId provided
                    if (dragId) {
                        tr.classList.add('draggable');
                        const dragHandle = document.createElement('td');
                        dragHandle.className = 'row-drag-handle';
                        tr.appendChild(dragHandle);
                    }

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
                return this.formatError('<div class="error-message">No data available</div>');
            }
        }
        table.appendChild(tbody);

        return table;
    }

    static initDragAndDrop() {
        document.addEventListener('mousedown', (e) => {
            const dragHandle = e.target.closest('.row-drag-handle');
            if (!dragHandle) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const tr = dragHandle.closest('tr');
            if (!tr || !tr.classList.contains('draggable')) return;

            this.dragState.isDragging = true;
            this.dragState.startX = e.clientX;
            this.dragState.startY = e.clientY;
            this.dragState.sourceRow = tr;
            
            // Create floating clone
            this.dragState.dragClone = tr.cloneNode(true);
            this.dragState.dragClone.classList.add('row-clone');
            this.dragState.dragClone.style.position = 'fixed';
            this.dragState.dragClone.style.width = `${tr.offsetWidth}px`;
            this.dragState.dragClone.style.maxHeight = '100px';
            this.dragState.dragClone.style.top = `${e.clientY - 50}px`;
            this.dragState.dragClone.style.left = `${tr.getBoundingClientRect().left}px`;
            
            document.body.appendChild(this.dragState.dragClone);
            tr.classList.add('dragging');
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.dragState.isDragging) return;
            
            const deltaX = e.clientX - this.dragState.startX;
            const deltaY = e.clientY - this.dragState.startY;
            if (this.dragState.dragClone) {
                this.dragState.dragClone.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            }

            const dropTarget = this.findDropTarget(e);
            if (dropTarget && this.dragState.sourceRow) {
                const { row, position } = dropTarget;
                if (position === 'before') {
                    row.parentNode.insertBefore(this.dragState.sourceRow, row);
                } else if (position === 'after') {
                    row.parentNode.insertBefore(this.dragState.sourceRow, row.nextSibling);
                } else if (position === 'into') {
                    row.appendChild(this.dragState.sourceRow);
                }
            }
        });

        document.addEventListener('mouseup', () => {
            if (!this.dragState.isDragging) return;
            
            if (this.dragState.sourceRow) {
                this.dragState.sourceRow.classList.remove('dragging');
            }
            if (this.dragState.dragClone) {
                this.dragState.dragClone.remove();
            }
            
            // Reset state
            this.dragState = {
                isDragging: false,
                startX: 0,
                startY: 0,
                dragClone: null,
                sourceRow: null,
                hoverTimer: null,
                lastHoveredElement: null
            };
        });
    }

    static findDropTarget(e) {
        const elements = document.elementsFromPoint(e.clientX, e.clientY);
        
        for (const el of elements) {
            // Skip our source row and clone
            if (el === this.dragState.sourceRow || el === this.dragState.dragClone) continue;
            
            if (el.tagName === 'TR') {
                const rect = el.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                return {
                    row: el,
                    position: e.clientY >= midpoint ? 'after' : 'before'
                };
            }
            
            if (el.tagName === 'TD' || el.tagName === 'TH') {
                const parentRow = el.closest('tr');
                if (parentRow && parentRow !== this.dragState.sourceRow) {
                    const rect = parentRow.getBoundingClientRect();
                    const midpoint = rect.top + rect.height / 2;
                    return {
                        row: parentRow,
                        position: e.clientY >= midpoint ? 'after' : 'before'
                    };
                }
            }
        }
        return null;
    }
}