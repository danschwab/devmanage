import { html, Requests, TableComponent, getReactiveStore, ItemImageComponent, invalidateCache, EditHistoryUtils, todayISOString, NavigationRegistry } from '../../index.js';

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
            suppressedTabs: new Set(),
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
                // { 
                //     key: 'description', 
                //     label: 'Description',
                //     editable: false,
                //     details: true,
                //     sortable: true
                // },
                // { 
                //     key: 'notes', 
                //     label: 'Notes',
                //     editable: false,
                //     details: true,
                //     sortable: false
                // },
                { 
                    key: 'quantity', 
                    label: 'Qty',
                    format: 'number',
                    editable: false,
                    autoColor: false,
                    sortable: true
                },
                {
                    key: '_navigate',
                    labelHtml: '<span class="material-symbols-outlined">calendar_month</span>',
                    label: '',
                    width: 36,
                    sortable: false
                }
            ],
            inventoryStore: null, // Reactive store for aggregated inventory
        };
    },
    computed: {
        tableData() {
            const data = this.inventoryStore?.data || [];
            if (!this.suppressedTabs.size) return data;
            return data.filter(item => !this.suppressedTabs.has(item.tab));
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
            return this.isAnalyzing ? this.inventoryStore?.analysisMessage : this.inventoryStore?.loadingMessage || 'Loading all inventory data...';
        }
    },
    async mounted() {
        await this.initializeInventoryStore();
    },
    methods: {
        async initializeInventoryStore() {
            // Load index to determine which tabs should be hidden from the overview
            // Hide only tabs where all prefixes have descriptionOnly=true
            Requests.getInventoryIndexData().then(indexData => {
                if (!Array.isArray(indexData)) return;
                const tabConfigs = new Map();
                indexData.forEach(row => {
                    if (!row?.tab) return;
                    if (!tabConfigs.has(row.tab)) tabConfigs.set(row.tab, { hasAny: false, allDescOnly: true });
                    const cfg = tabConfigs.get(row.tab);
                    cfg.hasAny = true;
                    if (row.metadata?.descriptionOnly !== 'true') cfg.allDescOnly = false;
                });
                const hidden = new Set();
                tabConfigs.forEach((cfg, tab) => { if (cfg.hasAny && cfg.allDescOnly) hidden.add(tab); });
                this.suppressedTabs = hidden;
            }).catch(() => {});

            // Initialize reactive store using the new API method
            // Note: autoLoad is true by default, so data will load automatically
            this.inventoryStore = getReactiveStore(
                Requests.getAllInventoryData,
                null, // No save function (read-only)
                [todayISOString()] // Apply pending changes as of today
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
        },

        navigateToItemTimeline(row) {
            if (!row.itemNumber || !row.tab) return;
            const path = `inventory/${row.tab.toLowerCase()}/${row.itemNumber}`;
            this.$emit('navigate-to-path', path);
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
                :allowDetails="false"
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
                    <button
                        v-else-if="column.key === '_navigate'"
                        class="button-symbol purple"
                        @click.stop="navigateToItemTimeline(row)"
                        title="View item timeline"
                    >☷</button>
                    <ItemImageComponent 
                        v-if="column.key === 'image'"
                        :imageSize="32"
                        :itemNumber="row.itemNumber"
                    />
                </template>
                <!-- <template #row-details="{ row }">
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
                </template> -->
            </TableComponent>
        </slot>
    `
};
