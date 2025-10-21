import { html, TableComponent, Requests, getReactiveStore, createAnalysisConfig, NavigationRegistry, ItemImageComponent } from '../../index.js';

/**
 * Component for displaying item quantities summary with progressive analysis
 * Shows: Item ID, Quantity, Available, Remaining, Overlapping Shows
 */
export const PacklistItemsSummary = {
    components: { TableComponent, ItemImageComponent },
    props: {
        projectIdentifier: { type: String, required: true },
        containerPath: { type: String, default: '' }
    },
    inject: ['appContext'],
    data() {
        return {
            itemsSummaryStore: null,
            error: null,
            NavigationRegistry // Make NavigationRegistry available in template
        };
    },
    computed: {
        tableColumns() {
            return [
                { 
                    key: 'image', 
                    label: 'IMG',
                    width: 1,
                },
                { key: 'itemId', label: 'Item#'},
                { key: 'quantity', label: 'Quantity'},
                { key: 'available', label: 'Inv. Qty.'},
                { key: 'tabName', label: 'Tab'},
                { 
                    key: 'remaining', 
                    label: 'Remaining', 
                    format: 'number',
                    autoColor: true
                },
                { key: 'overlappingShows', label: 'Overlapping Shows'}
            ];
        },
        isLoading() {
            return this.itemsSummaryStore ? this.itemsSummaryStore.isLoading : false;
        },
        tableData() {
            return this.itemsSummaryStore ? this.itemsSummaryStore.data : [];
        }
    },
    watch: {
        projectIdentifier: {
            immediate: true,
            handler(newProjectId) {
                if (newProjectId) {
                    this.initializeStore();
                }
            }
        }
    },
    methods: {
        initializeStore() {
            if (!this.projectIdentifier) return;

            // Progressive analysis configuration
            const analysisConfig = [
                // First Analysis: Get inventory tab name for each item
                createAnalysisConfig(
                    Requests.getTabNameForItem,
                    'tabName',
                    'Getting inventory tab names...',
                    ['itemId'], // Use itemId as source
                    [],
                    'tabName' // Store result in 'tabName' column
                ),

                // Second Analysis: Get inventory quantities for each item
                createAnalysisConfig(
                    Requests.getItemInventoryQuantity,
                    'available',
                    'Checking inventory quantities...',
                    ['itemId'], // Use itemId as source
                    [],
                    'available' // Store result in 'available' column
                ),

                // Third Analysis: Find overlapping shows for each item
                createAnalysisConfig(
                    (itemId, currentProjectId) => Requests.getItemOverlappingShows(currentProjectId, itemId),
                    'overlappingShows',
                    'Finding overlapping shows...',
                    ['itemId'], // Use itemId as source
                    [this.projectIdentifier], // Pass current project as additional parameter
                    'overlappingShows' // Store result in 'overlappingShows' column
                ),

                // Fourth Analysis: Calculate remaining quantities
                createAnalysisConfig(
                    (itemId, currentProjectId) => Requests.calculateRemainingQuantity(currentProjectId, itemId),
                    'remaining',
                    'Calculating remaining quantities...',
                    ['itemId'], // Use itemId as source
                    [this.projectIdentifier], // Pass current project as additional parameter
                    'remaining' // Store result in 'remaining' column
                )
            ];

            // Create reactive store with progressive analysis
            this.itemsSummaryStore = getReactiveStore(
                Requests.getItemQuantitiesSummary,
                null, // No save function - read-only data
                [this.projectIdentifier],
                analysisConfig
            );

            this.error = this.itemsSummaryStore.error;
        },

        async handleRefresh() {
            if (this.itemsSummaryStore) {
                await this.itemsSummaryStore.load('Refreshing item summary...');
            }
        },

        navigateBackToPacklist() {
            if (this.projectIdentifier && this.appContext?.navigateToPath) {
                this.appContext.navigateToPath('packlist/' + this.projectIdentifier);
            }
        }
    },
    template: html`
        <div class="packlist-items-summary">
            
            <TableComponent
                :data="tableData"
                :columns="tableColumns"
                :hide-columns="['tabName']"
                :show-search="true"
                :hide-rows-on-search="false"
                :readonly="true"
                :is-loading="itemsSummaryStore ? itemsSummaryStore.isLoading : false"
                :is-analyzing="itemsSummaryStore ? itemsSummaryStore.isAnalyzing : false"
                :loading-message="itemsSummaryStore && itemsSummaryStore.isLoading ? itemsSummaryStore.analysisMessage.loadingMessage : itemsSummaryStore.analysisMessage"
                :loading-progress="itemsSummaryStore && itemsSummaryStore.isAnalyzing ? itemsSummaryStore.analysisProgress : -1"
                empty-message="No item data available"
                class="items-summary-table"
                @refresh="handleRefresh"
            >
                <template #table-header-area>
                    <button @click="navigateBackToPacklist">
                        Back
                    </button>
                </template>
                <template #default="{ row, column }">
                    <div v-if="column.key === 'image'">
                        <ItemImageComponent 
                            :imageSize="48"
                            :itemNumber="row.itemId"
                        />
                    </div>
                    <div v-else-if="column.key === 'itemId'">
                        <button v-if="row.tabName" 
                                @click="appContext.navigateToPath(NavigationRegistry.buildPath('inventory/categories/' + row.tabName, { searchTerm: row.itemId }))"
                                class="purple"
                                :title="'Search for ' + row.itemId + ' in ' + row.tabName">
                            {{ row.itemId }}
                        </button>
                        <span v-else>{{ row.itemId }}</span>
                    </div>
                    <div v-else-if="column.key === 'overlappingShows'">
                        <div v-if="!Array.isArray(row.overlappingShows) || row.overlappingShows.length === 0">
                            None
                        </div>
                        <div v-else class="overlapping-shows-buttons">
                            <button v-for="packlistId in row.overlappingShows" 
                                    :key="packlistId"
                                    @click="appContext.navigateToPath('packlist/' + packlistId)"
                                    class="card white">
                                {{ packlistId }}
                            </button>
                        </div>
                    </div>
                    <div v-else-if="column.key === 'remaining'">
                        {{ row.remaining !== null ? row.remaining : '...' }}
                    </div>
                    <div v-else-if="column.key === 'available'">
                        {{ row.available !== null ? row.available : '...' }}
                    </div>
                    <div v-else-if="column.key === 'tabName'">
                        {{ row.tabName !== null ? row.tabName : '...' }}
                    </div>
                    <div v-else>
                        {{ row[column.key] }}
                    </div>
                </template>
            </TableComponent>
        </div>
        `
};