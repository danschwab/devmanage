import { html, parseDate } from '../../index.js';

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
        showSearch: {
            type: Boolean,
            default: false
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
        },
        sortable: {
            type: Boolean,
            default: false
        },
        searchTerm: {
            type: String,
            default: ''
        },
        hideRowsOnSearch: {
            type: Boolean,
            default: true
        },
        allowDetails: {
            type: Boolean,
            default: false
        }
    },
    emits: ['refresh', 'cell-edit', 'row-move', 'new-row', 'inner-table-dirty', 'show-hamburger-menu', 'search'],
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
            nestedTableDirtyCells: {}, // Track dirty state for nested tables by [row][col]
            searchValue: this.searchTerm || '', // Initialize with searchTerm prop
            sortColumn: null, // Current sort column key
            sortDirection: 'asc', // Current sort direction: 'asc' or 'desc'
            expandedRows: new Set(), // Track which rows are expanded for details
        };
    },
    watch: {
        // Watch for changes to searchTerm prop and update internal searchValue
        searchTerm(newValue) {
            this.searchValue = newValue || '';
        }
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
            // Hide columns listed in hideColumns prop and always hide 'AppData'
            return new Set([...(this.hideColumns || []), 'AppData']);
        },
        mainTableColumns() {
            // Filter out columns marked as details-only
            return this.columns.filter(column => !column.details);
        },
        detailsColumns() {
            // Get only columns marked for details display
            return this.columns.filter(column => column.details);
        },
        visibleRows() {
            // Filter rows based on search value and deletion status
            let filteredData = this.data
                .map((row, idx) => ({ row, idx }))
                .filter(({ row }) => !(row.AppData && row.AppData['marked-for-deletion']));

            // Apply search filter if searchValue is provided and hideRowsOnSearch is enabled
            if (this.searchValue && this.searchValue.trim() && this.hideRowsOnSearch) {
                const searchTerm = this.searchValue.toLowerCase().trim();
                filteredData = filteredData.filter(({ row }) => {
                    // Only search visible columns (exclude hidden columns)
                    const visibleColumns = this.columns.filter(column => !this.hideSet.has(column.key));
                    return visibleColumns.some(column => {
                        const value = row[column.key];
                        return String(value).toLowerCase().includes(searchTerm);
                    });
                });
            }

            // Apply sorting if sortColumn is set
            if (this.sortColumn && this.sortable) {
                filteredData.sort((a, b) => {
                    const aValue = a.row[this.sortColumn];
                    const bValue = b.row[this.sortColumn];
                    
                    // Handle null/undefined values
                    if (aValue === null || aValue === undefined) return 1;
                    if (bValue === null || bValue === undefined) return -1;
                    
                    // Determine if values are numbers
                    const aNum = parseFloat(aValue);
                    const bNum = parseFloat(bValue);
                    const isANum = !isNaN(aNum);
                    const isBNum = !isNaN(bNum);
                    
                    let comparison = 0;
                    
                    if (isANum && isBNum) {
                        // Both are numbers
                        comparison = aNum - bNum;
                    } else {
                        // String comparison
                        comparison = String(aValue).localeCompare(String(bValue));
                    }
                    
                    return this.sortDirection === 'desc' ? -comparison : comparison;
                });
            }

            return filteredData;
        },
        deletedRows() {
            // Show rows marked for deletion in tfoot
            return this.data
                .map((row, idx) => ({ row, idx }))
                .filter(({ row }) => row.AppData && row.AppData['marked-for-deletion']);
        }
    },
    watch: {
        allowSaveEvent(val) {
            // Emit to parent if dirty state changes
            this.$emit('inner-table-dirty', val);
        },
        data: {
            handler() {
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
        },
        visibleRows() {
            this.$nextTick(() => {
                this.updateAllEditableCells();
            });
        },
    },
    mounted() {
        this.$nextTick(() => {
            this.updateAllEditableCells();
            this.compareAllCellsDirty();
        });
        // Listen for mouseup globally to end drag
        window.addEventListener('mouseup', this.handleGlobalMouseUp);
        // Listen for dragend globally to ensure drag state is always cleared
        window.addEventListener('dragend', this.handleGlobalMouseUp);
        // Listen for clicks outside details area to close expanded details
        document.addEventListener('click', this.handleOutsideClick);
        // Listen for escape key to close expanded details
        document.addEventListener('keydown', this.handleEscapeKey);
    },
    beforeUnmount() {
        window.removeEventListener('mouseup', this.handleGlobalMouseUp);
        window.removeEventListener('dragend', this.handleGlobalMouseUp);
        document.removeEventListener('click', this.handleOutsideClick);
        document.removeEventListener('keydown', this.handleEscapeKey);
    },
    methods: {
        handleRefresh() {
            this.$emit('refresh');
            // Also clear dirty state for nested tables on refresh
            this.nestedTableDirtyCells = {};
        },

        handleSort(columnKey) {
            if (!this.sortable) return;
            
            if (this.sortColumn === columnKey) {
                // Toggle sort direction if same column
                this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                // New column, start with ascending
                this.sortColumn = columnKey;
                this.sortDirection = 'asc';
            }
        },

        getSortIcon(columnKey) {
            if (!this.sortable || this.sortColumn !== columnKey) return '';
            return this.sortDirection === 'asc' ? '↑' : '↓';
        },
        
        formatCellValue(value, column) {
            if (value === null || value === undefined) return '';
            
            // Apply column-specific formatting
            if (column.format) {
                switch (column.format) {
                    case 'currency':
                        return `$${parseFloat(value).toFixed(2)}`;
                    case 'date':
                        // If value is a string and does not contain a year (4 consecutive digits), skip formatting
                        if (typeof value === 'string' && !/\d{4}/.test(value)) {
                            return value;
                        }
                        // Use parseDate helper to handle all supported date formats
                        const parsedDate = parseDate(value);
                        return parsedDate ? parsedDate.toLocaleDateString() : value;
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

        highlightSearchText(value, column) {
            // First format the value
            const formattedValue = this.formatCellValue(value, column);
            
            // If no search value or empty formatted value, return as-is
            if (!this.searchValue || !this.searchValue.trim() || !formattedValue) {
                return formattedValue;
            }
            
            // Escape HTML in the formatted value to prevent XSS
            const escapedValue = String(formattedValue)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            
            // Escape the search term for regex
            const searchTerm = this.searchValue.trim();
            const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Create case-insensitive regex to find matches
            const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
            
            // Replace matches with highlighted version
            return escapedValue.replace(regex, '<span class="search-match">$1</span>');
        },

        // Check if a value contains the search text (for CSS-based highlighting in inputs)
        hasSearchMatch(value, column) {
            if (!this.searchValue || !this.searchValue.trim()) {
                return false;
            }
            
            const formattedValue = this.formatCellValue(value, column);
            if (!formattedValue) return false;
            
            const searchTerm = this.searchValue.trim().toLowerCase();
            return String(formattedValue).toLowerCase().includes(searchTerm);
        },

        // Get color class for date values based on proximity to today
        getDateColorClass(dateValue) {
            if (!dateValue) return '';
            
            // Parse the date using the parseDate helper to handle all supported formats
            let date;
            if (dateValue instanceof Date) {
                date = dateValue;
            } else {
                date = parseDate(dateValue);
            }
            
            // Check if date is valid
            if (!date || isNaN(date.getTime())) {
                return '';
            }
            
            // Get today's date at midnight for comparison
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Set the target date to midnight for fair comparison
            const targetDate = new Date(date);
            targetDate.setHours(0, 0, 0, 0);
            
            // Calculate difference in days
            const diffTime = targetDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            // Apply color based on proximity
            if (diffDays <= 2) {
                return 'red';  // Within 2 days (including past dates)
            } else if (diffDays <= 7) {
                return 'orange';  // Within 7 days
            }
            
            return '';  // No special coloring for dates more than 7 days away
        },
        
        getCellClass(value, column, rowIndex, colIndex) {
            let baseClass = '';
            // Centralized autoColor logic for number columns
            if (column.autoColor && column.format === 'number') {
                if (value == 0) baseClass = 'red';
                else if (value < 5) baseClass = 'orange';
            }
            // Centralized autoColor logic for date columns
            if (column.autoColor && column.format === 'date') {
                const cellClass = this.getDateColorClass(value);
                if (cellClass) baseClass = cellClass;
            }
            // Support function-based cell classes
            if (typeof column.cellClass === 'function') {
                // Pass the full row data if rowIndex is provided and valid
                if (typeof rowIndex === 'number' && this.data && this.data[rowIndex]) {
                    baseClass = column.cellClass(value, this.data[rowIndex]);
                } else {
                    baseClass = column.cellClass(value);
                }
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
                this.allowSaveEvent = this.data.some(row => row && row.AppData && row.AppData['marked-for-deletion']);
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
                this.data[this.dragIndex].AppData &&
                this.data[this.dragIndex].AppData['marked-for-deletion']
            ) {
                if (!this.data[this.dragIndex].AppData) this.data[this.dragIndex].AppData = {};
                this.data[this.dragIndex].AppData['marked-for-deletion'] = false;
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
                    if (globalDragRow && globalDragRow.AppData && globalDragRow.AppData['marked-for-deletion']) {
                        delete globalDragRow.AppData['marked-for-deletion'];
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
                this.data[this.dragIndex].AppData &&
                this.data[this.dragIndex].AppData['marked-for-deletion']
            ) {
                this.data[this.dragIndex].AppData['marked-for-deletion'] = false;
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
                !(this.data[this.dragIndex].AppData && this.data[this.dragIndex].AppData['marked-for-deletion'])
            ) {
                if (!this.data[this.dragIndex].AppData) this.data[this.dragIndex].AppData = {};
                this.data[this.dragIndex].AppData['marked-for-deletion'] = true;
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
        },
        
        toggleRowDetails(rowIndex) {
            if (this.expandedRows.has(rowIndex)) {
                this.expandedRows.delete(rowIndex);
            } else {
                this.expandedRows.add(rowIndex);
            }
        },
        
        isRowExpanded(rowIndex) {
            return this.expandedRows.has(rowIndex);
        },
        
        handleOutsideClick(event) {
            // Only proceed if there are expanded rows
            if (this.expandedRows.size === 0) return;
            
            // Check if the click is outside any details area
            const clickedElement = event.target;
            const detailsContainer = clickedElement.closest('.details-container');
            const detailsButton = clickedElement.closest('.details-toggle');
            
            // If click is not on a details button or inside a details container, close all expanded rows
            if (!detailsContainer && !detailsButton) {
                this.expandedRows.clear();
            }
        },
        
        handleEscapeKey(event) {
            // Close all expanded details when Escape is pressed
            if (event.key === 'Escape' && this.expandedRows.size > 0) {
                this.expandedRows.clear();
                event.preventDefault();
            }
        }
    },
    template: html `
        <div class="dynamic-table">
            <div :class="dragId ? 'drag-id-' + dragId : ''">
                <div class="content-header" v-if="showHeader && (title || showRefresh || showSearch)">
                    <!--h3 v-if="title">{{ title }}</h3-->
                    <slot 
                        name="table-header-area"
                    ></slot>
                    <div v-if="showSaveButton || showRefresh || hamburgerMenuComponent || showSearch" :class="{'button-bar': showSaveButton || showRefresh || showSearch}">
                        <input
                            v-if="showSearch"
                            type="text"
                            v-model="searchValue"
                            placeholder="Find..."
                            class="search-input"
                        />
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
                <div v-if="error" class="content-footer red">
                    <span>Error: {{ error }}</span>
                </div>
                
                <!-- Loading State -->
                <div v-if="isLoading" class="content-footer loading-message">
                    <img src="images/loading.gif" alt="..."/>
                    <p>{{ loadingMessage }}</p>
                </div>
                
                <!-- Empty State -->
                <div v-else-if="!data || data.length === 0" class="content-footer red">
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
                                    v-for="(column, colIdx) in mainTableColumns" 
                                    :key="column.key"
                                    :style="{ width: getColumnWidth(column) }"
                                    :class="[column.headerClass, hideSet.has(column.key) ? 'hide' : '']"
                                >
                                    <div>
                                        <span>{{ column.label }}</span>
                                        <button 
                                            v-if="sortable"
                                            @click="handleSort(column.key)"
                                            :class="'sort-button ' + (sortColumn === column.key ? 'active' : '')"
                                        >
                                            {{ getSortIcon(column.key) || '↕' }}
                                        </button>
                                    </div>
                                </th>
                                <th v-if="allowDetails" class="details-header" style="font-size: 20px; line-height: 1em;">&#9432;</th>
                            </tr>
                        </thead>
                        <tbody>
                            <template v-for="({ row, idx }, visibleIdx) in visibleRows" :key="idx">
                                <tr 
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
                                        v-for="(column, colIndex) in mainTableColumns" 
                                        :key="column.key"
                                        :class="[getCellClass(row[column.key], column, idx, colIndex), hideSet.has(column.key) ? 'hide' : '']"
                                    >
                                        <div class="table-cell-container">
                                            <!-- Editable number input -->
                                            <input
                                                v-if="column.editable && column.format === 'number'"    
                                                type="number"
                                                :value="row[column.key]"
                                                @input="handleCellEdit(idx, colIndex, $event.target.value)"
                                                :class="{ 'search-match': hasSearchMatch(row[column.key], column) }"
                                            />
                                            <!-- Editable text div -->
                                            <div
                                                v-else-if="column.editable"
                                                contenteditable="true"
                                                :data-row-index="idx"
                                                :data-col-index="colIndex"
                                                @input="handleCellEdit(idx, colIndex, $event.target.textContent)"
                                                class="table-edit-textarea"
                                                :class="{ 'search-match': hasSearchMatch(row[column.key], column) }"
                                                :ref="'editable_' + idx + '_' + colIndex"
                                            ></div>
                                            <!-- Non-editable content (slot) -->
                                            <slot 
                                                v-else 
                                                :row="row" 
                                                :rowIndex="idx" 
                                                :column="column"
                                                :cellRowIndex="idx"
                                                :cellColIndex="colIndex"
                                                :onInnerTableDirty="(isDirty) => handleInnerTableDirty(isDirty, idx, colIndex)"
                                            >
                                                <span v-html="highlightSearchText(row[column.key], column)"></span>
                                            </slot>
                                            
                                            <!-- Additional cell content slot (for warnings, etc.) -->
                                            <slot 
                                                name="cell-extra"
                                                :row="row" 
                                                :rowIndex="idx" 
                                                :column="column"
                                                :cellRowIndex="idx"
                                                :cellColIndex="colIndex"
                                                :isEditable="column.editable"
                                            ></slot>
                                        </div>
                                    </td>
                                    <td v-if="allowDetails" class="details-cell">
                                        <button 
                                            @click="toggleRowDetails(idx)"
                                            :class="'button-symbol details-toggle ' + (isRowExpanded(idx) ? 'expanded' : 'collapsed')"
                                        >
                                            {{ isRowExpanded(idx) ? '×' : '&#9432;' }}
                                        </button>
                                    </td>
                                </tr>
                                
                                <!-- Expandable details row with Vue transition -->
                                <tr v-if="allowDetails" class="details-row-container">
                                    <td v-if="draggable"></td>
                                    <td :colspan="mainTableColumns.length + (allowDetails ? 1 : 0)" class="details-container">
                                        
                                        <div v-if="isRowExpanded(idx)" class="details-content">
                                            <!-- Auto-generated details from columns marked with details: true -->
                                            <div v-if="detailsColumns.length > 0" class="auto-details">
                                                <div class="details-grid">
                                                    <div 
                                                        v-for="column in detailsColumns" 
                                                        :key="column.key"
                                                        class="detail-item"
                                                    >
                                                        <label>{{ column.label }}:</label>
                                                        <span>{{ formatCellValue(row[column.key], column) || '—' }}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <!-- Custom slot content -->
                                            <slot 
                                                name="row-details"
                                                :row="row" 
                                                :rowIndex="idx"
                                                :isExpanded="isRowExpanded(idx)"
                                                :detailsColumns="detailsColumns"
                                            >
                                                <!-- Fallback if no details columns and no custom slot -->
                                                <div v-if="detailsColumns.length === 0" class="default-details">
                                                    <h4>Row Details</h4>
                                                    <pre>{{ JSON.stringify(row, null, 2) }}</pre>
                                                </div>
                                            </slot>
                                        </div>
                                    </td>
                                </tr>
                            </template>
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
                                    v-for="(column, colIndex) in mainTableColumns" 
                                    :key="column.key"
                                    :class="[getCellClass(row[column.key], column, idx, colIndex), hideSet.has(column.key) ? 'hide' : '']"
                                >
                                    <div class="table-cell-container">
                                        <!-- Editable number input -->
                                        <input
                                            v-if="column.editable && column.format === 'number'"    
                                            type="number"
                                            :value="row[column.key]"
                                            @input="handleCellEdit(idx, colIndex, $event.target.value)"
                                            :class="{ 'search-match': hasSearchMatch(row[column.key], column) }"
                                        />
                                        <!-- Editable text div -->
                                        <div
                                            v-else-if="column.editable"
                                            contenteditable="true"
                                            :data-row-index="idx"
                                            :data-col-index="colIndex"
                                            @input="handleCellEdit(idx, colIndex, $event.target.textContent)"
                                            class="table-edit-textarea"
                                            :class="{ 'search-match': hasSearchMatch(row[column.key], column) }"
                                            :ref="'editable_' + idx + '_' + colIndex"
                                        ></div>
                                        <!-- Non-editable content -->
                                        <slot v-else :row="row" :rowIndex="idx" :column="column">
                                            {{ formatCellValue(row[column.key], column) }}
                                        </slot>
                                        
                                        <!-- Additional cell content slot (for warnings, etc.) -->
                                        <slot 
                                            name="cell-extra"
                                            :row="row" 
                                            :rowIndex="idx" 
                                            :column="column"
                                            :cellRowIndex="idx"
                                            :cellColIndex="colIndex"
                                            :isEditable="column.editable"
                                        ></slot>
                                    </div>
                                </td>
                                <td v-if="allowDetails" class="details-cell"></td>
                            </tr>
                            <tr>
                                <td v-if="draggable" class="spacer-cell"></td>
                                <td 
                                    :colspan="(draggable ? 1 : 0) + mainTableColumns.length + (allowDetails ? 1 : 0)" 
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
                    <p v-if="visibleRows.length < data.length">Showing {{ visibleRows.length }} of {{ data.length }} item{{ data.length !== 1 ? 's' : '' }}</p>
                    <p v-else>Found {{ data.length }} item{{ data.length !== 1 ? 's' : '' }}</p>
                </div>
            </div>
        </div>
    `
};

export default TableComponent;