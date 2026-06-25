import { html, Requests, TableComponent, getReactiveStore, createAnalysisConfig, ItemImageComponent, Priority, invalidateCache, EditHistoryUtils, todayISOString, NavigationRegistry } from '../../index.js';

export const InventoryOverviewTableComponent = {
    components: {
        TableComponent,
        ItemImageComponent
    },
    props: {
        containerPath: {
            type: String,
            default: 'inventory'
        },
        viewModes: {
            type: Array,
            default: () => []
        }
    },
    inject: ['$modal'],
    data() {
        return {
            columns: [
                { 
                    key: 'tab', 
                    label: 'Category',
                    width: 120,
                    sortable: true
                },
                { 
                    key: 'image', 
                    labelHtml: '<span class="material-symbols-outlined">imagesmode</span>',
                    label: 'I',
                    width: 1,
                    sortable: false
                },
                { 
                    key: 'itemNumber', 
                    label: 'Item#',
                    type: 'item',
                    sortable: true
                },
                { 
                    key: 'description', 
                    label: 'Description',
                    editable: false,
                    details: true,
                    sortable: true
                },
                { 
                    key: 'notes', 
                    label: 'Notes',
                    editable: false,
                    details: true,
                    sortable: false
                },
                { 
                    key: 'quantity', 
                    label: 'Qty',
                    format: 'number',
                    editable: false,
                    autoColor: false,
                    sortable: true
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
        isAnalyzing() {
            return this.inventoryStore?.isAnalyzing || false;
        },
        error() {
            return this.inventoryStore?.error || null;
        },
        loadingMessage() {
            return this.isAnalyzing ? this.inventoryStore?.analyzingMessage : this.inventoryStore?.loadingMessage || 'Loading all inventory data...';
        }
    },
    async mounted() {
        await this.initializeInventoryStore();
    },
    methods: {
        async initializeInventoryStore() {
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
                    Priority.BACKGROUND, // Images are visual enhancements, lowest priority
                    false,
                    false // nonessential
                )
            ];
            
            // Initialize reactive store using the new API method
            // Note: autoLoad is true by default, so data will load automatically
            this.inventoryStore = getReactiveStore(
                Requests.getAllInventoryData,
                null, // No save function (read-only)
                [todayISOString()], // Apply pending changes as of today
                analysisConfig
            );
            
            // Don't call load() here - autoLoad=true handles it automatically
            // Calling load() again would cause a race condition or double-load
        },
        async handleRefresh() {
            // Reload all inventory data using reactive store
            invalidateCache([
                { namespace: 'database', methodName: 'getData', args: ['INVENTORY'] }
            ], true);
        },
        handleCellEdit(rowIdx, colIdx, value) {
            // Read-only for overview table
            this.$modal.alert('This overview table is read-only. Navigate to specific categories to edit items.', 'Info');
        },
        async handleSave() {
            // No save functionality for overview table
            this.$modal.alert('This overview table is read-only. No changes to save.', 'Info');
        },
        formatCategoryLabel(tabName) {
            if (!tabName) return '';
            const lower = tabName.toLowerCase();
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        },

        getPendingEntries(item) {
            const eh = item?.edithistory || item?.EditHistory;
            return EditHistoryUtils.getPendingEntries(eh);
        },

        formatPendingDate(deciseconds) {
            return new Date(deciseconds * 100).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
    },
    template: html `
        <slot>
            <TableComponent
                ref="tableComponent"
                theme="purple"
                :data="tableData"
                title="All Inventory Overview"
                :originalData="originalData"
                :columns="columns"
                :default-sort-column="['tab', 'itemNumber']"
                :isLoading="isLoading"
                :isAnalyzing="isAnalyzing"
                :error="error"
                :showRefresh="false"
                :showSearch="true"
                :syncSearchWithUrl="true"
                :container-path="containerPath"
                :navigateToPath="$emit.bind(this, 'navigate-to-path')"
                :viewModes="viewModes"
                :showHeader="true"
                :showFooter="true"
                :allowDetails="true"
                emptyMessage="No inventory items found across all categories"
                :loading-message="loadingMessage"
                @refresh="handleRefresh"
                @cell-edit="handleCellEdit"
                @on-save="handleSave"
            >
                <template #header-area>
                    <div class="button-bar" style="display: none;"></div>
                </template>
                <template #default="{ row, column, rowIndex, cellRowIndex, cellColIndex }">
                    <button 
                        v-if="column.key === 'tab'"
                        @click="$emit('navigate-to-path', 'inventory/' + row.tab.toLowerCase())"
                        class="card purple"
                    >
                        {{ formatCategoryLabel(row.tab) }}
                    </button>
                    <ItemImageComponent 
                        v-if="column.key === 'image'"
                        :imageSize="32"
                        :itemNumber="row.itemNumber"
                        :imageUrl="row.AppData?.imageUrl"
                    />
                </template>
                <template #row-details="{ row }">
                    <div v-if="getPendingEntries(row).length > 0" class="pending-changes-section">
                        <div
                            v-for="(entry, i) in getPendingEntries(row)"
                            :key="i"
                            class="pending-entry"
                        >
                            <span class="pending-meta">
                                <strong>{{ formatPendingDate(entry.t) }}</strong>
                                <span v-if="entry.s"> &mdash; {{ entry.s }}</span>
                                <span class="pending-user"> ({{ entry.u }})</span>
                            </span>
                            <div class="pending-changes">
                                <span
                                    v-for="ch in entry.c"
                                    :key="ch.n"
                                    class="pending-change-chip"
                                >
                                    {{ ch.n }}: {{ row[ch.n] }} &rarr; {{ ch.ne }}
                                </span>
                            </div>
                        </div>
                    </div>
                </template>
            </TableComponent>
        </slot>
    `
};
