import { html, Requests, TableComponent, getReactiveStore, createAnalysisConfig, NavigationRegistry, Priority, invalidateCache } from '../../index.js';




// Image component for displaying item thumbnails
// Image URL should be provided via analysis step in reactive store
export const ItemImageComponent = {
    props: {
        imageUrl: {
            type: String,
            default: 'images/placeholder.png'
        },
        itemNumber: {
            type: String,
            default: ''
        },
        imageSize: {
            type: Number,
            default: 64
        }
    },
    inject: ['$modal'],
    computed: {
        displayUrl() {
            return this.imageUrl || 'images/placeholder.png';
        },
        imageFound() {
            return this.displayUrl !== 'images/placeholder.png';
        }
    },
    methods: {
        showImageModal() {
            if (this.imageFound) {
                this.$modal.image(this.displayUrl, `Image: ${this.itemNumber}`, this.itemNumber);
            }
        },
        handleError() {
            // If image fails to load, will fall back to placeholder via error handling in template
            console.warn(`Failed to load image for item ${this.itemNumber}`);
        }
    },
    template: html`
        <div class="item-image-container" :style="{ position: 'relative', width: imageSize + 'px', height: imageSize + 'px' }">
            <img 
                :src="displayUrl" 
                alt="Item Image" 
                :style="imageFound ? 'cursor: pointer;' : ''"
                @click="showImageModal"
                @error="handleError"
            />
        </div>
    `
};



export const InventoryTableComponent = {
    components: {
        TableComponent,
        ItemImageComponent
    },
    props: {
        containerPath: {
            type: String,
            default: 'inventory'
        },
        inventoryName: {
            type: String,
            default: 'Inventory'
        },
        tabTitle: {
            type: String,
            default: undefined
        },
        editMode: {
            type: Boolean,
            default: true
        }
    },
    data() {
        // Dynamically set columns' editable property based on editMode
        const columns = [
            { 
                key: 'image', 
                label: 'IMG',
                width: 1,
                sortable: false
            },
            { 
                key: 'itemNumber', 
                label: 'ITEM#',
                width: 120,
                sortable: true
            },
            { 
                key: 'quantity', 
                label: 'QTY',
                format: 'number',
                editable: this.editMode,
                autoColor: true,
                width: 120,
                sortable: true
            },
            { 
                key: 'description', 
                label: 'Description (visible in pack lists)',
                editable: this.editMode,
                sortable: true
            },
            { 
                key: 'notes', 
                label: 'Notes (internal only)',
                editable: this.editMode,
                sortable: false
            }
        ];
        return {
            columns,
            inventoryTableStore: null,
        };
    },
    computed: {
        tableData() {
            return this.inventoryTableStore ? this.inventoryTableStore.data : [];
        },
        originalData() {
            // Use the originalData from the store, not a copy of the reactive data
            return this.inventoryTableStore && Array.isArray(this.inventoryTableStore.originalData)
                ? JSON.parse(JSON.stringify(this.inventoryTableStore.originalData))
                : [];
        },
        error() {
            return this.inventoryTableStore ? this.inventoryTableStore.error : null;
        },
        loadingMessage() {
            return this.inventoryTableStore ? (this.inventoryTableStore.loadingMessage || 'Loading data...') : 'Loading data...';
        },
        isLoading() {
            return this.inventoryTableStore ? this.inventoryTableStore.isLoading : false;
        },
        // Navigation-based parameters from NavigationRegistry
        navParams() {
            return NavigationRegistry.getNavigationParameters(this.containerPath);
        }
    },
    async mounted() {
        // Create analysis config for image URLs
        const analysisConfig = [
            createAnalysisConfig(
                Requests.getItemImageUrl,
                'imageUrl',
                'Loading item images...',
                ['itemNumber'],
                [],
                null, // Store in AppData, not a column
                false,
                Priority.BACKGROUND // Images are visual enhancements, lowest priority
            )
        ];
        
        // Defensive: always set up the store before using it
        this.inventoryTableStore = getReactiveStore(
            Requests.getInventoryTabData,
            Requests.saveInventoryTabData,
            [this.tabTitle, undefined, undefined], // No filters needed - search is handled in UI
            analysisConfig
        );
    },
    methods: {
        async handleRefresh() {
            // Reload inventory data (cache will be automatically invalidated)
            invalidateCache([
                { namespace: 'database', methodName: 'getData', args: ['INVENTORY', this.tabTitle] }
            ], true);
        },
        handleCellEdit(rowIdx, colIdx, value) {
            const colKey = this.columns[colIdx]?.key;
            if (colKey && this.inventoryTableStore) {
                this.inventoryTableStore.data[rowIdx][colKey] = value;
            }
        },
        async handleSave() {
            // Only use the store's save method if this is called from the on-save event
            if (this.inventoryTableStore) {
                console.log('[InventoryTableComponent] Saving data:', JSON.parse(JSON.stringify(this.inventoryTableStore.data)));
                await this.inventoryTableStore.save('Saving inventory...');            }
        }
    },
    template: html `
        <slot>
            <TableComponent
                ref="tableComponent"
                theme="purple"
                :data="tableData"
                :title="inventoryName || tabTitle"
                :originalData="originalData"
                :columns="columns"
                :isLoading="isLoading"
                :error="error"
                :showRefresh="true"
                :showSearch="true"
                emptyMessage="No inventory items found"
                :loading-message="loadingMessage"
                :searchTerm="navParams?.searchTerm || ''"
                :hideRowsOnSearch="navParams?.hideRowsOnSearch !== false"
                class="inventory-table-component"
                @refresh="handleRefresh"
                @cell-edit="handleCellEdit"
                @on-save="handleSave"
            >
                <template #default="{ row, column, rowIndex, cellRowIndex, cellColIndex }">
                    <ItemImageComponent 
                        v-if="column.key === 'image'"
                        :itemNumber="row.itemNumber"
                        :imageUrl="row.AppData && row.AppData.imageUrl"
                    />
                </template>
            </TableComponent>
        </slot>
    `
};