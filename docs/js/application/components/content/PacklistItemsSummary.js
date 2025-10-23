import { html, TableComponent, Requests, getReactiveStore, createAnalysisConfig, NavigationRegistry, ItemImageComponent } from '../../index.js';

/**
 * Component for displaying item quantities summary with progressive analysis
 * Shows: Item ID, Quantity, Available, Remaining, Overlapping Shows
 */
export const PacklistItemsSummary = {
    components: { TableComponent, ItemImageComponent },
    props: {
        projectIdentifier: { type: String, required: true },
        containerPath: { type: String, default: '' },
        showDetailsVisible: {
            type: Array,
            default: () => ['Ship', 'S. Start', 'S. End', 'Expected Return Date', 'City', 'Size', 'Booth#', 'S/U IN SHOP']
        }
    },
    inject: ['appContext'],
    data() {
        return {
            itemsSummaryStore: null,
            showDetails: null, // Production schedule show details
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
        },
        // Navigation-based parameters from NavigationRegistry
        navParams() {
            let path = this.containerPath;
            if (!path && this.projectIdentifier) {
                path = `packlist/${this.projectIdentifier}/details`;
            }
            return NavigationRegistry.getNavigationParameters(path || '');
        },
        // Get search term from URL parameters
        initialSearchTerm() {
            return this.navParams?.searchTerm || '';
        }
    },
    watch: {
        projectIdentifier: {
            immediate: true,
            handler(newProjectId) {
                if (newProjectId) {
                    this.initializeStore();
                    this.loadShowDetails();
                }
            }
        }
    },
    methods: {
        initializeStore() {
            if (!this.projectIdentifier) return;

            const analysisConfig = [
                createAnalysisConfig(
                    Requests.getTabNameForItem,
                    'tabName',
                    'Getting inventory tab names...',
                    ['itemId'],
                    [],
                    'tabName'
                ),
                createAnalysisConfig(
                    Requests.getItemInventoryQuantity,
                    'available',
                    'Checking inventory quantities...',
                    ['itemId'],
                    [],
                    'available'
                ),
                createAnalysisConfig(
                    (itemId, currentProjectId) => Requests.getItemOverlappingShows(currentProjectId, itemId),
                    'overlappingShows',
                    'Finding overlapping shows...',
                    ['itemId'],
                    [this.projectIdentifier],
                    'overlappingShows'
                ),
                createAnalysisConfig(
                    (itemId, currentProjectId) => Requests.calculateRemainingQuantity(currentProjectId, itemId),
                    'remaining',
                    'Calculating remaining quantities...',
                    ['itemId'],
                    [this.projectIdentifier],
                    'remaining'
                )
            ];

            this.itemsSummaryStore = getReactiveStore(
                Requests.getItemQuantitiesSummary,
                null,
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
                this.appContext.navigateToPath(`packlist/${this.projectIdentifier}`);
            }
        },

        async loadShowDetails() {
            if (!this.projectIdentifier) return;
            
            try {
                this.showDetails = await Requests.getShowDetails(this.projectIdentifier);
            } catch (err) {
                console.error('Error loading show details:', err);
                this.showDetails = null;
            }
        }
    },
    template: html`
        <div class="packlist-items-summary">
            <div class="content">
                <div class="details-grid">
                    <div v-for="key in showDetailsVisible" :key="key" class="detail-item">
                        <label>{{ key }}:</label>
                        <span v-if="showDetails">{{ showDetails[key] || '—' }}</span>
                        <span v-else>...</span>
                    </div>
                </div>
            </div>
            
            <TableComponent
                :data="tableData"
                :columns="tableColumns"
                :hide-columns="['tabName']"
                :show-search="true"
                :search-term="initialSearchTerm"
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
