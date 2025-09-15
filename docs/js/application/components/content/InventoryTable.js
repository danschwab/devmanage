import { html, Requests, TableComponent, getReactiveStore, modalManager } from '../../index.js';




// Image component for dynamic loading
export const ItemImageComponent = {
    props: {
        itemNumber: {
            type: String,
            required: true
        },
        imageSize: {
            type: Number,
            default: 64
        }
    },
    data() {
        return {
            imageUrl: 'images/placeholder.png',
            isLoading: true,
            imageFound: false
        };
    },
    async mounted() {
        console.log('ItemImageComponent mounted with props:', { itemNumber: this.itemNumber });

        if (this.itemNumber) {
            try {
                console.log('ItemImageComponent calling getItemImageUrl with:', this.itemNumber);
                this.imageUrl = await this.getItemImageUrl(this.itemNumber);
                if (!(this.imageUrl === null) && this.imageUrl !== 'images/placeholder.png') {
                    this.imageFound = true;
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
        async getItemImageUrl(itemNumber) {
            console.log('ItemImageComponent.getItemImageUrl called with:', { itemNumber, type: typeof itemNumber });
            
            if (!itemNumber) return 'images/placeholder.png';
            
            try {
                const imageUrl = await Requests.getItemImageUrl(itemNumber);
                const finalUrl = imageUrl || 'images/placeholder.png';
                return finalUrl;
            } catch (error) {
                console.error('Error loading image for item:', itemNumber, error);
                const fallbackUrl = 'images/placeholder.png';
                return fallbackUrl;
            }
        },
        showImageModal() {
            if (this.imageUrl && this.imageUrl !== 'images/placeholder.png') {
                // Create a simple image modal component
                const ImageModalComponent = {
                    props: ['imageUrl', 'itemNumber'],
                    template: html`
                        <div style="text-align: center; padding: 1rem;">
                            <img
                                :src="imageUrl" 
                                alt="Item Image" 
                                style="max-width: 90vw; max-height: 80vh; object-fit: contain;"
                            />
                        </div>
                    `
                };
                
                const modal = modalManager.createModal(
                    `Image: ${this.itemNumber}`,
                    [ImageModalComponent],
                    {
                        componentProps: {
                            imageUrl: this.imageUrl,
                            itemNumber: this.itemNumber
                        }
                    }
                );
                modalManager.showModal(modal.id);
            }
        }
    },
    template: html`
        <div class="item-image-container" :style="{ position: 'relative', width: imageSize + 'px', height: imageSize + 'px' }">
            <img 
                :src="imageUrl" 
                alt="Item Image" 
                :style="isLoading ? 'background-color: var(--color-gray-bg-transparent);' : ''"
                :style="imageFound ? 'cursor: pointer;' : ''"
                @click="showImageModal"
                @error="imageUrl = 'images/placeholder.png'"
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
        },
        navigationParameters: {
            type: Object,
            default: () => ({})
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
                key: 'quantity', 
                label: 'QTY',
                format: 'number',
                editable: this.editMode,
                autoColor: true
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
                :searchTerm="navigationParameters?.searchTerm || ''"
                :hideRowsOnSearch="navigationParameters?.hideRowsOnSearch !== false"
                @refresh="handleRefresh"
                @cell-edit="handleCellEdit"
                @on-save="handleSave"
            >
                <template #default="{ row, column, rowIndex, cellRowIndex, cellColIndex }">
                    <ItemImageComponent 
                        v-if="column.key === 'image'"
                        :itemNumber="row.itemNumber"
                    />
                </template>
            </TableComponent>
        </div>
    `
};