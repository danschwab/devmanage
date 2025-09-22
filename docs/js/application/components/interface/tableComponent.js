import { html, parseDate } from '../../index.js';

// Global table row selection state - single source of truth for all selections
export const tableRowSelectionState = Vue.reactive({
    // Single selection set with array references
    selections: new Map(), // Map of rowIndex -> { sourceArray: arrayRef, dragId: dragId }
    
    // Drag state
    isDragging: false,
    dragSourceArray: null,
    dragTargetArray: null,
    dragId: null, // The dragId of the table group participating in drag operations
    currentDropTarget: null, // Current registered drop target from tables
    
    // Add a row to global selection
    addRow(rowIndex, sourceArray, dragId = null) {
        this.selections.set(rowIndex, {
            sourceArray: sourceArray,
            dragId: dragId
        });
    },
    
    // Remove a row from global selection
    removeRow(rowIndex) {
        this.selections.delete(rowIndex);
    },
    
    // Toggle row selection
    toggleRow(rowIndex, sourceArray, dragId = null) {
        if (this.selections.has(rowIndex)) {
            this.selections.delete(rowIndex);
        } else {
            this.selections.set(rowIndex, {
                sourceArray: sourceArray,
                dragId: dragId
            });
        }
    },
    
    // Check if a row is selected (by checking if any selection has this index in its source array)
    hasRow(sourceArray, rowIndex) {
        for (const [selectedRowIndex, selection] of this.selections) {
            if (selection.sourceArray === sourceArray && selectedRowIndex === rowIndex) {
                return true;
            }
        }
        return false;
    },
    
    // Clear all selections
    clearAll() {
        this.selections.clear();
    },
    
    // Clear selections from a specific array
    clearArray(sourceArray) {
        for (const [rowIndex, selection] of this.selections) {
            if (selection.sourceArray === sourceArray) {
                this.selections.delete(rowIndex);
            }
        }
    },
    
    // Get selection count for a specific array
    getArraySelectionCount(sourceArray) {
        let count = 0;
        for (const selection of this.selections.values()) {
            if (selection.sourceArray === sourceArray) {
                count++;
            }
        }
        return count;
    },
    
    // Get total selection count
    getTotalSelectionCount() {
        return this.selections.size;
    },
    
    // Get all selected row indices for a specific array
    getSelectedRowIndices(sourceArray) {
        const indices = [];
        for (const [rowIndex, selection] of this.selections) {
            if (selection.sourceArray === sourceArray) {
                indices.push(rowIndex);
            }
        }
        return indices;
    },
    
    // Get all selected row data for a specific array
    getSelectedRowData(sourceArray) {
        const data = [];
        for (const [rowIndex, selection] of this.selections) {
            if (selection.sourceArray === sourceArray) {
                data.push(sourceArray[rowIndex]);
            }
        }
        return data;
    },
    
    // Get all selected rows (index + data) for a specific array
    getSelectedRows(sourceArray) {
        const rows = [];
        for (const [rowIndex, selection] of this.selections) {
            if (selection.sourceArray === sourceArray) {
                rows.push({
                    index: rowIndex,
                    data: sourceArray[rowIndex]
                });
            }
        }
        return rows;
    },
    
    // Drag management methods
    startDrag() {
        if (this.selections.size === 0) return false;
        
        this.isDragging = true;
        // Get source array and dragId from first selection (all selections should be from same table group when dragging)
        const firstSelection = this.selections.values().next().value;
        this.dragSourceArray = firstSelection.sourceArray;
        this.dragId = firstSelection.dragId;
        this.currentDropTarget = null;
        
        // Set up global mouse up listener with proper binding
        this.handleGlobalMouseUp = this.handleGlobalMouseUp.bind(this);
        document.addEventListener('mouseup', this.handleGlobalMouseUp);
        return true;
    },
    
    // Set target array during drag
    setDragTarget(targetArray) {
        if (this.isDragging) {
            this.dragTargetArray = targetArray;
        }
    },
    
    // Register drop target from a table
    registerDropTarget(tableData, dropTarget) {
        if (this.isDragging && this.dragTargetArray === tableData) {
            this.currentDropTarget = dropTarget;
        }
    },
    
    // Clear drop target registration
    clearDropTargetRegistration(tableData) {
        if (this.dragTargetArray === tableData) {
            this.currentDropTarget = null;
        }
    },
    
    
    // Global mouse up handler for drag operations
    handleGlobalMouseUp(event) {
        if (!this.isDragging) return;
        
        console.log('Global drag completion - dragTargetArray:', !!this.dragTargetArray, 'currentDropTarget:', this.currentDropTarget);
        
        // Check if we have a valid drop target
        if (this.dragTargetArray && this.currentDropTarget && this.currentDropTarget.type) {
            const result = this.completeDrag(this.currentDropTarget);
            console.log('Global completeDrag result:', result);
        } else {
            // No valid drop target, cancel the drag
            console.log('Global cancelling drag - no valid drop target');
            this.stopDrag();
        }
    },
    
    completeDrag(dropTarget) {
        console.log('completeDrag called with:', dropTarget, 'isDragging:', this.isDragging, 'selections:', this.selections.size, 'dragTargetArray:', this.dragTargetArray);
        if (!this.isDragging || this.selections.size === 0 || !this.dragTargetArray) {
            console.log('completeDrag early exit - conditions not met');
            this.stopDrag();
            return false;
        }
        
        // Get selected rows sorted by index (highest first for removal)
        const selectedRows = Array.from(this.selections.entries())
            .filter(([, selection]) => selection.sourceArray === this.dragSourceArray)
            .sort(([a], [b]) => b - a);
        
        if (selectedRows.length === 0) {
            this.stopDrag();
            return false;
        }
        
        // Calculate insertion position
        let insertPosition;
        console.log('dropTarget.type:', dropTarget.type);
        if (dropTarget.type === 'header') {
            insertPosition = 0;
        } else if (dropTarget.type === 'footer') {
            insertPosition = this.dragTargetArray.length;
        } else if (dropTarget.type === 'between') {
            insertPosition = dropTarget.targetIndex;
        } else {
            console.log('Invalid dropTarget.type:', dropTarget.type);
            this.stopDrag();
            return false;
        }
        
        if (this.dragSourceArray === this.dragTargetArray) {
            // Same array: reorder rows
            console.log('Same array reorder - insertPosition:', insertPosition);
            const rowsData = selectedRows.map(([index]) => this.dragSourceArray[index]);
            
            // Remove rows (in reverse order to maintain indices)
            selectedRows.forEach(([index]) => {
                this.dragSourceArray.splice(index, 1);
                // Adjust insertion position if we removed rows before it
                if (index < insertPosition) {
                    insertPosition--;
                }
            });
            
            // Insert at new position
            this.dragSourceArray.splice(insertPosition, 0, ...rowsData);
        } else {
            // Different arrays: move rows
            console.log('Different arrays move - from:', this.dragSourceArray.length, 'to:', this.dragTargetArray.length, 'insertPosition:', insertPosition);
            const rowsData = selectedRows.map(([index]) => this.dragSourceArray[index]);
            
            // Remove from source array (in reverse order to maintain indices)
            selectedRows.forEach(([index]) => this.dragSourceArray.splice(index, 1));
            
            // Insert into target array
            this.dragTargetArray.splice(insertPosition, 0, ...rowsData);
            console.log('After move - from:', this.dragSourceArray.length, 'to:', this.dragTargetArray.length);
        }
        
        // Clear selection and drag state
        this.clearAll();
        this.stopDrag();
        return true;
    },
    
    stopDrag() {
        this.isDragging = false;
        this.dragSourceArray = null;
        this.dragTargetArray = null;
        this.dragId = null;
        this.currentDropTarget = null;
        
        // Remove global mouse up listener
        document.removeEventListener('mouseup', this.handleGlobalMouseUp);
    }
});

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
    emits: ['refresh', 'cell-edit', 'new-row', 'inner-table-dirty', 'show-hamburger-menu', 'search'],
    data() {
        return {
            dirtyCells: {},
            allowSaveEvent: false,
            rowsMarkedForDeletion: new Set(), // Track indices of rows marked for deletion
            nestedTableDirtyCells: {}, // Track dirty state for nested tables by [row][col]
            searchValue: this.searchTerm || '', // Initialize with searchTerm prop
            sortColumn: null, // Current sort column key
            sortDirection: 'asc', // Current sort direction: 'asc' or 'desc'
            expandedRows: new Set(), // Track which rows are expanded for details
            clickState: {
                isMouseDown: false,
                startRowIndex: null,
                startTime: null,
                startX: null,
                startY: null,
                longClickTimer: null,
                hasMoved: false
            },
            dropTarget: {
                type: null, // 'between-rows', 'header', 'footer'
                position: null, // row index for between-rows, null for header/footer
                isAbove: false // for between-rows, whether drop is above the row
            },
            isMouseInTable: false,
            lastKnownMouseX: null,
            lastKnownMouseY: null,
            mouseMoveCounter: 0
        };
    },
    watch: {
        // Watch for changes to searchTerm prop and update internal searchValue
        searchTerm(newValue) {
            this.searchValue = newValue || '';
        }
    },
    computed: {
        selectedRowCount() {
            return tableRowSelectionState.getArraySelectionCount(this.data);
        },
        isDragSource() {
            return tableRowSelectionState.isDragging && 
                   tableRowSelectionState.dragSourceArray === this.data;
        },
        canAcceptDrop() {
            return tableRowSelectionState.isDragging && 
                   this.draggable && 
                   tableRowSelectionState.dragId === this.dragId;
        },
        showSaveButton() {
            // True if any editable cell or add row button is present
            const hasEditable = this.columns.some(col => col.editable);
            const hasAddRow = !!this.newRow;
            return hasEditable || hasAddRow;
        },
        hasEditableColumns() {
            // True if any column is editable
            return this.columns.some(col => col.editable);
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
        // Listen for clicks outside details area to close expanded details
        document.addEventListener('click', this.handleOutsideClick);
        // Listen for escape key to close expanded details
        document.addEventListener('keydown', this.handleEscapeKey);
    },
    beforeUnmount() {
        document.removeEventListener('click', this.handleOutsideClick);
        document.removeEventListener('keydown', this.handleEscapeKey);
        // Clean up any active click state
        this.resetClickState();
    },
    methods: {
        handleRefresh() {
            this.$emit('refresh');
            // Also clear dirty state for nested tables on refresh
            this.nestedTableDirtyCells = {};
        },

        // Selection helper methods
        isRowSelected(rowIndex) {
            return tableRowSelectionState.hasRow(this.data, rowIndex);
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
        handleHamburgerMenu() {
            // Emit event to parent to show hamburger menu
            this.$emit('show-hamburger-menu', {
                menuComponent: this.hamburgerMenuComponent,
                tableId: this.title || 'table'
            });
        },
        handleDragHandleMouseDown(rowIndex, event) {
            // Only respond to left mouse button
            if (event.button !== 0) return;
            
            // Ensure this is a drag handle
            if (!event.target.classList.contains('row-drag-handle')) return;
            
            this.clickState.isMouseDown = true;
            this.clickState.startRowIndex = rowIndex;
            this.clickState.startTime = Date.now();
            this.clickState.startX = event.clientX;
            this.clickState.startY = event.clientY;
            this.clickState.hasMoved = false;
            
            // Set up long click timer (800ms)
            this.clickState.longClickTimer = setTimeout(() => {
                if (this.clickState.isMouseDown && !this.clickState.hasMoved) {
                    // Long click: add row to selection
                    tableRowSelectionState.addRow(rowIndex, this.data, this.dragId);
                    this.clickState.longClickTimer = null;
                }
            }, 800);
            
            // Add global mouse move and up listeners
            document.addEventListener('mousemove', this.handleGlobalMouseMove);
            document.addEventListener('mouseup', this.handleGlobalMouseUp);
            
            // Prevent text selection
            event.preventDefault();
        },
        handleGlobalMouseMove(event) {
            if (!this.clickState.isMouseDown) return;
            
            const deltaX = Math.abs(event.clientX - this.clickState.startX);
            const deltaY = Math.abs(event.clientY - this.clickState.startY);
            const moveDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            // If moved more than 8 pixels
            if (moveDistance > 8 && !this.clickState.hasMoved) {
                this.clickState.hasMoved = true;
                
                // Cancel long click timer
                if (this.clickState.longClickTimer) {
                    clearTimeout(this.clickState.longClickTimer);
                    this.clickState.longClickTimer = null;
                }
                
                // If dragged row is not in selection, replace entire selection with this row
                if (!tableRowSelectionState.hasRow(this.data, this.clickState.startRowIndex)) {
                    tableRowSelectionState.clearAll();
                    tableRowSelectionState.addRow(this.clickState.startRowIndex, this.data, this.dragId);
                }
                
                // Start drag if table is draggable and we have selections
                if (this.draggable && tableRowSelectionState.getTotalSelectionCount() > 0) {
                    tableRowSelectionState.startDrag();
                }
            }
        },
        handleGlobalMouseUp(event) {
            if (!this.clickState.isMouseDown) return;
            
            // Handle drag completion is now managed by global state
            // Tables only handle their own cleanup during drag operations
            if (tableRowSelectionState.isDragging) {
                // Clear local drop target after drag completion
                this.clearDropTarget();
                
                // Clean up and exit early - don't process click logic when dragging
                this.resetClickState();
                return;
            }
            
            // Check if mouse up is on the same drag handle that started the interaction
            const targetHandle = event.target.closest('.row-drag-handle');
            const startHandle = document.elementFromPoint(this.clickState.startX, this.clickState.startY);
            
            // Only process click logic if mouse up is on the same handle (or close enough)
            if (targetHandle && startHandle && targetHandle === startHandle) {
                // Clear long click timer
                if (this.clickState.longClickTimer) {
                    clearTimeout(this.clickState.longClickTimer);
                    this.clickState.longClickTimer = null;
                }
                
                // Short click logic (only if no movement occurred)
                if (!this.clickState.hasMoved) {
                    const clickDuration = Date.now() - this.clickState.startTime;
                    
                    // Short click (less than 800ms and no movement)
                    if (clickDuration < 800) {
                        if (tableRowSelectionState.getTotalSelectionCount() > 0) {
                            // Toggle selection state of clicked row
                            tableRowSelectionState.toggleRow(this.clickState.startRowIndex, this.data, this.dragId);
                        }
                    }
                }
            }
            
            // Clean up
            this.resetClickState();
        },
        resetClickState() {
            if (this.clickState.longClickTimer) {
                clearTimeout(this.clickState.longClickTimer);
                this.clickState.longClickTimer = null;
            }
            
            this.clickState.isMouseDown = false;
            this.clickState.startRowIndex = null;
            this.clickState.startTime = null;
            this.clickState.startX = null;
            this.clickState.startY = null;
            this.clickState.hasMoved = false;
            
            // Remove global listeners
            document.removeEventListener('mousemove', this.handleGlobalMouseMove);
            document.removeEventListener('mouseup', this.handleGlobalMouseUp);
        },
        handleTableMouseEnter() {
            this.isMouseInTable = true;
            this.mouseMoveCounter = 0; // Reset counter when entering table
        },
        handleTableMouseLeave() {
            this.isMouseInTable = false;
            // Always clear drop target when leaving table
            this.clearDropTarget();
            this.lastKnownMouseX = null;
            this.lastKnownMouseY = null;
            this.mouseMoveCounter = 0; // Reset counter when leaving table
        },
        findDropTargetAtCursor() {
            // Use stored mouse position if available
            if (this.lastKnownMouseX === null || this.lastKnownMouseY === null) {
                return; // No mouse position available
            }
            
            let mouseX = this.lastKnownMouseX;
            let mouseY = this.lastKnownMouseY;
            if (this.lastKnownMouseX !== undefined && this.lastKnownMouseY !== undefined) {
                mouseX = this.lastKnownMouseX;
                mouseY = this.lastKnownMouseY;
            }
            
            // Find the table element
            const tableEl = this.$el.querySelector('table');
            if (!tableEl) return;
            
            const tableRect = tableEl.getBoundingClientRect();
            
            // Check if mouse is within table bounds
            if (mouseY < tableRect.top || mouseY > tableRect.bottom) {
                // Only clear if we're not in an active drag operation
                if (!tableRowSelectionState.isDragging) {
                    this.clearDropTarget();
                }
                return;
            }
            
            // Find thead, tbody, and tfoot elements
            const thead = tableEl.querySelector('thead');
            const tbody = tableEl.querySelector('tbody');
            const tfoot = tableEl.querySelector('tfoot');
            
            let newDropTarget = { type: null, position: null, isAbove: false };
            
            // Check header drop target
            if (thead) {
                const theadRect = thead.getBoundingClientRect();
                if (mouseY >= theadRect.top && mouseY <= theadRect.bottom) {
                    newDropTarget = { type: 'header', position: null, isAbove: false };
                }
            }
            
            // Check footer drop target
            if (tfoot && newDropTarget.type === null) {
                const tfootRect = tfoot.getBoundingClientRect();
                if (mouseY >= tfootRect.top && mouseY <= tfootRect.bottom) {
                    newDropTarget = { type: 'footer', position: null, isAbove: false };
                }
            }
            
            // Check between rows in tbody
            if (tbody && newDropTarget.type === null) {
                const rows = tbody.querySelectorAll('tr');
                
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const rowRect = row.getBoundingClientRect();
                    
                    if (mouseY >= rowRect.top && mouseY <= rowRect.bottom) {
                        const midpoint = rowRect.top + rowRect.height / 2;
                        const isAbove = mouseY < midpoint;
                        
                        newDropTarget = {
                            type: 'between',
                            targetIndex: isAbove ? i : i + 1
                        };
                        console.log('Drop target found:', newDropTarget, 'mouseY:', mouseY, 'rowRect:', rowRect);
                        break;
                    }
                }
            }
            
            // Update drop target if changed
            if (this.dropTarget.type !== newDropTarget.type ||
                this.dropTarget.targetIndex !== newDropTarget.targetIndex) {
                
                this.dropTarget = newDropTarget;
                
                // Register the new drop target with global state
                if (this.dropTarget.type) {
                    tableRowSelectionState.registerDropTarget(this.data, this.dropTarget);
                }
            }
        },
        clearDropTarget() {
            this.dropTarget = { type: null, position: null, isAbove: false };
        },
        handleTableMouseMove(event) {
            // Store last known mouse position for drop target detection
            const newX = event.clientX;
            const newY = event.clientY;
            
            // Only increment counter if mouse has actually moved
            if (this.lastKnownMouseX !== newX || this.lastKnownMouseY !== newY) {
                this.lastKnownMouseX = newX;
                this.lastKnownMouseY = newY;
                // Increment counter and check if it's the 6th move
                this.mouseMoveCounter++;
                if (this.mouseMoveCounter >= 6) {
                
                    // Only detect drop targets if dragging is active and this table can receive drops
                    if (tableRowSelectionState.isDragging && this.draggable && tableRowSelectionState.dragId == this.dragId) {
                        // Set this table as potential drag target
                        tableRowSelectionState.setDragTarget(this.data);
                    
                        this.mouseMoveCounter = 0; // Reset counter
                        this.findDropTargetAtCursor();
                    }
                }
            }
        },
        getDropTargetClass(rowIndex, position) {
            if (this.dropTarget.type !== 'between-rows') return '';
            if (this.dropTarget.position !== rowIndex) return '';
            
            if (position === 'top' && this.dropTarget.isAbove) {
                return 'drop-target-above';
            } else if (position === 'bottom' && !this.dropTarget.isAbove) {
                return 'drop-target-below';
            }
            return '';
        },
        getHeaderDropTargetClass() {
            return this.dropTarget.type === 'header' ? 'drop-target-header' : '';
        },
        getFooterDropTargetClass() {
            return this.dropTarget.type === 'footer' ? 'drop-target-footer' : '';
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
            const clickedElement = event.target;
            
            // Handle clearing selection when clicking outside drag handles
            if (tableRowSelectionState.getTotalSelectionCount() > 0) {
                const dragHandle = clickedElement.closest('.row-drag-handle');
                
                // If click is not on a drag handle, clear selection
                if (!dragHandle) {
                    tableRowSelectionState.clearAll();
                }
            }
            
            // Handle closing expanded details (existing functionality)
            if (this.expandedRows.size === 0) return;
            
            // Check if the click is outside any details area
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
        <div class="dynamic-table"
            :class="{
                'drag-source': isDragSource,
                'drag-target': canAcceptDrop
            }"
            @mouseenter="handleTableMouseEnter"
            @mouseleave="handleTableMouseLeave"
            @mousemove="handleTableMouseMove"
        >
            <div class="table-container">
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
                    <table :class="{ editing: hasEditableColumns }">
                        <thead :class="{ 'drop-target-header': dropTarget?.type === 'header' }">
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
                                        'dragging': false,
                                        'drag-over': false,
                                        'selected': isRowSelected(idx),
                                        'drop-target-above': dropTarget?.type === 'between' && dropTarget?.targetIndex === visibleIdx,
                                        'drop-target-below': dropTarget?.type === 'between' && dropTarget?.targetIndex === visibleIdx + 1
                                    }"
                                >
                                    <td v-if="draggable"
                                        class="row-drag-handle"
                                        draggable="true"
                                        @mousedown="handleDragHandleMouseDown(idx, $event)"
                                    ></td>
                                    <td 
                                        v-for="(column, colIndex) in mainTableColumns" 
                                        :key="column.key"
                                        :style="{ width: getColumnWidth(column) }"
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
                        <tfoot v-if="newRow" :class="{ 'drop-target-footer': dropTarget?.type === 'footer' }">
                            <tr v-for="({ row, idx }, delIdx) in deletedRows"
                                :key="'del-' + idx"
                                :class="{
                                    'marked-for-deletion': true,
                                    'selected': isRowSelected(idx)
                                }"
                            >
                                <td v-if="draggable"
                                    class="row-drag-handle"
                                    draggable="true"
                                    @mousedown="handleDragHandleMouseDown(idx, $event)"
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
                                    @click="$emit('new-row')"
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