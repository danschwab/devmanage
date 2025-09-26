import { html, TableComponent, Requests, getReactiveStore, tableRowSelectionState } from '../../index.js';
import { ItemImageComponent } from './InventoryTable.js';

// Use getReactiveStore for packlist table data
export const PacklistTable = {
    components: { TableComponent, ItemImageComponent },
    inject: {
        navigationParameters: { 
            from: 'navigationParameters', 
            default: () => () => ({}) 
        }
    },
    props: {
        content: { type: Object, required: false, default: () => ({}) },
        tabName: { type: String, default: '' },
        sheetId: { type: String, default: '' },
        showDetailsOnly: { type: Boolean, default: false },
        editMode: { type: Boolean, default: false }
    },
    data() {
        return {
            packlistTableStore: null,
            saveDisabled: true,
            dirty: false,
            moved: false,
            isPrinting: false,
            dirtyCrateRows: {},
            error: null,
            itemQuantityStatus: {}, // Store item quantity analysis results
            analyzingQuantities: false,
            // Store headers fetched from database (will be populated on mount)
            databaseItemHeaders: null,
            hiddenColumns: ['Pack','Check']
        };
    },
    computed: {
        mainHeaders() {
            // Use headers from the first crate if available, else use default schema
            const crates = this.mainTableData;
            if (crates.length > 0 && Object.keys(crates[0]).length > 0) {
                return [...Object.keys(crates[0]), ...this.itemHeaders].filter(k => k !== 'Items').filter(k => !this.hiddenColumns.includes(k));
            }
            // Fallback to content headers if present
            if (this.content && this.content.length > 0 && Object.keys(this.content[0]).length > 0) {
                const headers = Object.keys(this.content[0]).filter(k => k !== 'Items');
                return [...headers, ...this.itemHeaders].filter(k => !this.hiddenColumns.includes(k));
            }
            // Default schema when no data is available
            return ['Piece #', 'Type', 'L', 'W', 'H', 'Weight', 'Pack', 'Check', 'Description', 'Packing/shop notes'];
        },
        mainColumns() {
            return this.mainHeaders.map((label, idx) => {
                if (label === 'Piece #') {
                    return { key: label, label, editable: false, isIndex: true, width: 10};
                }
                // Only make columns editable if editMode is true
                const isEditable = this.editMode && ['Type','L','W','H','Weight'].includes(label);
                
                // When not in edit mode, move Type, L, W, H, Weight to details
                //const isDetailsColumn = !this.editMode && ['Type','L','W','H','Weight'].includes(label);

                if (label === this.itemHeadersStart) {
                    return {
                        key: label,
                        label,
                        width: ['Description','Packing/shop notes'].includes(label) ? 300 : 30,
                        colspan: this.itemHeaders.length,
                        font: ['Pack','Check'].includes(label) ? 'narrow' : undefined
                    };
                } else {
                    return {
                        key: label,
                        label,
                        editable: isEditable,
                        details: null,
                        width: ['Description', 'Packing/shop notes'].includes(label) ? 300 : 30,
                        font: ['Pack','Check'].includes(label) ? 'narrow' : undefined
                    };
                };
            });
        },
        mainTableData() {
            // Use the reactive array directly from the store
            if (this.packlistTableStore && Array.isArray(this.packlistTableStore.data)) {
                return this.packlistTableStore.data;
            }
            return [];
        },
        originalData() {
            if (this.packlistTableStore && Array.isArray(this.packlistTableStore.originalData)) {
                return JSON.parse(JSON.stringify(this.packlistTableStore.originalData));
            }
            return [];
        },
        itemHeaders() {
            // Try to infer item headers from the first crate's Items array
            const crates = this.mainTableData;
            if (crates.length > 0 && Array.isArray(crates[0].Items) && crates[0].Items.length > 0) {
                return Object.keys(crates[0].Items[0]);
            }
            // fallback to content
            if (this.content && this.content.length > 0 && Array.isArray(this.content[0].Items) && this.content[0].Items.length > 0) {
                return Object.keys(this.content[0].Items[0]);
            }
            // Use database headers if available, otherwise use default schema
            return this.databaseItemHeaders || ['Pack', 'Check', 'Description', 'Packing/shop notes'];
        },
        itemHeadersStart() {
            return this.itemHeaders.filter(k => !this.hiddenColumns.includes(k))[0];
        },
        isLoading() {
            return this.packlistTableStore ? this.packlistTableStore.isLoading : false;
        },
        isDetailsLoading() {
            // Details view should be loading when main table is loading OR when analyzing quantities
            return this.isLoading || this.analyzingQuantities;
        },
        loadingMessage() {
            return this.packlistTableStore ? (this.packlistTableStore.loadingMessage || 'Loading data...') : 'Loading data...';
        },
        detailsLoadingMessage() {
            // Show appropriate loading message for details view
            if (this.analyzingQuantities) {
                return 'Analyzing item quantities...';
            }
            return this.loadingMessage;
        },
        itemWarningDetails() {
            // Extract all item data from AppData and aggregate by item ID
            const itemAggregation = {};
            
            if (!this.mainTableData || !Array.isArray(this.mainTableData)) {
                return [];
            }
            
            this.mainTableData.forEach((crate, crateIndex) => {
                if (crate && crate.Items && Array.isArray(crate.Items)) {
                    crate.Items.forEach((item, itemIndex) => {
                        if (item && item.AppData && Array.isArray(item.AppData.items)) {
                            item.AppData.items.forEach(itemData => {
                                if (!itemData) return;
                                const itemId = itemData.itemId;
                                
                                if (!itemAggregation[itemId]) {
                                    // First occurrence of this item - initialize
                                    itemAggregation[itemId] = {
                                        'Item ID': itemId,
                                        'Quantity': itemData.quantity,
                                        'Available': itemData.quantityInfo?.inventory || 'N/A',
                                        'Remaining': itemData.quantityInfo?.remaining || 'N/A',
                                        'Warning Message': itemData.warning?.message?.replace(/<[^>]*>/g, '') || '', // Strip HTML
                                        'Overlapping Shows': itemData.quantityInfo?.overlapping || [], // Store array of show identifiers
                                        'Has Warning': !!itemData.warning,
                                        // Use the quantityInfo from API which already accounts for total quantities
                                        quantityInfo: itemData.quantityInfo
                                    };
                                } else {
                                    // Item already exists - aggregate quantity but keep the API quantityInfo
                                    // (since API already calculated based on total quantities across all crates)
                                    itemAggregation[itemId]['Quantity'] += itemData.quantity;
                                    
                                    // Keep the most severe warning
                                    if (itemData.warning && !itemAggregation[itemId]['Has Warning']) {
                                        itemAggregation[itemId]['Warning Message'] = itemData.warning.message?.replace(/<[^>]*>/g, '') || '';
                                        itemAggregation[itemId]['Has Warning'] = true;
                                    }
                                }
                            });
                        }
                    });
                }
            });
            
            // Convert aggregation object to array
            return Object.values(itemAggregation);
        },
        detailsTableColumns() {
            // Define columns for the comprehensive details table - only show specified columns
            return [
                { 
                    key: 'image', 
                    label: 'IMG',
                    width: 1,
                    editable: false
                },
                { key: 'Item ID', label: 'Item#', editable: false },
                { key: 'Quantity', label: 'Quantity', editable: false, format: 'number' },
                { key: 'Available', label: 'Inv. Qty.', editable: false, format: 'number' },
                { key: 'Remaining', label: 'Remaining', editable: false, format: 'number', 
                  cellClass: (value, row) => {
                    // Safety checks for row parameter
                    if (!row || typeof row !== 'object') return '';
                    
                    // Only apply warning colors if there's actually a warning
                    if (!row['Has Warning']) return '';
                    if (typeof value === 'number') {
                      return value < 0 ? 'red' : value === 0 ? 'orange' : '';
                    }
                    return '';
                  }
                },
                { key: 'Warning Message', label: 'Message', editable: false },
                { key: 'Overlapping Shows', label: 'Overlapping Shows', editable: false }
            ];
        },
        warningCount() {
            // Count only items with warnings for button display
            return this.itemWarningDetails.filter(item => item['Has Warning']).length;
        },
        // Navigation-based parameters from injection
        navParams() {
            return typeof this.navigationParameters === 'function' 
                ? this.navigationParameters() 
                : this.navigationParameters || {};
        },
        searchTerm() {
            return this.navParams.searchTerm || '';
        },
        hideRowsOnSearch() {
            return this.navParams.hideRowsOnSearch !== false;
        }
    },
    watch: {
        // Watch for navigation parameter changes
        'navParams.searchTerm'(newSearchTerm) {
            console.log('[PacklistTable] Search term changed:', newSearchTerm);
        }
    },
    async mounted() {
        // Initialize store if tabName is available
        if (this.tabName) {
            this.initializeStore();
        }

        // Watch for tabName changes to handle direct URL navigation
        this.$watch('tabName', (newTabName) => {
            if (newTabName && !this.packlistTableStore) {
                this.initializeStore();
            }
        }, { immediate: true });

        // Analyze quantities when data loads
        this.$watch(() => this.mainTableData, () => {
            if (this.mainTableData.length > 0 && this.tabName) {
                this.analyzePacklistQuantities();
            }
        }, { immediate: true });
    },
    methods: {
        initializeStore() {
            if (!this.tabName) return;
            
            // Pass Requests.savePackList as the save function
            this.packlistTableStore = getReactiveStore(
                Requests.getPackList,
                Requests.savePackList,
                [this.tabName]
            );
            this.error = this.packlistTableStore.error;

            if (!this.packlistTableStore.isLoading) {
                this.analyzePacklistQuantities();
            }
            
            // Load database headers
            this.loadItemHeaders();
        },
        async loadItemHeaders() {
            if (!this.tabName) return;
            try {
                this.databaseItemHeaders = await Requests.getItemHeaders(this.tabName);
            } catch (error) {
                console.warn('Failed to load item headers from database:', error);
                this.databaseItemHeaders = ['Item ID', 'Quantity', 'Available', 'Remaining', 'Status', 'Has Warning'];
            }
        },
        async handleRefresh() {
            if (this.packlistTableStore) {
                await this.packlistTableStore.load('Reloading packlist...');
            }
        },
        handleCellEdit(rowIdx, colIdx, value, type = 'main') {
            this.dirty = true;
            this.saveDisabled = false;
            if (type === 'main') {
                const colKey = this.mainColumns[colIdx]?.key;
                if (colKey && this.mainTableData[rowIdx]) {
                    this.mainTableData[rowIdx][colKey] = value;
                }
            }
        },
        handleAddCrate() {
            const headers = this.mainHeaders.filter(h => h !== 'Items');
            const infoObj = {};
            headers.forEach(label => {
                infoObj[label] = '';
            });
            infoObj['Piece #'] = this.mainTableData.length + 1;
            // Use the store's addRow to ensure reactivity and correct initialization
            if (this.packlistTableStore && typeof this.packlistTableStore.addRow === 'function') {
                this.packlistTableStore.addRow({
                    ...infoObj,
                    Items: []
                });
            }
            this.dirty = true;
            this.saveDisabled = false;
        },
        handleAddItem(crateIdx) {
            const itemHeaders = this.itemHeaders;
            const itemObj = {};
            itemHeaders.forEach(label => {
                itemObj[label] = '';
            });
            // Use the store's addNestedRow to ensure reactivity and correct initialization
            if (
                this.packlistTableStore &&
                typeof this.packlistTableStore.addNestedRow === 'function'
            ) {
                this.packlistTableStore.addNestedRow(crateIdx, 'Items', itemObj);
            }
            this.dirty = true;
            this.saveDisabled = false;
        },
        async handleSave() {
            // Only use the store's save method if this is called from the on-save event
            if (this.packlistTableStore) {
                await this.packlistTableStore.save('Saving packlist...');
                // Re-analyze quantities after successful save
                await this.analyzePacklistQuantities();
            }
        },

        handleInnerTableDirty(isDirty, rowIndex) {
            if (this.$refs.mainTableComponent && this.$refs.mainTableComponent.checkDirtyCells) {
                this.$refs.mainTableComponent.checkDirtyCells();
            }
        },
        async analyzePacklistQuantities() {
            if (!this.tabName || this.analyzingQuantities) {
                return;
            }
            
            this.analyzingQuantities = true;
            try {
                // Use the API to check item quantities
                const quantityData = await Requests.checkItemQuantities(this.tabName);
                this.itemQuantityStatus = quantityData || {};
                console.log('[PacklistTable] Quantity analysis complete:', this.itemQuantityStatus);
                
                // Process the data and store in AppData for each item
                if (this.packlistTableStore && this.mainTableData) {
                    // Iterate through each crate in the packlist
                    this.mainTableData.forEach((crate, crateIndex) => {
                        if (crate && crate.Items && Array.isArray(crate.Items)) {
                            // Iterate through each item in the crate
                            crate.Items.forEach((item, itemIndex) => {
                                // Reset the AppData items array at the start of analysis
                                if (!item.AppData) item.AppData = {};
                                item.AppData.items = []; // Clear existing items before reanalysis
                                
                                // Extract item codes from relevant fields
                                const itemFields = ['Description', 'Packing/shop notes'];
                                itemFields.forEach(fieldName => {
                                    if (item[fieldName] && typeof item[fieldName] === 'string') {
                                        const itemRegex = /(?:\(([0-9]+)\))?\s*([A-Z]+-[0-9]+[a-zA-Z]?)/g;
                                        let match;
                                        
                                        // Find all item codes in the text
                                        while ((match = itemRegex.exec(item[fieldName])) !== null) {
                                            const quantity = match[1] ? parseInt(match[1], 10) : 1;
                                            const itemId = match[2];
                                            
                                            if (itemId) {
                                                const quantityInfo = this.itemQuantityStatus[itemId];
                                                
                                                // Store item and its quantity info in AppData
                                                const itemData = {
                                                    itemId,
                                                    quantity,
                                                    field: fieldName,
                                                    quantityInfo
                                                };
                                                
                                                // Add warning information if applicable
                                                if (quantityInfo) {
                                                    if (quantityInfo.remaining < 0) {
                                                        itemData.warning = {
                                                            type: 'error',
                                                            message: `<strong>Warning:</strong> Insufficient inventory (${quantityInfo.remaining})`
                                                        };
                                                    } else if (quantityInfo.remaining === 0) {
                                                        itemData.warning = {
                                                            type: 'warning',
                                                            message: `<strong>Warning:</strong> No inventory margin`
                                                        };
                                                    }
                                                }
                                                
                                                // Store in AppData
                                                item.AppData.items.push(itemData);
                                                
                                                // Use the store's setNestedAppData method if it exists
                                                if (this.packlistTableStore && typeof this.packlistTableStore.setNestedAppData === 'function') {
                                                    this.packlistTableStore.setNestedAppData(
                                                        crateIndex,
                                                        'Items',
                                                        itemIndex,
                                                        'items',
                                                        item.AppData.items
                                                    );
                                                }
                                            }
                                        }
                                    }
                                });
                            });
                        }
                    });
                }
            } catch (error) {
                console.error('[PacklistTable] Error analyzing quantities:', error);
                this.itemQuantityStatus = {};
            } finally {
                this.analyzingQuantities = false;
            }
        },
        getItemWarnings(itemRow, columnKey) {
            // Get all warnings from item's AppData
            if (!itemRow || !itemRow.AppData || !Array.isArray(itemRow.AppData.items)) {
                return [];
            }

            // Always show warnings in the "Packing/shop notes" column only
            if (columnKey !== 'Packing/shop notes') {
                return [];
            }

            // Return all warnings regardless of which field they came from
            const warnings = itemRow.AppData.items
                .filter(item => item.warning)
                .map(item => ({
                    type: item.warning.type,
                    message: item.warning.message,
                    itemId: item.itemId
                }));
            return warnings;
        },
        async handleItemIdClick(itemId) {
            try {
                const tabName = await Requests.getTabNameForItem(itemId);
                if (tabName) {
                    this.$emit('navigate-to-path', { 
                        targetPath: `inventory/categories/${tabName}?searchTerm=${itemId}`
                    });
                } else {
                    console.warn('No tab found for item:', itemId);
                }
            } catch (error) {
                console.error('Error getting tab name for item:', itemId, error);
            }
        },
        handleOverlappingShowClick(showIdentifier) {
            this.$emit('navigate-to-path', { 
                targetPath: `packlist/${showIdentifier}` 
            });
        },
        async handlePrint() {
            this.isPrinting = true;
            
            // Temporarily remove 'Pack' and 'Check' from hidden columns for printing
            const originalHidden = [...this.hiddenColumns];
            this.hiddenColumns = this.hiddenColumns.filter(col => col !== 'Pack' && col !== 'Check');

            // Wait for DOM update
            await this.$nextTick();
            
            // Print
            window.print();
            
            // Restore hidden columns after printing
            setTimeout(() => {
                this.hiddenColumns = originalHidden;
                this.isPrinting = false;
            }, 100);
        }
    },
    template: html`
        <div class="packlist-table">
            <div v-if="error" class="error-message">
                <p>Error: {{ error }}</p>
            </div>
            
            <!-- Details View -->
            <div v-if="showDetailsOnly">
                <TableComponent
                    :data="itemWarningDetails"
                    :originalData="itemWarningDetails"
                    :columns="detailsTableColumns"
                    :title="'Packlist Items'"
                    :showRefresh="false"
                    :emptyMessage="'No items'"
                    :draggable="false"
                    :newRow="false"
                    :isLoading="isDetailsLoading"
                    :loading-message="detailsLoadingMessage"
                    :searchTerm="searchTerm"
                    :hideRowsOnSearch="hideRowsOnSearch"
                    :showSearch="true"
                    class="packlist-items-table-component"
                >
                    <template #table-header-area>
                        <div class="button-bar">
                            <button @click="() => tabName ? $emit('navigate-to-path', { targetPath: 'packlist/' + tabName }) : null">
                                Back
                            </button>
                        </div>
                    </template>
                    <template #default="{ row, column }">
                        <!-- Render image for image column -->
                        <ItemImageComponent 
                            v-if="column.key === 'image'"
                            :itemNumber="row['Item ID']"
                        />
                        <!-- Make Item ID column a clickable table-cell-card button -->
                        <button 
                            v-else-if="column.key === 'Item ID'"
                            @click="handleItemIdClick(row['Item ID'])"
                            class="table-cell-card"
                        >
                            {{ row['Item ID'] }}
                        </button>
                        <!-- Handle Overlapping Shows column with multiple buttons -->
                        <div v-else-if="column.key === 'Overlapping Shows'">
                            <template v-if="Array.isArray(row['Overlapping Shows']) && row['Overlapping Shows'].length > 0">
                                <button 
                                    v-for="showId in row['Overlapping Shows']" 
                                    :key="showId"
                                    @click="handleOverlappingShowClick(showId)"
                                    class="table-cell-card"
                                    style="margin: 2px;"
                                >
                                    {{ showId }}
                                </button>
                            </template>
                            <span v-else>None</span>
                        </div>
                        <!-- Default display for other columns -->
                        <span v-else>{{ row[column.key] }}</span>
                    </template>
                </TableComponent>
            </div>
            
            <!-- Main Packlist View -->
            <div v-else>
                <TableComponent
                    ref="mainTableComponent"
                    :data="mainTableData"
                    :originalData="originalData"
                    :columns="mainColumns"
                    :title="tabName"
                    :showRefresh="true"
                    :emptyMessage="'No crates'"
                    :draggable="editMode"
                    :newRow="editMode"
                    :isLoading="isLoading"
                    :loading-message="loadingMessage"
                    :drag-id="'packlist-crates'"
                    @refresh="handleRefresh"
                    @cell-edit="handleCellEdit"
                    @new-row="handleAddCrate"
                    @on-save="handleSave"
                >
                    <template #table-header-area>
                        <!-- Navigation and Analysis Controls -->
                        <div class="button-bar">
                            <!-- Edit Mode Toggle -->
                            <template v-if="!editMode">
                                <button @click="() => tabName ? $emit('navigate-to-path', { targetPath: 'packlist/' + tabName + '/edit' }) : null">
                                    Edit Packlist
                                </button>
                            </template>
                            <template v-else>
                                <button @click="() => tabName ? $emit('navigate-to-path', { targetPath: 'packlist/' + tabName }) : null">
                                    Back to View
                                </button>
                            </template>
                            
                            <!-- Details Button -->
                            <button 
                            :disabled="analyzingQuantities || isLoading || !tabName"
                            :class="{ red: warningCount > 0 }"
                            @click="() => tabName ? $emit('navigate-to-path', { targetPath: 'packlist/' + tabName + '/details' }) : null"
                            >
                                <template v-if="isLoading || analyzingQuantities">
                                    Analyzing...
                                </template>
                                <template v-else-if="warningCount > 0">
                                    Details &#9888;
                                </template>
                                <template v-else>
                                    Details
                                </template>
                            </button>
                            <button v-if="!editMode" @click="handlePrint">Print</button>
                        </div>
                    </template>
                    <template #default="{ row, rowIndex, column, cellRowIndex, cellColIndex, onInnerTableDirty }">
                        <template v-if="column && column.isIndex">
                            <!-- Only count visible (not marked-for-deletion) rows for Piece # -->
                            {{
                                mainTableData
                                    .filter(r => !(r.AppData && r.AppData['marked-for-deletion']))
                                    .findIndex(r => r === row) + 1
                            }}
                        </template>
                        <template v-else-if="column && column.key === itemHeadersStart">
                            <TableComponent
                                v-if="row.Items"
                                :data="row.Items"
                                :originalData="originalData && originalData[rowIndex] ? originalData[rowIndex].Items : []"
                                :columns="itemHeaders.map(label => ({ 
                                    key: label, 
                                    label, 
                                    editable: editMode && ['Description','Packing/shop notes'].includes(label),
                                    width: ['Description','Packing/shop notes'].includes(label) ? undefined : 30,
                                    font: ['Description','Packing/shop notes'].includes(label) ? '' : 'narrow'
                                }))"
                                :hide-columns="hiddenColumns"
                                :emptyMessage="'No items'"
                                :draggable="editMode"
                                :newRow="editMode"
                                :showFooter="false"
                                :showHeader="false"
                                :isLoading="isLoading"
                                :loading-message="loadingMessage"
                                :drag-id="'packlist-items'"
                                @cell-edit="(itemRowIdx, itemColIdx, value) => { row.Items[itemRowIdx][itemHeaders[itemColIdx]] = value; dirty = true; saveDisabled = false; }"
                                @new-row="() => { handleAddItem(rowIndex); }"
                                @inner-table-dirty="(isDirty) => { 
                                    if (typeof onInnerTableDirty === 'function') {
                                        onInnerTableDirty(isDirty, rowIndex, column ? mainColumns.findIndex(c => c.key === column.key) : 0);
                                    }
                                    handleInnerTableDirty(isDirty, rowIndex);
                                }"
                                class="table-fixed"
                            >
                                <template #default="{ row: itemRow, column: itemColumn }">
                                    <div>
                                        <span>{{ itemRow[itemColumn.key] }}</span>
                                    </div>
                                </template>
                                
                                <template #cell-extra="{ row: itemRow, column: itemColumn }">
                                    <!-- Add quantity warning cards based on AppData -->
                                    <template v-for="warning in getItemWarnings(itemRow, itemColumn.key)" :key="warning.itemId">
                                        <div 
                                            class="table-cell-card clickable"
                                            :class="{
                                                'red': warning.type === 'error',
                                                'yellow': warning.type === 'warning'
                                            }"
                                            @click="() => $emit('navigate-to-path', { targetPath: 'packlist/' + tabName + '/details?searchTerm=' + warning.itemId + '&hideRowsOnSearch=false' })"
                                            v-html="warning.message"
                                            title="Click to view details and search for this item"
                                        ></div>
                                    </template>
                                </template>
                            </TableComponent>
                        </template>
                        <template v-else>
                            {{ row[column.key] }}
                        </template>
                    </template>
                </TableComponent>
            </div>
        </div>
    `
};

export default PacklistTable;