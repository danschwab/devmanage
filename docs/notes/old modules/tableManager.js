export class TableManager {
    static dragState = {
        isDragging: false,
        startX: 0,
        startY: 0,
        dragClone: null,
        sourceRow: null,
        hoverTimer: null,
        lastHoveredElement: null,
        dropCheckTimeout: null,
        lastDropCheck: 0,
        lastTabHover: null,
        tabHoverTimeout: null,
        draggingClickTags: null
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

    /**
     * Helper to create a table row (tr) from a data array.
     * @param {Array} row - The data for the row.
     * @param {number} rowIndex - The index of the row.
     * @param {Array} visibleIndexes - The visible column indexes.
     * @param {Array} editIndexes - The editable column indexes.
     * @param {string|null} dragId - Optional drag id.
     * @returns {HTMLTableRowElement}
     */
    static createTableRow(row, rowIndex, visibleIndexes, editIndexes, dragId) {
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
                        // Use contenteditable div instead of textarea/input
                        const editableDiv = document.createElement('div');
                        editableDiv.textContent = cell || '';
                        editableDiv.setAttribute('role', 'textbox');
                        editableDiv.setAttribute('contenteditable', 'true');
                        editableDiv.dataset.originalValue = cell || '';
                        editableDiv.dataset.rowIndex = rowIndex;
                        editableDiv.dataset.colIndex = colIndex;
                        editableDiv.dataset.dirty = 'false';
                        editableDiv.classList.add('table-edit-textarea');

                        editableDiv.addEventListener('input', (e) => {
                            const target = e.target;
                            const isDirty = (target.textContent !== target.dataset.originalValue);
                            target.dataset.dirty = isDirty.toString();
                            if (isDirty) {
                                target.classList.add('dirty');
                            } else {
                                target.classList.remove('dirty');
                            }
                        });

                        td.appendChild(editableDiv);
                    } else {
                        // Fix: display 0 as '0' instead of empty string
                        td.textContent = (cell === 0 || cell === '0') ? '0' : (cell || '');
                    }
                }
                tr.appendChild(td);
            }
        });
        return tr;
    }

    static buildTable(data, headers, hideColumns = [], editColumns = [], dragId = null, draggingClickTags = [], newRowFunction = null) {
        const tableData = data.data || data;
        const table = document.createElement('table');
        if (dragId) {
            table.classList.add(`drag-id-${dragId}`);
            // Store navigation tags in table dataset
            if (draggingClickTags.length > 0) {
                table.dataset.draggingClickTags = JSON.stringify(draggingClickTags);
            }
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
                    dragHandleTh.className = 'spacer-cell';
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
                    const tr = TableManager.createTableRow(row, rowIndex, visibleIndexes, editIndexes, dragId);
                    tbody.appendChild(tr);
                });
            } else {
                if (!newRowFunction && !dragId) {
                    return this.formatError('<div class="error-message">No data available</div>');
                }
            }
        }
        table.appendChild(tbody);

        // Add footer for new row if newRowFunction is provided
        if (typeof newRowFunction === 'function') {
            const tfoot = document.createElement('tfoot');
            const tr = document.createElement('tr');
            //const spacer = document.createElement('td');
            //spacer.className = 'spacer-cell';
            //tr.appendChild(spacer);

            const newRowTd = document.createElement('td');
            newRowTd.colSpan = 1000;
            newRowTd.className = 'new-row-button';

            if (!TableManager._newRowHandlers) TableManager._newRowHandlers = new Map();
            const handlerId = `new-row-handler-${Math.random().toString(36).slice(2, 11)}`;
            newRowTd.dataset.handlerId = handlerId;
            TableManager._newRowHandlers.set(handlerId, newRowFunction);

            // Use the tr as the button: add text and click handler to the tr
            tr.appendChild(newRowTd);
            tr.onclick = (event) => {
                console.log('[TableManager] New row tr clicked', { handlerId, event, table });
                const handler = TableManager._newRowHandlers.get(handlerId);
                if (handler) {
                    try {
                        handler(event);
                        console.log('[TableManager] New row handler executed successfully');
                    } catch (err) {
                        console.error('[TableManager] Error in new row handler:', err);
                    }
                } else {
                    console.warn('[TableManager] No handler found for new row tr', handlerId);
                }
            };

            tfoot.appendChild(tr);
            table.appendChild(tfoot);
        }
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
            lastHoveredElement: null,
            dropCheckTimeout: null,
            lastDropCheck: 0,
            lastTabHover: null,
            tabHoverTimeout: null,
            draggingClickTags: null
        };
    }

    static async checkDropTarget(e, draggingClickTags = []) {
        // Get dragId from the source row's table
        const sourceTable = this.dragState.sourceRow?.closest('table');
        let dragId = null;
        if (sourceTable) {
            const dragIdClass = Array.from(sourceTable.classList).find(cls => cls.startsWith('drag-id-'));
            dragId = dragIdClass;
        }

        const dropTarget = this.findDropTarget(e, dragId, draggingClickTags);
        if (dropTarget && this.dragState.sourceRow) {
            const { row, position } = dropTarget;
            // If drop target is inside a tfoot, always append as last child
            if (row.parentElement && row.parentElement.tagName === 'TFOOT') {
                row.parentNode.insertBefore(this.dragState.sourceRow, row);
            } else {
                if (position === 'before') {
                    row.parentNode.insertBefore(this.dragState.sourceRow, row);
                } else if (position === 'after') {
                    row.parentNode.insertBefore(this.dragState.sourceRow, row.nextSibling);
                } else if (position === 'into') {
                    // Place as first child if there are other children
                    if (row.children.length > 0) {
                        row.insertBefore(this.dragState.sourceRow, row.firstChild);
                    } else {
                        row.appendChild(this.dragState.sourceRow);
                    }
                }
            }
        }
    }

    static init() {
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
            
            const sourceTable = tr.closest('table');
            const draggingClickTags = sourceTable?.dataset.draggingClickTags ? 
                JSON.parse(sourceTable.dataset.draggingClickTags) : [];

            // Remove any existing row-clone from the DOM before starting a new drag
            const existingClone = document.querySelector('.row-clone');
            if (existingClone) existingClone.remove();

            this.dragState.isDragging = true;
            this.dragState.startX = e.clientX;
            this.dragState.startY = e.clientY;
            this.dragState.sourceRow = tr;
            this.dragState.draggingClickTags = draggingClickTags; // Store for use in mousemove
            
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
            
            // Throttle drop target checks to every 100ms
            const now = Date.now();
            if (now - this.dragState.lastDropCheck > 100) {
                this.dragState.lastDropCheck = now;
                if (this.dragState.dropCheckTimeout) {
                    clearTimeout(this.dragState.dropCheckTimeout);
                }
                this.dragState.dropCheckTimeout = setTimeout(() => {
                    const sourceTable = this.dragState.sourceRow?.closest('table');
                    const dragId = sourceTable ? Array.from(sourceTable.classList).find(cls => cls.startsWith('drag-id-')) : null;
                    this.checkDropTarget(e, this.dragState.draggingClickTags || []);
                }, 0);
            }
        };

        this.handlers.mouseup = () => {
            if (!this.dragState.isDragging) return;

            // Remove row if dropped inside a tfoot
            if (this.dragState.sourceRow) {
                /*const parentTable = this.dragState.sourceRow.closest('table');
                if (parentTable) {
                    const tfoot = Array.from(parentTable.children).find(
                        el => el.tagName === 'TFOOT'
                    );
                    if (tfoot && tfoot.contains(this.dragState.sourceRow)) {
                        // If row is inside tfoot, remove the row
                        this.dragState.sourceRow.remove();
                    }
                }*/
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
                lastHoveredElement: null,
                dropCheckTimeout: null,
                lastDropCheck: 0,
                lastTabHover: null,
                tabHoverTimeout: null,
                draggingClickTags: null
            };
        };

        // Add listeners with stored handlers
        document.addEventListener('mousedown', this.handlers.mousedown);
        document.addEventListener('mousemove', this.handlers.mousemove);
        document.addEventListener('mouseup', this.handlers.mouseup);
    }

    static findDropTarget(e, dragId, draggingClickTags = []) {
        const elements = document.elementsFromPoint(e.clientX, e.clientY);
        const sourceRow = this.dragState.sourceRow;

        // Check for navigation elements if we have allowed tags
        if (draggingClickTags.length > 0) {
            const navElement = elements.find(el => {
                return draggingClickTags.some(tag => el.matches(tag));
            });

            if (navElement) {
                if (this.dragState.lastTabHover !== navElement) {
                    if (this.dragState.tabHoverTimeout) {
                        clearTimeout(this.dragState.tabHoverTimeout);
                    }
                    this.dragState.lastTabHover = navElement;
                    this.dragState.tabHoverTimeout = setTimeout(() => {
                        navElement.click();
                    }, 1000);
                }
            } else if (this.dragState.tabHoverTimeout) {
                clearTimeout(this.dragState.tabHoverTimeout);
                this.dragState.lastTabHover = null;
            }
        }

        // Process drop targets
        for (const el of elements) {
            // Get the closest table and only continue if it has the correct tag
            const targetTable = el.closest('table');
            if (!targetTable || !targetTable.classList.contains(dragId)) continue;

            // Check for row targets
            if (el.tagName === 'TR' && el !== sourceRow) {
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
                if (parentRow && parentRow !== sourceRow) {
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

    static getDirtyEditables(table) {
        return table.querySelectorAll('.table-edit-textarea[data-dirty="true"]');
    }

    static getUpdates(includePosition = true) {
        const updates = [];
        
        // Get position updates if requested
        if (includePosition) {
            const tables = document.querySelectorAll('table');
            tables.forEach(table => {
                const tbody = table.querySelector('tbody');
                if (!tbody) return;
                
                Array.from(tbody.rows).forEach((row, newIndex) => {
                    const originalIndex = parseInt(row.dataset.originalIndex);
                    if (!isNaN(originalIndex) && originalIndex !== newIndex) {
                        updates.push({
                            type: 'position',
                            originalIndex: originalIndex + 1,
                            newIndex: newIndex + 1,
                            tableId: table.id || table.dataset.tableId
                        });
                    }
                });
            });
        }
        
        return updates;
    }

    // Enables/disables a save button based on dirty editables in a table
    static checkDirtyState(table, saveBtn) {
        saveBtn.disabled = TableManager.getDirtyEditables(table).length === 0;
    }

    // Clears dirty state for a list of editable divs
    static clearDirtyEditables(editables) {
        editables.forEach(editable => {
            editable.dataset.dirty = 'false';
            editable.classList.remove('dirty');
            editable.dataset.originalValue = editable.textContent;
        });
    }

    static trackRowPosition(table) {
        // For each tbody in this table (including sub-tables), set row.dataset.originalIndex = sequential index
        const tbodys = table.querySelectorAll('tbody');
        tbodys.forEach(tbody => {
            Array.from(tbody.rows).forEach((row, index) => {
                row.dataset.originalIndex = index.toString();
            });
        });
    }

    static clearDirtyState(table) {
        // Reset position tracking for the given table only
        if (table) {
            this.trackRowPosition(table);

            // Remove .dirty class from all contenteditable divs in the table
            const dirtyEditables = table.querySelectorAll('.table-edit-textarea.dirty');
            dirtyEditables.forEach(editable => editable.classList.remove('dirty'));
        }
    }

    static onStateChange(callback) {
        const observer = new MutationObserver((mutations) => {
            const hasStructuralChanges = mutations.some(mutation => 
                mutation.type === 'childList' || 
                (mutation.type === 'attributes' && mutation.attributeName === 'data-original-index')
            );
            
            if (hasStructuralChanges || mutations.some(m => m.attributeName === 'data-dirty')) {
                callback(mutations);
            }
        });

        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
            observer.observe(table, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ['data-dirty', 'data-original-index']
            });
        });
        return observer;
    }

    static tableCellCard(cell, message, classes = '', scrollTo = null) {
        // Remove existing warning if present
        const existing = cell.querySelector('.table-cell-warning');
        if (existing) existing.remove();

        const span = document.createElement('span');
        span.className = `table-cell-card ${classes}`;
        span.innerHTML = message;
        if (scrollTo) {
            span.style.cursor = 'pointer';
            span.onclick = () => {
                // Search every parent element's siblings until a match is found
                let parent = cell.parentElement;
                let found = null;
                while (parent && !found) {
                    let siblings = Array.from(parent.parentElement ? parent.parentElement.children : []);
                    for (let sibling of siblings) {
                        if (sibling !== parent) {
                            found = sibling.matches && sibling.matches(scrollTo) ? sibling : sibling.querySelector && sibling.querySelector(scrollTo);
                            if (found) break;
                        }
                    }
                    parent = parent.parentElement;
                }
                if (found) found.scrollIntoView({ behavior: 'smooth', block: 'center' });
            };
        }
        cell.appendChild(span);
    }

    static setupPackListSaveButton(table, saveBtn, tabName, headers, crateIdx) {
        const getDirtyEditables = () => TableManager.getDirtyEditables(table);
        const checkDirtyState = () => TableManager.checkDirtyState(table, saveBtn);

        // Use onStateChange to observe dirty state for this table only
        const observer = new MutationObserver((mutations) => {
            // Only react if the mutation is for this table
            if ([...mutations].some(m => table.contains(m.target))) {
                checkDirtyState();
            }
        });
        observer.observe(table, {
            subtree: true,
            attributes: true,
            attributeFilter: ['data-dirty']
        });

        saveBtn.onclick = async () => {
            const dirtyEditables = getDirtyEditables();
            if (!dirtyEditables.length) return;
            try {
                saveBtn.disabled = true;
                const updates = Array.from(dirtyEditables).map(editable => ({
                    type: 'cell',
                    row: parseInt(editable.dataset.rowIndex) + 1,
                    col: parseInt(editable.dataset.colIndex),
                    value: editable.textContent
                }));
                await window.GoogleSheetsService.setSheetData(
                    window.SPREADSHEET_IDS.PACK_LISTS,
                    tabName,
                    updates
                );
                TableManager.clearDirtyEditables(dirtyEditables);
                window.ModalManager.alert('Changes saved successfully');
            } catch (error) {
                window.ModalManager.alert('Error saving changes: ' + error.message);
            } finally {
                checkDirtyState();
                observer.disconnect(); // Stop observing after save
                // Optionally, re-enable observation if needed:
                // observer.observe(table, { subtree: true, attributes: true, attributeFilter: ['data-dirty'] });
            }
        };

        // Initial state check
        checkDirtyState();
    }

    /**
     * Converts a DOM table element to a 2D array (including headers).
     * Each cell's textContent is used. Contenteditable divs are included as their text.
     * @param {HTMLTableElement} table
     * @returns {string[][]}
     */
    static tableToArray(table) {
        const result = [];
        // Get headers if present
        const thead = table.querySelector('thead');
        if (thead) {
            const headerRow = thead.querySelector('tr');
            if (headerRow) {
                const headers = [];
                headerRow.querySelectorAll('th').forEach(th => {
                    headers.push(th.textContent.trim());
                });
                result.push(headers);
            }
        }
        // Get body rows
        const tbody = table.querySelector('tbody');
        if (tbody) {
            tbody.querySelectorAll('tr').forEach(tr => {
                const row = [];
                tr.querySelectorAll('td').forEach(td => {
                    // If cell contains a contenteditable div, use its textContent
                    const editable = td.querySelector('.table-edit-textarea');
                    if (editable) {
                        row.push(editable.textContent.trim());
                    } else {
                        row.push(td.textContent.trim());
                    }
                });
                result.push(row);
            });
        }
        return result;
    }
}