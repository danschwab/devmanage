import { html, Requests, TableComponent, getReactiveStore, modalManager } from '../../index.js';

// Image component for dynamic loading with fallback URLs
const ItemImageComponent = {
    props: ['itemNumber', 'getImageUrl'],
    data() {
        return {
            imageUrl: 'images/placeholder.png',
            isLoading: true,
            urlOptions: [],
            currentUrlIndex: 0
        };
    },
    async mounted() {
        console.log('ItemImageComponent mounted with props:', { itemNumber: this.itemNumber, getImageUrl: this.getImageUrl });
        
        if (this.itemNumber && this.getImageUrl) {
            try {
                console.log('ItemImageComponent calling getImageUrl with:', this.itemNumber);
                const result = await this.getImageUrl(this.itemNumber);
                
                // If result is a string, use it directly
                if (typeof result === 'string') {
                    this.imageUrl = result;
                } else if (result && result.directImageUrl) {
                    // If result has directImageUrl, use it and store options for fallback
                    this.imageUrl = result.directImageUrl;
                    this.urlOptions = result.urlOptions || [result.directImageUrl];
                }
            } catch (error) {
                console.error('Error loading image:', error);
                this.imageUrl = 'images/placeholder.png';
            } finally {
                this.isLoading = false;
            }
        } else {
            this.isLoading = false;
        }
    },
    methods: {
        handleImageError() {
            console.log('Image failed to load:', this.imageUrl);
            
            // Try next URL option if available
            if (this.urlOptions && this.currentUrlIndex < this.urlOptions.length - 1) {
                this.currentUrlIndex++;
                this.imageUrl = this.urlOptions[this.currentUrlIndex];
                console.log('Trying fallback URL:', this.imageUrl);
            } else {
                // All options exhausted, use placeholder
                console.log('All URL options failed, using placeholder');
                this.imageUrl = 'images/placeholder.png';
            }
        }
    },
    template: html`
        <div class="item-image-container" style="position: relative;">
            <img 
                :src="imageUrl" 
                alt="Item Image" 
                :style="isLoading ? 'background-color: var(--color-gray-bg-transparent);' : ''"
                @error="handleImageError"
            />
        </div>
    `
};

// Use Vue's defineComponent if available (Vue 3)
const InventoryTableMenuComponent = Vue.defineComponent
    ? Vue.defineComponent({
        methods: {
            hideRows() {
                modalManager.showAlert('Hide rows clicked!', 'Info');
            }
        },
        template: html`
            <div style="padding:1rem;">
                <button @click="hideRows">Hide rows</button>
            </div>
        `
    })
    : {
        methods: {
            hideRows() {
                modalManager.showAlert('Hide rows clicked!', 'Info');
            }
        },
        template: html`
            <div style="padding:1rem;">
                <button @click="hideRows">Hide rows</button>
            </div>
        `
    };

export const InventoryTableComponent = {
    components: {
        TableComponent,
        InventoryTableMenuComponent, // <-- register here
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
            },
            { 
                key: 'itemNumber', 
                label: 'ITEM#',
                width: 120
            },
            { 
                key: 'description', 
                label: 'Description (visible in pack lists)',
                editable: this.editMode
            },
            { 
                key: 'notes', 
                label: 'Notes (internal only)',
                editable: this.editMode
            },
            { 
                key: 'quantity', 
                label: 'QTY',
                format: 'number',
                width: 100,
                editable: this.editMode,
                autoColor: true
            }
        ];
        return {
            columns,
            inventoryTableStore: null,
            imageCache: new Map() // Cache for loaded images
        };
    },
    computed: {
        tableData() {
            const data = this.inventoryTableStore ? this.inventoryTableStore.data : [];
            // Ensure each row has an image property
            return data.map(row => ({
                ...row,
                image: row.image || 'placeholder' // Initialize with placeholder if not set
            }));
        },
        originalData() {
            // Use the originalData from the store, not a copy of the reactive data
            const data = this.inventoryTableStore && Array.isArray(this.inventoryTableStore.originalData)
                ? JSON.parse(JSON.stringify(this.inventoryTableStore.originalData))
                : [];
            // Ensure each row has an image property
            return data.map(row => ({
                ...row,
                image: row.image || 'placeholder' // Initialize with placeholder if not set
            }));
        },
        error() {
            return this.inventoryTableStore ? this.inventoryTableStore.error : null;
        },
        loadingMessage() {
            return this.inventoryTableStore ? (this.inventoryTableStore.loadingMessage || 'Loading data...') : 'Loading data...';
        },
        isLoading() {
            return this.inventoryTableStore ? this.inventoryTableStore.isLoading : false;
        }
    },
    async mounted() {
        // Defensive: always set up the store before using it
        this.inventoryTableStore = getReactiveStore(
            Requests.getInventoryTabData,
            Requests.saveInventoryTabData,
            [this.tabTitle, undefined, undefined] // No filters needed - search is handled in UI
        );
    },
    methods: {
        async handleRefresh() {
            Requests.clearCache('database', 'getData', ['INVENTORY', this.tabTitle]);
            if (this.inventoryTableStore) {
                await this.inventoryTableStore.load('Reloading inventory...');
            }
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
        },
        async getItemImageUrl(itemNumber) {
            console.log('InventoryTable.getItemImageUrl called with:', { itemNumber, type: typeof itemNumber });
            
            if (!itemNumber) return 'images/placeholder.png';
            
            // Check cache first
            if (this.imageCache.has(itemNumber)) {
                return this.imageCache.get(itemNumber);
            }
            
            try {
                const imageUrl = await Requests.getItemImageUrl(itemNumber);
                const finalUrl = imageUrl || 'images/placeholder.png';
                this.imageCache.set(itemNumber, finalUrl);
                return finalUrl;
            } catch (error) {
                console.error('Error loading image for item:', itemNumber, error);
                const fallbackUrl = 'images/placeholder.png';
                this.imageCache.set(itemNumber, fallbackUrl);
                return fallbackUrl;
            }
        },
        handleShowHamburgerMenu({ menuComponent, tableId }) {
            // Pass the actual component reference, not an object literal
            const menuComp = InventoryTableMenuComponent;
            const modal = modalManager.createModal(
                'Inventory Table Menu',
                [menuComp], // <-- pass as array of component references
                {
                    componentProps: menuComponent?.props || {}
                }
            );
            modalManager.showModal(modal.id);
        }
    },
    template: html `
        <div class="inventory-table-component">
            <TableComponent
                ref="tableComponent"
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
                :hamburger-menu-component="{
                    components: [InventoryTableMenuComponent],
                    props: {}
                }"
                @refresh="handleRefresh"
                @cell-edit="handleCellEdit"
                @on-save="handleSave"
                @show-hamburger-menu="handleShowHamburgerMenu"
            >
                <template #default="{ row, column, rowIndex, cellRowIndex, cellColIndex }">
                    <ItemImageComponent 
                        v-if="column.key === 'image'"
                        :itemNumber="row.itemNumber"
                        :getImageUrl="getItemImageUrl"
                    />
                </template>
            </TableComponent>
        </div>
    `
};