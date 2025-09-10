import { html, Requests, TableComponent, getReactiveStore, modalManager } from '../../index.js';

export const InventoryOverviewTableComponent = {
    components: {
        TableComponent
    },
    props: {
        containerPath: {
            type: String,
            default: 'inventory'
        },
        navigateToPath: {
            type: Function,
            required: false
        }
    },
    data() {
        return {
            columns: [
                { 
                    key: 'tab', 
                    label: 'Category',
                    width: 120
                },
                { 
                    key: 'itemNumber', 
                    label: 'ITEM#',
                    width: 120
                },
                { 
                    key: 'description', 
                    label: 'Description',
                    editable: false,
                    details: true
                },
                { 
                    key: 'notes', 
                    label: 'Notes',
                    editable: false,
                    details: true
                },
                { 
                    key: 'quantity', 
                    label: 'QTY',
                    format: 'number',
                    width: 100,
                    editable: false,
                    autoColor: true
                }
            ],
            allInventoryData: [],
            isLoading: false,
            error: null,
            loadingMessage: 'Loading all inventory data...'
        };
    },
    computed: {
        tableData() {
            return this.allInventoryData;
        },
        originalData() {
            return JSON.parse(JSON.stringify(this.allInventoryData));
        }
    },
    async mounted() {
        await this.loadAllInventoryData();
    },
    methods: {
        async loadAllInventoryData() {
            this.isLoading = true;
            this.error = null;
            this.allInventoryData = [];

            try {
                // Get all available tabs for INVENTORY
                const tabs = await Requests.getAvailableTabs('INVENTORY');
                const inventoryTabs = tabs.filter(tab => tab.title !== 'INDEX');

                // Load data from each tab
                const allData = [];
                for (const tab of inventoryTabs) {
                    try {
                        const tabData = await Requests.getInventoryTabData(tab.title);
                        
                        // Add tab information to each item
                        if (Array.isArray(tabData)) {
                            const itemsWithTab = tabData.map(item => ({
                                ...item,
                                tab: tab.title
                            }));
                            allData.push(...itemsWithTab);
                        }
                    } catch (tabError) {
                        console.warn(`Failed to load data from tab ${tab.title}:`, tabError);
                        // Continue loading other tabs even if one fails
                    }
                }

                this.allInventoryData = allData;
            } catch (error) {
                console.error('Failed to load inventory overview data:', error);
                this.error = 'Failed to load inventory data';
            } finally {
                this.isLoading = false;
            }
        },
        async handleRefresh() {
            // Clear all inventory caches
            const tabs = await Requests.getAvailableTabs('INVENTORY');
            const inventoryTabs = tabs.filter(tab => tab.title !== 'INDEX');
            
            for (const tab of inventoryTabs) {
                Requests.clearCache('database', 'getData', ['INVENTORY', tab.title]);
            }
            
            await this.loadAllInventoryData();
        },
        handleCellEdit(rowIdx, colIdx, value) {
            // Read-only for overview table
            modalManager.showAlert('This overview table is read-only. Navigate to specific categories to edit items.', 'Info');
        },
        async handleSave() {
            // No save functionality for overview table
            modalManager.showAlert('This overview table is read-only. No changes to save.', 'Info');
        },
        handleCategoryClick(tabName) {
            // Navigate to the specific category view
            if (this.navigateToPath) {
                const categoryName = tabName.toLowerCase();
                this.navigateToPath(`inventory/categories/${categoryName}`);
            } else {
                modalManager.showAlert(`Navigate to ${tabName} category`, 'Info');
            }
        },
        formatCategoryLabel(tabName) {
            if (!tabName) return '';
            const lower = tabName.toLowerCase();
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        }
    },
    template: html `
        <div class="inventory-overview-table-component">
            <TableComponent
                ref="tableComponent"
                :data="tableData"
                title="All Inventory Overview"
                :originalData="originalData"
                :columns="columns"
                :isLoading="isLoading"
                :error="error"
                :showRefresh="true"
                :showSearch="true"
                :sortable="true"
                :showHeader="true"
                :showFooter="true"
                :allowDetails="true"
                emptyMessage="No inventory items found across all categories"
                :loading-message="loadingMessage"
                @refresh="handleRefresh"
                @cell-edit="handleCellEdit"
                @on-save="handleSave"
            >
                <template #default="{ row, column }">
                    <button 
                        v-if="column.key === 'tab'"
                        @click="handleCategoryClick(row.tab)"
                        class="table-cell-card"
                    >
                        {{ formatCategoryLabel(row.tab) }}
                    </button>
                </template>
            </TableComponent>
        </div>
    `
};
