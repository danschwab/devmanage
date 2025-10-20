import { html, TableComponent, Requests, getReactiveStore, NavigationRegistry, createAnalysisConfig, extractItemNumber } from '../../index.js';
import { PacklistItemsSummary } from './PacklistItemsSummary.js';

// Use getReactiveStore for packlist table data
export const PacklistTable = {
    components: { TableComponent, PacklistItemsSummary },
    props: {
        content: { type: Object, required: false, default: () => ({}) },
        tabName: { type: String, default: '' },
        editMode: { type: Boolean, default: false },
        containerPath: { type: String, default: '' }
    },
    data() {
        return {
            packlistTableStore: null,
            saveDisabled: true,
            dirty: false,
            isPrinting: false,
            error: null,
            databaseItemHeaders: null,
            hiddenColumns: ['Pack','Check','Extracted Item','Extracted Qty']
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
        loadingMessage() {
            return this.packlistTableStore ? (this.packlistTableStore.loadingMessage || 'Loading data...') : 'Loading data...';
        },
        // Navigation-based parameters from NavigationRegistry
        navParams() {
            // Use the containerPath as the primary source - it should be the full path
            // If containerPath is empty/undefined, fall back to constructing from tabName
            let path = this.containerPath;
            if (!path && this.tabName) {
                path = `packlist/${this.tabName}`;
            }
            return NavigationRegistry.getNavigationParameters(path || '');
        }
    },
    watch: {},
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
    },
    methods: {
        initializeStore() {
            if (!this.tabName) return;
            
            // Create analysis configuration for item extraction
            const analysisConfig = [
                // Extract item number from Description and store in 'Extracted Item' column
                createAnalysisConfig(
                    Requests.extractItemNumber,
                    'extractedItem',
                    'Extracting item numbers...',
                    ['Description', 'Packing/shop notes'], // Try Description first, then notes
                    [],
                    'Extracted Item' // Target column name
                ),
                
                // Extract quantity from Description and store in 'Extracted Qty' column  
                createAnalysisConfig(
                    Requests.extractQuantity,
                    'extractedQty',
                    'Extracting quantities...',
                    ['Description', 'Packing/shop notes'], // Try Description first, then notes
                    [],
                    'Extracted Qty' // Target column name
                ),

                // Compare descriptions and store alert in AppData if mismatch
                createAnalysisConfig(
                    (item) => {
                        // This function receives the entire item and extracts needed data
                        const itemNumber = item['Extracted Item'] || extractItemNumber(item.Description || item['Packing/shop notes'] || '');
                        const description = item.Description || item['Packing/shop notes'] || '';
                        
                        if (!itemNumber) {
                            return Promise.resolve(null);
                        }
                        
                        return Requests.checkDescriptionMatch({
                            itemNumber,
                            description
                        });
                    },
                    'descriptionAlert',
                    'Checking description match...',
                    ['Description', 'Packing/shop notes'], // Source columns for nested detection
                    [],
                    null, // No targetColumn - results go to AppData
                    true // passFullItem = true to get entire item object
                )
            ];
            
            // Pass Requests.savePackList as the save function with analysis
            this.packlistTableStore = getReactiveStore(
                Requests.getPackList,
                Requests.savePackList,
                [this.tabName],
                analysisConfig // Add analysis configuration
            );
            this.error = this.packlistTableStore.error;
            
            // Load database headers
            this.loadItemHeaders();
        },
        async loadItemHeaders() {
            if (!this.tabName) return;
            try {
                this.databaseItemHeaders = await Requests.getItemHeaders(this.tabName);
            } catch (error) {
                console.warn('Failed to load item headers from database:', error);
                this.databaseItemHeaders = ['Pack', 'Check', 'Description', 'Packing/shop notes'];
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
            }
        },

        handleInnerTableDirty(isDirty, rowIndex) {
            if (this.$refs.mainTableComponent && this.$refs.mainTableComponent.checkDirtyCells) {
                this.$refs.mainTableComponent.checkDirtyCells();
            }
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
            
            <!-- Main Packlist View -->
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
                    :isAnalyzing="packlistTableStore ? packlistTableStore.isAnalyzing : false"
                    :loading-message="packlistTableStore && packlistTableStore.isLoading ? (packlistTableStore.loadingMessage || 'Loading data...') : (packlistTableStore && packlistTableStore.isAnalyzing ? (packlistTableStore.analysisMessage.loadingMessage || 'Analyzing data...') : loadingMessage)"
                    :loading-progress="packlistTableStore && packlistTableStore.isAnalyzing ? packlistTableStore.analysisProgress : -1"
                    :loading-message="loadingMessage"
                    :loading-progress
                    :drag-id="'packlist-crates'"
                    @refresh="handleRefresh"
                    @cell-edit="handleCellEdit"
                    @new-row="handleAddCrate"
                    @on-save="handleSave"
                >
                    <template #table-header-area>
                        <!-- Navigation Controls -->
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
                                    <div style="position: relative;">
                                        <span>{{ itemRow[itemColumn.key] }}</span>
                                        <!-- Show alert icon if there's a description mismatch for this item -->
                                        <span 
                                            v-if="itemRow.AppData?.descriptionAlert && itemColumn.key === 'Description'"
                                            :title="itemRow.AppData.descriptionAlert.message"
                                            style="color: #ff6b35; margin-left: 5px; cursor: help;"
                                        >
                                            ⚠️
                                        </span>
                                    </div>
                                </template>
                            </TableComponent>
                        </template>
                        <template v-else>
                            {{ row[column.key] }}
                        </template>
                    </template>
                </TableComponent>
            </div>

            <!-- Item Quantities Summary Section -->
            <div v-if="tabName && !editMode" class="items-summary-section" style="margin-top: 2rem;">
                <PacklistItemsSummary :project-identifier="tabName" />
            </div>
        </div>
    `
};

