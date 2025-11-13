import { html, Requests, TableComponent, getReactiveStore, createAnalysisConfig, ItemImageComponent, Priority } from '../../index.js';

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
    inject: ['$modal'],
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
            inventoryStore: null, // Reactive store for aggregated inventory
        };
    },
    computed: {
        tableData() {
            return this.inventoryStore?.data || [];
        },
        originalData() {
            return this.inventoryStore?.originalData || [];
        },
        isLoading() {
            return this.inventoryStore?.isLoading || false;
        },
        error() {
            return this.inventoryStore?.error || null;
        },
        loadingMessage() {
            return this.inventoryStore?.loadingMessage || 'Loading all inventory data...';
        }
    },
    async mounted() {
        await this.initializeInventoryStore();
    },
    methods: {
        async initializeInventoryStore() {
            // Create a custom aggregator function that loads all inventory tabs
            const loadAllInventoryData = async () => {
                try {
                    // Get all available tabs for INVENTORY
                    const tabs = await Requests.getAvailableTabs('INVENTORY');
                    const inventoryTabs = tabs.filter(tab => tab.title !== 'INDEX');

                    const allData = [];
                    
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
                                allData.push(...itemsWithTab);
                            }
                        } catch (tabError) {
                            console.warn(`Failed to load data from tab ${tab.title}:`, tabError);
                            // Continue loading other tabs even if one fails
                        }
                    }
                    
                    return allData;
                } catch (error) {
                    console.error('Failed to load inventory overview data:', error);
                    this.$modal.error('Failed to load inventory overview data. Please try refreshing or contact support if the problem persists.', 'Inventory Load Error');
                    throw error;
                }
            };
            
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
            
            // Initialize reactive store with the aggregator function and analysis
            this.inventoryStore = getReactiveStore(
                loadAllInventoryData,
                null, // No save function (read-only)
                [], // No arguments
                analysisConfig
            );
            
            // Load the data
            await this.inventoryStore.load('Loading all inventory data...');
        },
        async handleRefresh() {
            // Reload all inventory data using reactive store
            if (this.inventoryStore) {
                await this.inventoryStore.load('Refreshing inventory data...');
            }
        },
        handleCellEdit(rowIdx, colIdx, value) {
            // Read-only for overview table
            this.$modal.alert('This overview table is read-only. Navigate to specific categories to edit items.', 'Info');
        },
        async handleSave() {
            // No save functionality for overview table
            this.$modal.alert('This overview table is read-only. No changes to save.', 'Info');
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
                        :imageUrl="row.AppData && row.AppData.imageUrl"
                    />
                </template>
            </TableComponent>
        </div>
    `
};
