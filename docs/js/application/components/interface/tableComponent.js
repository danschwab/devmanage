import { html } from '../../index.js';

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
        }
    },
    emits: ['refresh', 'cell-edit', 'row-move', 'new-row', 'inner-table-dirty'],
    data() {
        return {
            dragIndex: null,
            dragOverIndex: null,
            dragActive: false,
            dragSourceTableId: null,
            dirtyCells: {}, // {rowIndex: {colIndex: true}}
            allowSaveEvent: false // <-- renamed from showSaveButton
        };
    },
    computed: {
        showSaveButton() {
            // True if any editable cell, movable row, or add row button is present
            const hasEditable = this.columns.some(col => col.editable);
            const hasMovable = !!this.draggable;
            const hasAddRow = !!this.newRow;
            return hasEditable || hasMovable || hasAddRow;
        }
    },
    watch: {
        allowSaveEvent(val) {
            // Emit to parent if dirty state changes
            console.log('[TableComponent] allowSaveEvent changed:', val);
            this.$emit('inner-table-dirty', val);
        }
    },
    mounted() {
        this.$nextTick(() => {
            this.updateAllEditableCells();
            this.compareAllCellsDirty();
        });
    },
    methods: {
        handleRefresh() {
            this.$emit('refresh');
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
                baseClass += ' dirty-cell';
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
                if (!originalRow) return;
                this.columns.forEach((column, colIndex) => {
                    const key = column.key;
                    if (column.editable) {
                        const currentValue = row[key];
                        const originalValue = originalRow[key];
                        if (currentValue !== originalValue) {
                            if (!this.dirtyCells[rowIndex]) this.dirtyCells[rowIndex] = {};
                            this.dirtyCells[rowIndex][colIndex] = true;
                        }
                    }
                });
            });
            this.checkDirtyCells();
        },
        checkDirtyCells() {
            // If any cell is dirty, allow save event
            this.allowSaveEvent = Object.keys(this.dirtyCells).some(row =>
                Object.keys(this.dirtyCells[row]).length > 0
            );
            // Check nested TableComponents for dirty state
            if (!this.allowSaveEvent) {
                // If no dirty cells, check for dirty nested tables
                this.allowSaveEvent = this.checkNestedTableDirty();
            }
        },
        checkNestedTableDirty() {
            // Recursively search for nested TableComponents and return true if any are dirty
            function findNestedTableComponents(obj, refKeyPath = []) {
                if (!obj) return false;
                let compName = 'unknown';
                if (obj.$options && obj.$options.name) compName = obj.$options.name;
                else if (obj.tagName) compName = obj.tagName;
                else if (obj.constructor && obj.constructor.name) compName = obj.constructor.name;
                const isVueComponent = !!obj.$options;

                // Identify TableComponent by name or by presence of allowSaveEvent on Vue components
                if (
                    isVueComponent &&
                    (
                        compName === 'TableComponent' ||
                        typeof obj.allowSaveEvent !== 'undefined'
                    )
                ) {
                    if (obj.allowSaveEvent) {
                        return true;
                    }
                }
                // Search $refs of this component
                if (obj.$refs) {
                    for (const subRefKey of Object.keys(obj.$refs)) {
                        const subRef = obj.$refs[subRefKey];
                        if (Array.isArray(subRef)) {
                            for (let idx = 0; idx < subRef.length; idx++) {
                                if (findNestedTableComponents(subRef[idx], refKeyPath.concat([subRefKey, idx]))) {
                                    return true;
                                }
                            }
                        } else {
                            if (findNestedTableComponents(subRef, refKeyPath.concat([subRefKey]))) {
                                return true;
                            }
                        }
                    }
                }
                // Search $children (Vue 2) for dynamically created components
                if (obj.$children && obj.$children.length) {
                    for (let child of obj.$children) {
                        if (findNestedTableComponents(child, refKeyPath.concat(['$child']))) {
                            return true;
                        }
                    }
                }
                return false;
            }
            const foundDirty = findNestedTableComponents(this, []);
            console.log('[TableComponent] checkNestedTableDirty: found dirty state:', foundDirty);
            return foundDirty;
        },
        handleSave() {
            this.$emit('on-save');
            // After save, reset dirty state
            this.dirtyCells = {};
            this.allowSaveEvent = false;
        },
        handleRowMove() {
            this.$emit('row-move');
        },
        handleDragHandleDown(rowIndex, event) {
            console.log('[TableComponent] Drag handle mousedown:', { rowIndex, event });
            this.dragActive = true;
            // Store drag source table id for cross-table dragging
            this.dragSourceTableId = this.dragId;
        },
        handleDragStart(rowIndex, event) {
            console.log('[TableComponent] Drag start:', { rowIndex, dragActive: this.dragActive, eventTarget: event.target });
            if (this.dragActive && event.target.classList.contains('row-drag-handle')) {
                this.dragIndex = rowIndex;
                this.dragSourceTableId = this.dragId;
                console.log('[TableComponent] Drag initiated:', { dragIndex: this.dragIndex, dragSourceTableId: this.dragSourceTableId });
            } else {
                console.log('[TableComponent] Drag start ignored (not drag handle)');
            }
            this.dragActive = false;
        },
        handleDragOver(rowIndex, event) {
            event.preventDefault();
            // Only log drag-over if a valid drag is in progress and drag-ids match
            if (this.dragIndex !== null && this.dragSourceTableId === this.dragId) {
                this.dragOverIndex = rowIndex;
                console.log('[TableComponent] Drag over:', { rowIndex, dragOverIndex: this.dragOverIndex, dragId: this.dragId });
            }
        },
        handleDrop(rowIndex) {
            // Only process drop if a valid drag is in progress and drag-ids match
            if (this.dragIndex !== null && this.dragSourceTableId === this.dragId) {
                console.log('[TableComponent] Drop:', { dragIndex: this.dragIndex, dropIndex: rowIndex, dragId: this.dragId });
                console.log('[TableComponent] Original data before move:', JSON.parse(JSON.stringify(this.originalData)));
                if (this.dragIndex !== rowIndex) {
                    const movedRow = this.data[this.dragIndex];
                    this.data.splice(this.dragIndex, 1);
                    let insertIndex = rowIndex;
                    if (this.dragIndex < rowIndex) {
                        insertIndex = rowIndex;
                    }
                    this.data.splice(insertIndex, 0, movedRow);
                    // Emit dragIndex, dropIndex, and the new array
                    this.$emit('row-move', this.dragIndex, insertIndex, [...this.data]);
                } else {
                    console.log('[TableComponent] Drop ignored (same index)');
                }
            }
            // Always reset drag state
            this.dragIndex = null;
            this.dragOverIndex = null;
            this.dragSourceTableId = null;
        },
        handleNewRow() {
            this.$emit('new-row');
            this.$nextTick(() => {
                this.updateAllEditableCells();
            });
        },
        refreshEditableCells() {
            this.updateAllEditableCells();
        },
        updateAllEditableCells() {
            // Set contenteditable text for all editable cells to match data (only on mount or new row)
            if (!Array.isArray(this.data)) return; // <-- guard against null/undefined
            this.data.forEach((row, rowIndex) => {
                this.columns.forEach((column, colIndex) => {
                    if (column.editable) {
                        const refName = 'editable_' + rowIndex + '_' + colIndex;
                        const cell = this.$refs[refName];
                        if (cell && cell instanceof HTMLElement) {
                            cell.textContent = row[column.key] || '';
                        } else if (Array.isArray(cell)) {
                            cell.forEach(el => {
                                if (el instanceof HTMLElement) {
                                    el.textContent = row[column.key] || '';
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
                    <div v-if="showSaveButton || showRefresh" class="button-bar">
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
                    </div>
                </div>
                
                <!-- Loading State -->
                <div v-if="isLoading" class="loading-message">
                    <img src="images/loading.gif" alt="..."/>
                    <p>{{ loadingMessage }}</p>
                </div>
                
                <!-- Error State -->
                <div v-else-if="error" class="error-message">
                    <p>Error: {{ error }}</p>
                    <button v-if="showRefresh" @click="handleRefresh">Try Again</button>
                </div>
                
                <!-- Empty State -->
                <div v-else-if="!data || data.length === 0" class="empty-message">
                    <p>{{ emptyMessage }}</p>
                </div>
                
                <!-- Data Table -->
                <div v-else class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th v-if="draggable" class="spacer-cell"></th>
                                <th 
                                    v-for="(column, colIdx) in columns" 
                                    :key="column.key"
                                    :style="{ width: getColumnWidth(column) }"
                                    :class="column.headerClass"
                                >
                                    {{ column.label }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(row, rowIndex) in data" 
                                :key="rowIndex"
                                :class="{ 'dragging': dragIndex === rowIndex, 'drag-over': dragOverIndex === rowIndex }"
                            >
                                <td v-if="draggable"
                                    class="row-drag-handle"
                                    draggable="true"
                                    @mousedown="handleDragHandleDown(rowIndex, $event)"
                                    @dragstart="handleDragStart(rowIndex, $event)"
                                    @dragover="handleDragOver(rowIndex, $event)"
                                    @drop="handleDrop(rowIndex)"
                                ></td>
                                <td 
                                    v-for="(column, colIndex) in columns" 
                                    :key="column.key"
                                    :class="getCellClass(row[column.key], column, rowIndex, colIndex)"
                                >
                                    <div
                                        v-if="column.editable"
                                        contenteditable="true"
                                        :data-row-index="rowIndex"
                                        :data-col-index="colIndex"
                                        @input="handleCellEdit(rowIndex, colIndex, $event.target.textContent)"
                                        class="table-edit-textarea"
                                        :ref="'editable_' + rowIndex + '_' + colIndex"
                                    ></div>
                                    <slot v-else :row="row" :rowIndex="rowIndex" :column="column">
                                        {{ formatCellValue(row[column.key], column) }}
                                    </slot>
                                </td>
                            </tr>
                        </tbody>
                        <tfoot v-if="newRow">
                            <tr>
                                <td :colspan="draggable ? columns.length + 1 : columns.length" class="new-row-button" @click="handleNewRow">
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                
                <!-- Data Summary -->
                <div v-if="showFooter && data && data.length > 0" class="content-footer">
                    <p>Showing {{ data.length }} item{{ data.length !== 1 ? 's' : '' }}</p>
                </div>
            </div>
        </div>
    `
};

export default TableComponent;