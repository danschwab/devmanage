import { html, TableComponent, Requests, getReactiveStore } from '../../index.js';

// Use getReactiveStore for packlist table data
export const PacklistTable = {
    components: { TableComponent },
    props: {
        content: { type: Object, required: false, default: () => ({}) },
        tabName: { type: String, default: '' },
        sheetId: { type: String, default: '' },
        showDetailsOnly: { type: Boolean, default: false },
        navigateToPath: { type: Function, default: null },
        navigationParameters: {
            type: Object,
            default: () => ({})
        }
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
            searchTerm: this.navigationParameters?.searchTerm || '', // Initialize from navigation parameters
            hideRowsOnSearch: this.navigationParameters?.hideRowsOnSearch !== false // Default to true unless explicitly set to false
        };
    },
    computed: {
        mainHeaders() {
            // Use headers from the first crate if available, else fallback to content
            const crates = this.mainTableData;
            if (crates.length > 0) {
                return [...Object.keys(crates[0]).filter(k => k !== 'Items'), 'Items'];
            }
            // fallback to content headers if present
            const headers = this.content && this.content.length > 0
                ? Object.keys(this.content[0]).filter(k => k !== 'Items')
                : [];
            return [...headers, 'Items'];
        },
        mainColumns() {
            return this.mainHeaders.map((label, idx) => {
                if (label === 'Piece #') {
                    return { key: label, label, editable: false, isIndex: true };
                }
                return { key: label, label, editable: ['Type','L','W','H','Weight','Notes'].includes(label), hidden: []};
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
            return [];
        },
        isLoading() {
            return this.packlistTableStore ? this.packlistTableStore.isLoading : false;
        },
        loadingMessage() {
            return this.packlistTableStore ? (this.packlistTableStore.loadingMessage || 'Loading data...') : 'Loading data...';
        },
        itemWarningDetails() {
            // Extract all item data from AppData for detailed view (not just warnings)
            const details = [];
            
            if (!this.mainTableData || !Array.isArray(this.mainTableData)) {
                return details;
            }
            
            this.mainTableData.forEach((crate, crateIndex) => {
                if (crate && crate.Items && Array.isArray(crate.Items)) {
                    crate.Items.forEach((item, itemIndex) => {
                        if (item.AppData && Array.isArray(item.AppData.items)) {
                            item.AppData.items.forEach(itemData => {
                                // Include ALL items found, not just those with warnings
                                details.push({
                                    'Crate': crate['Piece #'] || `Crate ${crateIndex + 1}`,
                                    'Item Index': itemIndex + 1,
                                    'Field': itemData.field,
                                    'Item ID': itemData.itemId,
                                    'Requested Qty': itemData.quantity,
                                    'Available': itemData.quantityInfo?.inventory || 'N/A',
                                    'Remaining': itemData.quantityInfo?.remaining || 'N/A',
                                    'Warning Type': itemData.warning?.type || '',
                                    'Warning Message': itemData.warning?.message?.replace(/<[^>]*>/g, '') || '', // Strip HTML
                                    'Overlapping Shows': itemData.quantityInfo?.overlapping?.length || 0,
                                    'Has Warning': !!itemData.warning // Flag for styling/filtering
                                });
                            });
                        }
                    });
                }
            });
            
            return details;
        },
        detailsTableColumns() {
            // Define columns for the comprehensive details table
            return [
                { key: 'Crate', label: 'Crate', editable: false },
                { key: 'Item Index', label: 'Item #', editable: false },
                { key: 'Field', label: 'Field', editable: false },
                { key: 'Item ID', label: 'Item ID', editable: false },
                { key: 'Requested Qty', label: 'Requested', editable: false, format: 'number' },
                { key: 'Available', label: 'Available', editable: false, format: 'number' },
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
                { key: 'Warning Type', label: 'Type', editable: false },
                { key: 'Warning Message', label: 'Message', editable: false },
                { key: 'Overlapping Shows', label: 'Overlaps', editable: false, format: 'number' }
            ];
        },
        warningCount() {
            // Count only items with warnings for button display
            return this.itemWarningDetails.filter(item => item['Has Warning']).length;
        }
    },
    watch: {
        navigationParameters: {
            handler(newParams) {
                if (newParams?.searchTerm) {
                    this.searchTerm = newParams.searchTerm;
                }
                if (newParams?.hideRowsOnSearch !== undefined) {
                    this.hideRowsOnSearch = newParams.hideRowsOnSearch;
                }
            },
            deep: true,
            immediate: true
        }
    },
    async mounted() {
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

        // Analyze quantities when data loads
        this.$watch(() => this.mainTableData, () => {
            if (this.mainTableData.length > 0 && this.tabName) {
                this.analyzePacklistQuantities();
            }
        }, { immediate: true });
    },
    methods: {
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
        handleRowMove(dragIndex, dropIndex, newData, type = 'main', crateIdx = null) {
            this.moved = true;
            this.saveDisabled = false;
            if (type === 'main') {
                if (Array.isArray(newData)) {
                    this.mainTableData.splice(0, this.mainTableData.length, ...newData);
                }
            } else if (type === 'item' && crateIdx !== null) {
                if (Array.isArray(newData) && this.mainTableData[crateIdx] && Array.isArray(this.mainTableData[crateIdx].Items)) {
                    this.mainTableData[crateIdx].Items.splice(0, this.mainTableData[crateIdx].Items.length, ...newData);
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
        async handlePrint() {
            this.isPrinting = true;
            // ...existing code...
            this.isPrinting = false;
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
            //console.log('[PacklistTable] Item warnings:', itemRow.AppData.items);

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
            //console.log('[PacklistTable] Warnings for item:', itemRow, warnings);
            return warnings;
        }
    },
    template: html`
        <div class="packlist-table">
            <div v-if="error" class="error-message">
                <p>Error: {{ error }}</p>
            </div>
            
            <!-- Details View -->
            <div v-if="showDetailsOnly">
                <div class="details-header">
                    <h3>Packlist Items Analysis - {{ tabName }}</h3>
                    <p v-if="itemWarningDetails.length === 0">No items found in packlist.</p>
                    <p v-else-if="warningCount === 0">Found {{ itemWarningDetails.length }} items with no inventory warnings.</p>
                    <p v-else>Found {{ itemWarningDetails.length }} items with {{ warningCount }} inventory warnings.</p>
                </div>
                
                <TableComponent
                    v-if="itemWarningDetails.length > 0"
                    :data="itemWarningDetails"
                    :originalData="itemWarningDetails"
                    :columns="detailsTableColumns"
                    :title="'Packlist Items'"
                    :showRefresh="false"
                    :emptyMessage="'No items'"
                    :draggable="false"
                    :newRow="false"
                    :isLoading="false"
                    :searchTerm="searchTerm"
                    :hideRowsOnSearch="hideRowsOnSearch"
                    :showSearch="true"
                />
            </div>
            
            <!-- Main Packlist View -->
            <div v-else>
                <!-- Analysis Controls -->
                <div class="button-bar">
                    <button 
                        @click="analyzePacklistQuantities" 
                        :disabled="analyzingQuantities || isLoading || !tabName"
                    >
                        {{ isLoading ? 'Loading...' : analyzingQuantities ? 'Analyzing...' : 'Analyze Quantities' }}
                    </button>
                    <button 
                        v-if="itemWarningDetails.length > 0" 
                        @click="() => navigateToPath && tabName ? navigateToPath('packlist/' + tabName + '/details') : null"
                    >
                        <template v-if="warningCount > 0">
                            View Details ({{ warningCount }} warnings, {{ itemWarningDetails.length }} total items)
                        </template>
                        <template v-else>
                            View Details ({{ itemWarningDetails.length }} items)
                        </template>
                    </button>
                </div>
            
            <TableComponent
                ref="mainTableComponent"
                :data="mainTableData"
                :originalData="originalData"
                :columns="mainColumns"
                :title="tabName"
                :showRefresh="true"
                :emptyMessage="'No crates'"
                :draggable="true"
                :newRow="true"
                :isLoading="isLoading"
                :loading-message="loadingMessage"
                :drag-id="'packlist-crates'"
                @refresh="handleRefresh"
                @cell-edit="handleCellEdit"
                @row-move="(dragIndex, dropIndex, newData) => handleRowMove(dragIndex, dropIndex, newData, 'main')"
                @new-row="handleAddCrate"
                @on-save="handleSave"
            >
                <template #default="{ row, rowIndex, column, cellRowIndex, cellColIndex, onInnerTableDirty }">
                    <template v-if="column && column.isIndex">
                        <!-- Only count visible (not marked-for-deletion) rows for Piece # -->
                        {{
                            mainTableData
                                .filter(r => !(r.AppData && r.AppData['marked-for-deletion']))
                                .findIndex(r => r === row) + 1
                        }}
                    </template>
                    <template v-else-if="column && column.key === 'Items'">
                        <TableComponent
                            v-if="row.Items"
                            :data="row.Items.length === 0 ? (() => { handleAddItem(rowIndex); return row.Items; })() : row.Items"
                            :originalData="originalData && originalData[rowIndex] ? originalData[rowIndex].Items : []"
                            :columns="itemHeaders.map(label => ({ key: label, label, editable: ['Description','Packing/shop notes'].includes(label) }))"
                            :hide-columns="['Pack','Check']"
                            :emptyMessage="'No items'"
                            :draggable="true"
                            :newRow="true"
                            :showFooter="false"
                            :showHeader="false"
                            :isLoading="isLoading"
                            :loading-message="loadingMessage"
                            :drag-id="'packlist-items'"
                            @cell-edit="(itemRowIdx, itemColIdx, value) => { row.Items[itemRowIdx][itemHeaders[itemColIdx]] = value; dirty = true; saveDisabled = false; }"
                            @row-move="(dragIndex, dropIndex, newData) => handleRowMove(dragIndex, dropIndex, newData, 'item', rowIndex)"
                            @new-row="() => { handleAddItem(rowIndex); }"
                            @inner-table-dirty="(isDirty) => { 
                                if (typeof onInnerTableDirty === 'function') {
                                    onInnerTableDirty(isDirty, rowIndex, column ? mainColumns.findIndex(c => c.key === column.key) : 0);
                                }
                                handleInnerTableDirty(isDirty, rowIndex);
                            }"
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
                                        @click="() => navigateToPath('packlist/' + tabName + '/details', { searchTerm: warning.itemId, hideRowsOnSearch: false })"
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