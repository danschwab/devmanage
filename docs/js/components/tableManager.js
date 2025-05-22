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

    static handlers = {
        mousedown: null,
        mousemove: null,
        mouseup: null
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

    static cleanup() {
        // Remove all event listeners
        if (this.handlers.mousedown) {
            document.removeEventListener('mousedown', this.handlers.mousedown);
        }
        if (this.handlers.mousemove) {
            document.removeEventListener('mousemove', this.handlers.mousemove);
        }
        if (this.handlers.mouseup) {
            document.removeEventListener('mouseup', this.handlers.mouseup);
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
    }

    static initDragAndDrop() {
        // Clean up any existing handlers
        this.cleanup();

        // Store handler references for cleanup
        this.handlers.mousedown = (e) => {
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
        };

        this.handlers.mousemove = (e) => {
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
        };

        this.handlers.mouseup = () => {
            if (!this.dragState.isDragging) return;
            
            if this.dragState.sourceRow) {
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
        };

        // Add listeners with stored handlers
        document.addEventListener('mousedown', this.handlers.mousedown);
        document.addEventListener('mousemove', this.handlers.mousemove);
        document.addEventListener('mouseup', this.handlers.mouseup);
    }

    static findDropTarget(e) {
        // Look for any visible table with matching drag-id
        const elements = document.elementsFromPoint(e.clientX, e.clientY);
        
        for (const el of elements) {
            // Get the closest table and only continue if it has the correct tag
            const targetTable = el.closest('table');
            if (!targetTable || !targetTable.classList.contains(`drag-id-${dragId}`)) continue;

            // Check for row targets
            if (el.tagName === 'TR' && el !== tr) {
                // If this TR is in the THEAD, drop into TBODY
                if (el.parentElement && el.parentElement.tagName === 'THEAD') {
                    const tableEl = el.closest('table');
                    const tbodyEl = tableEl ? tableEl.querySelector('tbody') : null;
                    if (tbodyEl) {
                        return {
                            row: tbodyEl,
                            position: 'into'
                        };
                    }
                } else {
                    const rect = el.getBoundingClientRect();
                    const midpoint = rect.top + rect.height / 2;
                    return {
                        row: el,
                        position: e.clientY >= midpoint ? 'after' : 'before'
                    };
                }
            }

            // Check cells
            if (el.tagName === 'TD' || el.tagName === 'TH') {
                // If this TH is in the THEAD, drop into TBODY
                if (el.tagName === 'TH' && el.parentElement && el.parentElement.parentElement && el.parentElement.parentElement.tagName === 'THEAD') {
                    const tableEl = el.closest('table');
                    const tbodyEl = tableEl ? tableEl.querySelector('tbody') : null;
                    if (tbodyEl) {
                        return {
                            row: tbodyEl,
                            position: 'into'
                        };
                    }
                }
                const parentRow = el.closest('tr');
                if (parentRow && parentRow !== tr) {
                    // If parentRow is in THEAD, drop into TBODY
                    if (parentRow.parentElement && parentRow.parentElement.tagName === 'THEAD') {
                        const tableEl = el.closest('table');
                        const tbodyEl = tableEl ? tableEl.querySelector('tbody') : null;
                        if (tbodyEl) {
                            return {
                                row: tbodyEl,
                                position: 'into'
                            };
                        }
                    } else {
                        const rect = parentRow.getBoundingClientRect();
                        const midpoint = rect.top + rect.height / 2;
                        return {
                            row: parentRow,
                            position: e.clientY >= midpoint ? 'after' : 'before'
                        };
                    }
                }
            }
        }
        return null;
    }
}