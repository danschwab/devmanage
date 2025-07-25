import { html, Requests, TableComponent, getReactiveStore, modalManager } from '../../index.js';

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
        InventoryTableMenuComponent // <-- register here
    },
    props: {
        containerPath: {
            type: String,
            default: 'inventory'
        },
        tabName: {
            type: String,
            default: 'furniture'
        },
        tabTitle: {
            type: String,
            default: 'FURNITURE'
        }
    },
    data() {
        return {
            columns: [
                { 
                    key: 'itemNumber', 
                    label: 'ITEM#',
                    width: 120
                },
                { 
                    key: 'description', 
                    label: 'Description',
                    editable: true
                },
                { 
                    key: 'quantity', 
                    label: 'QTY',
                    format: 'number',
                    width: 100,
                    cellClass: (value) => {
                        if (value === 0) return 'red';
                        if (value < 5) return 'yellow';
                        return 'green';
                    }
                }
            ],
            inventoryTableStore: null
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
            [this.tabTitle]
        );
    },
    methods: {
        async handleRefresh() {
            Requests.clearCache('INVENTORY', this.tabTitle);
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
                :originalData="originalData"
                :columns="columns"
                :isLoading="isLoading"
                :error="error"
                :showRefresh="true"
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
            />
        </div>
    `
};