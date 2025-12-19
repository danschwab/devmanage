import { html, TableComponent, Requests, getReactiveStore, NavigationRegistry, createAnalysisConfig, invalidateCache } from '../../index.js';

// Use getReactiveStore for packlist table data
export const PacklistTable = {
    components: { TableComponent },
    inject: ['$modal'],
    props: {
        content: { type: Object, required: false, default: () => ({}) },
        tabName: { type: String, default: '' },
        containerPath: { type: String, default: '' }
    },
    data() {
        return {
            packlistTableStore: null,
            isPrinting: false,
            error: null,
            databaseItemHeaders: null,
            hiddenColumns: ['Pack', 'Check', 'Extracted Item', 'Extracted Qty']
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
        // Check if data has been modified (uses reactive store's computed property)
        isDirty() {
            return this.packlistTableStore?.isModified || false;
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
        },
        // Get search term from URL parameters
        initialSearchTerm() {
            return this.navParams?.searchTerm || '';
        },
        editMode() {
            // Check if we're viewing the edit subview
            return this.navParams?.edit === true;
        }
    },
    watch: {
        // Auto-switch to edit mode when data becomes dirty in view mode
        isDirty(newValue) {
            if (newValue && !this.editMode && this.tabName) {
                // Navigate to edit mode when data becomes dirty
                const editPath = `packlist/${this.tabName}?edit=true`;
                this.$emit('navigate-to-path', editPath);
            }
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
                    Requests.checkDescriptionMatch,
                    'descriptionAlert',
                    'Checking description match...',
                    ['Description', 'Packing/shop notes'], // Source columns for nested detection
                    [],
                    null, // No targetColumn - results go to AppData
                    true // passFullItem = true to get entire item object (API expects full item)
                ),

                // Check inventory levels and create alerts for low quantities
                createAnalysisConfig(
                    Requests.checkInventoryLevel,
                    'inventoryAlert',
                    'Checking inventory levels...',
                    ['Description', 'Packing/shop notes'], // Source columns for nested detection (use existing columns, not generated ones)
                    [this.tabName], // Additional parameter: current project ID
                    null, // No targetColumn - results go to AppData
                    true // passFullItem = true to get entire item object (API expects full item)
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
            invalidateCache([
                { namespace: 'database', methodName: 'getData', args: ['PACK_LISTS', this.tabName] }
            ], true);
        },
        handleCellEdit(rowIdx, colIdx, value, type = 'main') {
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

        /**
         * Get card color for an alert
         * Prioritizes alert.color property, falls back to type-based mapping
         * @param {Object|string} alert - Alert object or type string
         * @returns {string} Color class name for the card
         */
        getAlertColor(alert) {
            // If alert is an object with a color property, use it
            if (typeof alert === 'object' && alert.color) {
                return alert.color;
            }
            
            // Otherwise, map type to color
            const type = typeof alert === 'object' ? alert.type : alert;
            const colorMap = {
                'error': 'red',
                'description mismatch': 'yellow',
                'warning': 'yellow',
                'info': 'blue',
                'success': 'green'
            };
            return colorMap[type] || 'red'; // Default to red if type is unknown
        },

        /**
         * Handle click on an alert card
         * @param {Object} item - The item row containing the alert
         * @param {string} alertKey - The AppData key for this alert
         * @param {Object} alert - The alert object that was clicked
         */
        handleAlertClick(item, alertKey, alert) {
            // Handle different types of alerts
            if (alertKey === 'descriptionAlert' || alert.type === 'description mismatch') {
                this.showDescriptionMismatchModal(item, alert);
            } else if (alertKey === 'inventoryAlert' || ['item shortage', 'item warning', 'low-inventory'].includes(alert.type)) {
                this.navigateToInventoryDetails(item);
            } else {
                // Generic alert display
                this.$modal.alert(alert.message, alert.type || 'Info');
            }
        },

        /**
         * Show detailed modal for description mismatch alerts
         * @param {Object} item - The item with the mismatch
         * @param {Object} alert - The alert data
         */
        showDescriptionMismatchModal(item, alert) {
            const itemNumber = item['Extracted Item'] || 'Unknown';
            const extractedQty = item['Extracted Qty'] || '1';
            const matchPercentage = alert.score ? Math.round(alert.score * 100) : 0;
            const inventoryDescription = alert.inventoryDescription || 'N/A';
            
            const modalContent = `
                <div style="text-align: left;">
                    <em>Click "Update Description" to replace the packlist description with the inventory description.</em>

                    <p style="margin-top:1rem;">Current Description:</p>
                    <div class="card orange">
                        ${alert.packlistDescription || item.Description || 'N/A'}
                    </div>
                    
                    <p style="margin-top:1rem;">Inventory Description:</p>
                    <div class="card purple">
                        ${inventoryDescription}
                    </div>
                    
                    <p style="margin-top: 1rem; font-size: 0.9em; color: var(--color-text-secondary);">
                        
                    </p>
                </div>
            `;
            
            // Show confirm modal with custom action button
            this.$modal.confirm(
                modalContent,
                () => {
                    // On confirm: Update the description field with the formatted inventory description
                    const newDescription = `(${extractedQty}) ${itemNumber} ${inventoryDescription}`;
                    
                    // Update the item's Description field
                    item.Description = newDescription;
                    
                    // Show success message (save will be enabled automatically via isModified)
                    //this.$modal.alert('Description updated! Remember to save your changes.', 'Success');

                    //clear the alert from AppData
                    if (item.AppData) {
                        delete item.AppData['descriptionAlert'];
                    }
                },
                () => {
                    // On cancel: do nothing
                },
                `Description Mismatch ${itemNumber}`, // Title
                'Update Description', // Custom confirm button text
                'Cancel' // Custom cancel button text
            );
        },

        /**
         * Navigate to inventory details page for an item
         * @param {Object} item - The item to view details for
         */
        navigateToInventoryDetails(item) {
            const itemNumber = item['Extracted Item'];
            
            if (!itemNumber) {
                console.warn('Cannot navigate to details: no item number found');
                return;
            }
            
            // Navigate to the details endpoint with the item number as a search parameter
            const targetPath = `packlist/${this.tabName}/details?searchTerm=${encodeURIComponent(itemNumber)}`;
            this.$emit('navigate-to-path', targetPath);
        },

        async handlePrint() {
            //if not on the packlist page, navigate to the packlist page first
            this.$emit('navigate-to-path', this.containerPath);

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
                    :drag-id="'packlist-crates'"
                    @refresh="handleRefresh"
                    @cell-edit="handleCellEdit"
                    @new-row="handleAddCrate"
                    @on-save="handleSave"
                >
                    <template #header-area>
                        <!-- Navigation Controls -->
                        <div class="button-bar">
                            <!-- Edit Mode Toggle -->
                            <template v-if="!editMode">
                                <button @click="() => tabName ? $emit('navigate-to-path', 'packlist/' + tabName + '?edit=true') : null">
                                    Edit Packlist
                                </button>
                            </template>
                            <template v-else>
                                <button 
                                    @click="() => tabName ? $emit('navigate-to-path', 'packlist/' + tabName) : null"
                                    :disabled="isDirty"
                                    :title="isDirty ? 'Save or discard changes before returning to view mode' : 'Return to view mode'">
                                    Back to View
                                </button>
                            </template>
                            <button @click="() => tabName ? $emit('navigate-to-path', 'packlist/' + tabName + '/details') : null">
                                Details
                            </button>

                            <button v-if="!editMode" @click="handlePrint" class="white">Print</button>
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
                                :drag-id="'packlist-items'"
                                @cell-edit="(itemRowIdx, itemColIdx, value) => { row.Items[itemRowIdx][itemHeaders[itemColIdx]] = value; }"
                                @new-row="() => { handleAddItem(rowIndex); }"
                                @inner-table-dirty="(isDirty) => { 
                                    if (typeof onInnerTableDirty === 'function') {
                                        onInnerTableDirty(isDirty, rowIndex, column ? mainColumns.findIndex(c => c.key === column.key) : 0);
                                    }
                                    handleInnerTableDirty(isDirty, rowIndex);
                                }"
                                class="table-fixed"
                            >
                                <!-- Default slot for cell content -->
                                <template #default="{ row: itemRow, column: itemColumn }">
                                    <span>{{ itemRow[itemColumn.key] }}</span>
                                </template>
                                
                                <!-- Cell-extra slot for alerts (proper location for warnings/notifications) -->
                                <template #cell-extra="{ row: itemRow, column: itemColumn }">
                                    <!-- Display all AppData alerts as colored cards (visible in both view and edit modes) -->
                                    <template v-if="itemRow.AppData && itemColumn.key === 'Packing/shop notes'">
                                        <template v-for="(value, key) in itemRow.AppData" :key="key">
                                            <div 
                                                v-if="value && typeof value === 'object' && value.message && !key.endsWith('_error')"
                                                :class="['card', getAlertColor(value), { 'clickable': value.clickable }]"
                                                @click="value.clickable ? handleAlertClick(itemRow, key, value) : null"
                                            >
                                                {{ value.message }}
                                            </div>
                                        </template>
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

