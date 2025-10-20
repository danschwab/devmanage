import { html, Requests, TableComponent, getReactiveStore, modalManager, ItemImageComponent } from '../../index.js';

export const InventoryOverviewTableComponent = {
    components: {
        TableComponent,
        ItemImageComponent
    },
    props: {
        containerPath: {
            type: String,
            default: 'inventory'
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
                    key: 'image', 
                    label: 'I',
                    width: 1,
                },
                { 
                    key: 'itemNumber', 
                    label: 'ITEM#',
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
                    editable: false,
                    autoColor: true
                }
            ],
            allInventoryData: [],
            isLoading: false,
            error: null,
            loadingMessage: 'Loading all inventory data...',
            imageCache: new Map() // Cache for loaded images
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
                for (const tab of inventoryTabs) {
                    try {
                        const tabData = await Requests.getInventoryTabData(tab.title);
                        
                        // Add tab information to each item
                        if (Array.isArray(tabData)) {
                            const itemsWithTab = tabData.map(item => ({
                                ...item,
                                tab: tab.title
                            }));
                            this.allInventoryData.push(...itemsWithTab);
                            this.isLoading = false;
                        }
                    } catch (tabError) {
                        console.warn(`Failed to load data from tab ${tab.title}:`, tabError);
                        // Continue loading other tabs even if one fails
                    }
                }

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
        async getItemImageUrl(itemNumber) {
            console.log('InventoryOverviewTable.getItemImageUrl called with:', { itemNumber, type: typeof itemNumber });
            
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
        handleCategoryClick(tabName) {
            // Navigate to the specific category view
            const categoryName = tabName.toLowerCase();
            this.$emit('navigate-to-path', { targetPath: `inventory/categories/${categoryName}` });
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
                        class="card purple"
                    >
                        {{ formatCategoryLabel(row.tab) }}
                    </button>
                    <ItemImageComponent 
                        v-if="column.key === 'image'"
                        :imageSize="32"
                        :itemNumber="row.itemNumber"
                    />
                </template>
            </TableComponent>
        </div>
    `
};
