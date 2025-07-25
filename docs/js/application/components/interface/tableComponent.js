import { html } from '../../index.js';

// Global drag state for cross-table row dragging
let globalDragRow = null;
let globalDragSourceTable = null;

export const TableComponent = {
    name: 'TableComponent',
    props: {
        data: {
            type: Array,
            default: () => []
        },
        columns: {
            type: Array,
            required: true
        },
        isLoading: {
            type: Boolean,
            default: false
        },
        error: {
            type: String,
            default: null
        },
        title: {
            type: String,
            default: 'Data Table'
        },
        showRefresh: {
            type: Boolean,
            default: true
        },
        emptyMessage: {
            type: String,
            default: 'No data available'
        },
        draggable: {
            type: Boolean,
            default: false
        },
        newRow: {
            type: Boolean,
            default: false
        },
        showFooter: {
            type: Boolean,
            default: true
        },
        showHeader: {
            type: Boolean,
            default: true
        },
        dragId: {
            type: String,
            default: null
        },
        loadingMessage: {
            type: String,
            default: 'Loading data...'
        },
        originalData: {
            type: Array,
            required: true
        },
        hamburgerMenuComponent: {
            type: Object,
            default: null
        },
        hideColumns: {
            type: Array,
            default: () => []
        }
    },
    emits: ['refresh', 'cell-edit', 'row-move', 'new-row', 'inner-table-dirty', 'show-hamburger-menu'],
    data() {
        return {
            dragIndex: null,
            dragOverIndex: null,
            dragActive: false,
            dragSourceTableId: null,
            dragMoved: false,
            dirtyCells: {},
            allowSaveEvent: false,
            rowsMarkedForDeletion: new Set(), // Track indices of rows marked for deletion
            nestedTableDirtyCells: {} // Track dirty state for nested tables by [row][col]
        };
    },
    computed: {
        showSaveButton() {
            // True if any editable cell, movable row, or add row button is present
            const hasEditable = this.columns.some(col => col.editable);
            const hasMovable = !!this.draggable;
            const hasAddRow = !!this.newRow;
            return hasEditable || hasMovable || hasAddRow;
        },
        hideSet() {
            // Hide columns listed in hideColumns prop and always hide 'marked-for-deletion'
            return new Set([...(this.hideColumns || []), 'marked-for-deletion']);
        },
        visibleRows() {
            // Only show rows not marked for deletion
            return this.data
                .map((row, idx) => ({ row, idx }))
                .filter(({ row }) => !row['marked-for-deletion']);
        },
        deletedRows() {
            // Show rows marked for deletion in tfoot
            return this.data
                .map((row, idx) => ({ row, idx }))
                .filter(({ row }) => row['marked-for-deletion']);
        }
    },
    watch: {
        allowSaveEvent(val) {
            // Emit to parent if dirty state changes
            console.log('[TableComponent] allowSaveEvent changed:', val);
            this.$emit('inner-table-dirty', val);
        },
        data: {
            handler() {
                console.log('[TableComponent] originalData:', this.originalData);
                this.$nextTick(() => {
                    this.updateAllEditableCells();
                    this.compareAllCellsDirty();
                });
            },
            deep: true
        },
        isLoading(val) {
            // When loading state changes, update cells and compare dirty
            this.$nextTick(() => {
                this.updateAllEditableCells();
                this.compareAllCellsDirty();
            });
        }
    },
    mounted() {
        console.log('[TableComponent] originalData:', this.originalData);
        this.$nextTick(() => {
            this.updateAllEditableCells();
            this.compareAllCellsDirty();
        });
        // Listen for mouseup globally to end drag
        window.addEventListener('mouseup', this.handleGlobalMouseUp);
        // Listen for dragend globally to ensure drag state is always cleared
        window.addEventListener('dragend', this.handleGlobalMouseUp);
    },
    beforeUnmount() {
        window.removeEventListener('mouseup', this.handleGlobalMouseUp);
        window.removeEventListener('dragend', this.handleGlobalMouseUp);
    },
    methods: {
        handleRefresh() {
            this.$emit('refresh');
            // Also clear dirty state for nested tables on refresh
            this.nestedTableDirtyCells = {};
        },
        
        formatCellValue(value, column) {
            if (value === null || value === undefined) return '';
            
            // Apply column-specific formatting
            if (column.format) {
                switch (column.format) {
                    case 'currency':
                        return `$${parseFloat(value).toFixed(2)}`;
                    case 'date':
                        return new Date(value).toLocaleDateString();
                    case 'number':
                        return parseFloat(value).toLocaleString();
                    case 'percentage':
                        return `${parseFloat(value).toFixed(1)}%`;
                    default:
                        return value;
                }
            }
            
            return value;
        },
        
        getCellClass(value, column, rowIndex, colIndex) {
            let baseClass = '';
            // Support function-based cell classes
            if (typeof column.cellClass === 'function') {
                baseClass = column.cellClass(value);
            }
            // Support object-based cell classes
            if (typeof column.cellClass === 'object') {
                for (const [className, condition] of Object.entries(column.cellClass)) {
                    if (typeof condition === 'function' && condition(value)) {
                        return className;
                    }
                    if (value === condition) {
                        return className;
                    }
                }
            }
            // Add dirty class if cell is dirty
            if (this.dirtyCells[rowIndex] && this.dirtyCells[rowIndex][colIndex]) {
                baseClass = (baseClass ? baseClass + ' ' : '') + 'dirty';
            }
            // Add dirty class if nested table in this cell is dirty
            if (this.nestedTableDirtyCells[rowIndex] && this.nestedTableDirtyCells[rowIndex][colIndex]) {
                baseClass = (baseClass ? baseClass + ' ' : '') + 'dirty';
            }
            return baseClass;
        },
        
        getColumnWidth(column) {
            return column.width ? `${column.width}px` : 'auto';
        },
        handleCellEdit(rowIndex, colIndex, value) {
            this.$emit('cell-edit', rowIndex, colIndex, value);
            // Dirty check for single cell
            if (!this.dirtyCells[rowIndex]) this.dirtyCells[rowIndex] = {};
            const originalValue = this.originalData[rowIndex]?.[this.columns[colIndex].key];
            if (value !== originalValue) {
                this.dirtyCells[rowIndex][colIndex] = true;
            } else {
                delete this.dirtyCells[rowIndex][colIndex];
            }
            this.checkDirtyCells();
        },
        compareAllCellsDirty() {
            // Compare all cells in data vs originalData and update dirtyCells
            this.dirtyCells = {};
            if (!Array.isArray(this.data) || !Array.isArray(this.originalData)) return;
            this.data.forEach((row, rowIndex) => {
                const originalRow = this.originalData[rowIndex];
                // Treat undefined originalRow as an object with all nulls for dirty checking
                this.columns.forEach((column, colIndex) => {
                    const key = column.key;
                    if (column.editable) {
                        const currentValue = row[key];
                        // If originalRow is undefined, treat as null
                        const originalValue = originalRow ? originalRow[key] : null;
                        if (currentValue !== originalValue) {
                            if (!this.dirtyCells[rowIndex]) this.dirtyCells[rowIndex] = {};
                            this.dirtyCells[rowIndex][colIndex] = true;
                        }
                    }
                });
            });
            this.checkDirtyCells();
        },
        // Called by slot from nested TableComponent
        handleInnerTableDirty(isDirty, rowIndex, colIndex) {
            if (!this.nestedTableDirtyCells[rowIndex]) this.nestedTableDirtyCells[rowIndex] = {};
            if (isDirty) {
                this.nestedTableDirtyCells[rowIndex][colIndex] = true;
            } else {
                delete this.nestedTableDirtyCells[rowIndex][colIndex];
                if (Object.keys(this.nestedTableDirtyCells[rowIndex]).length === 0) {
                    delete this.nestedTableDirtyCells[rowIndex];
                }
            }
            this.checkDirtyCells();
        },
        checkDirtyCells() {
            // If any cell is dirty, allow save event
            const hasDirtyCell = Object.keys(this.dirtyCells).some(row =>
                Object.keys(this.dirtyCells[row]).length > 0
            );
            // If any nested table cell is dirty, allow save event
            const hasNestedDirty = Object.keys(this.nestedTableDirtyCells).some(row =>
                Object.keys(this.nestedTableDirtyCells[row]).length > 0
            );
            this.allowSaveEvent = hasDirtyCell || hasNestedDirty;
            // Also, if any row is marked for deletion, allow save event
            if (!this.allowSaveEvent && Array.isArray(this.data)) {
                this.allowSaveEvent = this.data.some(row => row && row['marked-for-deletion']);
            }
        },
        handleSave() {
            this.$emit('on-save');
            // After save, reset dirty state
            this.dirtyCells = {};
            this.nestedTableDirtyCells = {}; // <-- clear nested dirty state on save
            this.allowSaveEvent = false;
        },
        handleRowMove() {
            this.$emit('row-move');
        },
        handleGlobalMouseUp() {
            // End drag state on any mouseup or dragend
            this.dragIndex = null;
            this.dragOverIndex = null;
            this.dragSourceTableId = null;
            this.dragMoved = false;
            // Reset global drag state
            globalDragRow = null;
            globalDragSourceTable = null;
        },
        handleDragStart(rowIndex, event) {
            if (!event.target.classList.contains('row-drag-handle')) {
                event.preventDefault();
                return;
            }
            this.dragIndex = rowIndex;
            this.dragSourceTableId = this.dragId;
            this.dragMoved = false;
            // Set global drag state for cross-table dragging
            globalDragRow = this.data[rowIndex];
            globalDragSourceTable = this;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', rowIndex);
            if (event.dataTransfer.setDragImage) {
                let tr = event.target.closest('tr');
                if (tr) {
                    const clone = tr.cloneNode(true);
                    clone.style.background = '#fff';
                    clone.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                    clone.style.width = `${tr.offsetWidth}px`;
                    clone.style.position = 'absolute';
                    clone.style.top = '-9999px';
                    document.body.appendChild(clone);
                    event.dataTransfer.setDragImage(clone, 0, 0);
                    setTimeout(() => document.body.removeChild(clone), 0);
                } else {
                    event.dataTransfer.setDragImage(event.target, 0, 0);
                }
            }
        },
        handleDragOverRow(rowIndex, event) {
            event.preventDefault();
            // Allow auto-scrolling while dragging
            const scrollMargin = 40;
            const scrollSpeed = 20;
            const y = event.clientY;
            const winHeight = window.innerHeight;
            if (y < scrollMargin) {
                window.scrollBy({ top: -scrollSpeed, behavior: 'auto' });
            } else if (y > winHeight - scrollMargin) {
                window.scrollBy({ top: scrollSpeed, behavior: 'auto' });
            }
            // If the dragged row is marked for deletion, unmark it when dragged over tbody
            if (
                this.dragIndex !== null &&
                this.data[this.dragIndex] &&
                this.data[this.dragIndex]['marked-for-deletion']
            ) {
                this.data[this.dragIndex]['marked-for-deletion'] = false;
            }

            // Cross-table drag logic
            if (
                globalDragRow &&
                globalDragSourceTable &&
                globalDragSourceTable !== this &&
                globalDragSourceTable.dragId === this.dragId &&
                !this.dragMoved
            ) {
                // Insert the row at the drop position
                let insertIndex = rowIndex;
                const rowEl = event.currentTarget;
                const rect = rowEl.getBoundingClientRect();
                const mouseY = event.clientY;
                const midpoint = rect.top + rect.height / 2;
                if (mouseY > midpoint) {
                    insertIndex = rowIndex + 1;
                }
                // Prevent duplicate insert if already present
                if (!this.data.includes(globalDragRow)) {
                    // Remove marked-for-deletion state before inserting into new table
                    if (globalDragRow && globalDragRow['marked-for-deletion']) {
                        delete globalDragRow['marked-for-deletion'];
                    }
                    this.data.splice(insertIndex, 0, globalDragRow);
                    // Remove from source table
                    const srcIdx = globalDragSourceTable.data.indexOf(globalDragRow);
                    if (srcIdx !== -1) {
                        globalDragSourceTable.data.splice(srcIdx, 1);
                    }
                    // End drag in both tables to clear drag state and row highlight
                    if (typeof globalDragSourceTable.handleGlobalMouseUp === 'function') {
                        globalDragSourceTable.handleGlobalMouseUp();
                    }
                    this.handleGlobalMouseUp();
                    this.$emit('row-move', null, insertIndex, [...this.data]);
                }
                // Clear global drag state
                globalDragRow = null;
                globalDragSourceTable = null;
                return;
            }
            // ...existing drop-target logic...
            if (
                this.dragIndex !== null &&
                this.dragSourceTableId === this.dragId &&
                this.dragIndex !== rowIndex &&
                !this.dragMoved
            ) {
                const rowEl = event.currentTarget;
                const rect = rowEl.getBoundingClientRect();
                const mouseY = event.clientY;
                const midpoint = rect.top + rect.height / 2;
                let insertIndex = rowIndex;
                if (mouseY > midpoint) {
                    insertIndex = rowIndex + 1;
                }
                if (insertIndex > this.dragIndex) insertIndex--;
                if (insertIndex !== this.dragIndex) {
                    const movedRow = this.data[this.dragIndex];
                    this.data.splice(this.dragIndex, 1);
                    this.data.splice(insertIndex, 0, movedRow);
                    this.$emit('row-move', this.dragIndex, insertIndex, [...this.data]);
                    this.dragIndex = insertIndex;
                    this.dragMoved = true;
                    setTimeout(() => { this.dragMoved = false; }, 50);
                }
            }
            this.dragOverIndex = rowIndex;
        },
        handleDropOnRow(rowIndex, event) {
            event.preventDefault();
            // End drag state on drop
            this.handleGlobalMouseUp();
        },
        handleDragOverThead(event) {
            event.preventDefault();
            // Allow auto-scrolling while dragging
            const scrollMargin = 40;
            const scrollSpeed = 20;
            const y = event.clientY;
            if (y < scrollMargin) {
                window.scrollBy({ top: -scrollSpeed, behavior: 'auto' });
            }
            // If dragging a row marked for deletion over thead, unmark it
            if (
                this.dragIndex !== null &&
                this.data[this.dragIndex] &&
                this.data[this.dragIndex]['marked-for-deletion']
            ) {
                this.data[this.dragIndex]['marked-for-deletion'] = false;
            }
            // ...existing code...
            if (
                this.dragIndex !== null &&
                this.dragSourceTableId === this.dragId &&
                this.dragIndex !== 0 &&
                !this.dragMoved
            ) {
                const movedRow = this.data[this.dragIndex];
                this.data.splice(this.dragIndex, 1);
                this.data.splice(0, 0, movedRow);
                this.$emit('row-move', this.dragIndex, 0, [...this.data]);
                this.dragIndex = 0;
                this.dragMoved = true;
                setTimeout(() => { this.dragMoved = false; }, 50);
            }
            this.dragOverIndex = -1;
        },
        handleDropOnThead(event) {
            event.preventDefault();
            this.handleGlobalMouseUp();
        },
        handleDragOverTfoot(event) {
            event.preventDefault();
            // Allow auto-scrolling while dragging
            const scrollMargin = 40;
            const scrollSpeed = 20;
            const y = event.clientY;
            const winHeight = window.innerHeight;
            if (y > winHeight - scrollMargin) {
                window.scrollBy({ top: scrollSpeed, behavior: 'auto' });
            }
            // Mark row for deletion if dragging over tfoot
            if (
                this.dragIndex !== null &&
                this.dragSourceTableId === this.dragId &&
                !this.dragMoved &&
                this.data[this.dragIndex] &&
                !this.data[this.dragIndex]['marked-for-deletion']
            ) {
                this.data[this.dragIndex]['marked-for-deletion'] = true;
            }
            this.dragOverIndex = this.data.length;
        },
        handleDropOnTfoot(event) {
            event.preventDefault();
            this.handleGlobalMouseUp();
        },
        handleNewRow() {
            this.$emit('new-row');
        },
        handleHamburgerMenu() {
            // Emit event to parent to show hamburger menu
            this.$emit('show-hamburger-menu', {
                menuComponent: this.hamburgerMenuComponent,
                tableId: this.dragId
            });
        },
        updateAllEditableCells() {
            // Set contenteditable text for all editable cells to match data (only on mount or new row)
            if (!Array.isArray(this.data)) return; // <-- guard against null/undefined
            this.data.forEach((row, rowIndex) => {
                this.columns.forEach((column, colIndex) => {
                    if (column.editable) {
                        const refName = 'editable_' + rowIndex + '_' + colIndex;
                        const cell = this.$refs[refName];
                        const value = row[column.key] || '';
                        if (cell && cell instanceof HTMLElement) {
                            // Only update if cell is not focused
                            if (document.activeElement !== cell) {
                                cell.textContent = value;
                            }
                        } else if (Array.isArray(cell)) {
                            cell.forEach(el => {
                                if (el instanceof HTMLElement && document.activeElement !== el) {
                                    el.textContent = value;
                                }
                            });
                        }
                    }
                });
            });
        }
    },
    template: html `
        <div class="dynamic-table">
            <div :class="dragId ? 'drag-id-' + dragId : ''">
                <div class="content-header" v-if="showHeader && (title || showRefresh)">
                    <h3 v-if="title">{{ title }}</h3>
                    <div v-if="showSaveButton || showRefresh || hamburgerMenuComponent" :class="{'button-bar': showSaveButton || showRefresh}">
                        <button
                            v-if="showSaveButton"
                            @click="handleSave"
                            :disabled="isLoading || !allowSaveEvent"
                            class="save-button green"
                        >
                            Save
                        </button>
                        <button 
                            v-if="showRefresh" 
                            @click="handleRefresh" 
                            :disabled="isLoading" 
                            :class="'refresh-button ' + (allowSaveEvent ? 'red' : '')"
                        >
                            {{ isLoading ? 'Loading...' : (allowSaveEvent ? 'Discard' : 'Refresh') }}
                        </button>
                        <button
                            v-if="hamburgerMenuComponent"
                            @click="handleHamburgerMenu"
                            class="button-symbol white"
                        >
                            ☰
                        </button>
                    </div>
                </div>
                
                <!-- Error State -->
                <div v-if="error">
                    <span class="table-cell-card red">Error: {{ error }}</span>
                </div>
                
                <!-- Loading State -->
                <div v-if="isLoading" class="loading-message">
                    <img src="images/loading.gif" alt="..."/>
                    <p>{{ loadingMessage }}</p>
                </div>
                
                <!-- Empty State -->
                <div v-else-if="!data || data.length === 0" class="empty-message">
                    <p>{{ emptyMessage }}</p>
                </div>
                
                <!-- Data Table -->
                <div v-else class="table-wrapper">
                    <table>
                        <thead
                            @dragover="handleDragOverThead"
                            @drop="handleDropOnThead"
                        >
                            <tr>
                                <th v-if="draggable" class="spacer-cell"></th>
                                <th 
                                    v-for="(column, colIdx) in columns" 
                                    :key="column.key"
                                    :style="{ width: getColumnWidth(column) }"
                                    :class="[column.headerClass, hideSet.has(column.key) ? 'hide' : '']"
                                >
                                    {{ column.label }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="({ row, idx }, visibleIdx) in visibleRows" 
                                :key="idx"
                                :class="{
                                    'dragging': dragIndex === idx,
                                    'drag-over': dragOverIndex === idx
                                }"
                                @dragover="handleDragOverRow(idx, $event)"
                                @drop="handleDropOnRow(idx, $event)"
                            >
                                <td v-if="draggable"
                                    class="row-drag-handle"
                                    draggable="true"
                                    @dragstart="handleDragStart(idx, $event)"
                                ></td>
                                <td 
                                    v-for="(column, colIndex) in columns" 
                                    :key="column.key"
                                    :class="[getCellClass(row[column.key], column, idx, colIndex), hideSet.has(column.key) ? 'hide' : '']"
                                >
                                    <div
                                        v-if="column.editable"
                                        contenteditable="true"
                                        :data-row-index="idx"
                                        :data-col-index="colIndex"
                                        @input="handleCellEdit(idx, colIndex, $event.target.textContent)"
                                        class="table-edit-textarea"
                                        :ref="'editable_' + idx + '_' + colIndex"
                                    ></div>
                                    <slot 
                                        v-else 
                                        :row="row" 
                                        :rowIndex="idx" 
                                        :column="column"
                                        :cellRowIndex="idx"
                                        :cellColIndex="colIndex"
                                        :onInnerTableDirty="(isDirty) => handleInnerTableDirty(isDirty, idx, colIndex)"
                                    >
                                        {{ formatCellValue(row[column.key], column) }}
                                    </slot>
                                </td>
                            </tr>
                        </tbody>
                        <tfoot v-if="newRow"
                            @dragover="handleDragOverTfoot"
                            @drop="handleDropOnTfoot"
                        >
                            <tr v-for="({ row, idx }, delIdx) in deletedRows"
                                :key="'del-' + idx"
                                class="marked-for-deletion"
                            >
                                <td v-if="draggable"
                                    class="row-drag-handle"
                                    draggable="true"
                                    @dragstart="handleDragStart(idx, $event)"
                                ></td>
                                <td 
                                    v-for="(column, colIndex) in columns" 
                                    :key="column.key"
                                    :class="[getCellClass(row[column.key], column, idx, colIndex), hideSet.has(column.key) ? 'hide' : '']"
                                >
                                    <div
                                        v-if="column.editable"
                                        contenteditable="true"
                                        :data-row-index="idx"
                                        :data-col-index="colIndex"
                                        @input="handleCellEdit(idx, colIndex, $event.target.textContent)"
                                        class="table-edit-textarea"
                                        :ref="'editable_' + idx + '_' + colIndex"
                                    ></div>
                                    <slot v-else :row="row" :rowIndex="idx" :column="column">
                                        {{ formatCellValue(row[column.key], column) }}
                                    </slot>
                                </td>
                            </tr>
                            <tr>
                                <td v-if="draggable" class="spacer-cell"></td>
                                <td 
                                    :colspan="draggable ? columns.length : columns.length" 
                                    class="new-row-button" 
                                    @click="handleNewRow"
                                >
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                
                <!-- Data Summary -->
                <div v-if="showFooter && allowSaveEvent && !isLoading" class="content-footer red">
                    <p>There are unsaved changes in this table.</p>
                </div>
                <div v-else-if="showFooter && data && data.length > 0 && !isLoading" class="content-footer">
                    <p>Showing {{ data.length }} item{{ data.length !== 1 ? 's' : '' }}</p>
                </div>
            </div>
        </div>
    `
};

export default TableComponent;