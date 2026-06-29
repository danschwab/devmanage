import { html, TableComponent, Requests, getReactiveStore, createAnalysisConfig, NavigationRegistry, ItemImageComponent, InventoryCategoryFilter, Priority, invalidateCache, todayISOString, OverlappingShowsModal } from '../../index.js';

/**
 * Component for displaying item quantities summary with progressive analysis
 * Shows: Item ID, Quantity, Available, Remaining, Overlapping Shows
 */
export const PacklistItemsSummary = {
    components: { TableComponent, ItemImageComponent, InventoryCategoryFilter, OverlappingShowsModal },
    props: {
        projectIdentifier: { type: String, required: true },
        containerPath: { type: String, default: '' },
        showDetailsVisible: {
            type: Array,
            default: () => ['Ship', 'S. Start', 'S. End', 'Expected Return Date', 'City', 'Size', 'Booth#', 'S/U IN SHOP']
        }
    },
    inject: ['appContext', '$modal'],
    data() {
        return {
            itemsSummaryStore: null,
            showDetails: null, // Production schedule show details
            projectShipDate: null,
            projectReturnDate: null,
            error: null,
            selectedCategoryFilter: null, // Filter by inventory category
            NavigationRegistry // Make NavigationRegistry available in template
        };
    },
    computed: {
        tableColumns() {
            return [
                { 
                    key: 'image', 
                    labelHtml: '<span class="material-symbols-outlined">imagesmode</span>',
                    label: 'IMG',
                    width: 1,
                    sortable: false
                },
                { key: 'itemId', label: 'Item#', type: 'item', sortable: true},
                { key: 'quantity', label: 'Quantity', sortable: true},
                { key: 'available', label: 'Inv. Qty.', sortable: true},
                { key: 'tabName', label: 'Tab', sortable: true},
                { 
                    key: 'remaining', 
                    label: 'Remaining', 
                    format: 'number',
                    autoColor: true,
                    sortable: true
                },
                { key: 'overlappingShows', label: 'Overlapping Shows', sortable: false, columnClass: 'gray' }
            ];
        },
        isLoading() {
            return this.itemsSummaryStore ? this.itemsSummaryStore.isLoading : false;
        },
        tableData() {
            const data = this.itemsSummaryStore ? this.itemsSummaryStore.data : [];
            
            // Apply category filter if selected
            if (this.selectedCategoryFilter) {
                return data.filter(item => item.tabName === this.selectedCategoryFilter);
            }
            
            return data;
        },

        currentSearchText() {
            const params = NavigationRegistry.getParametersForContainer(
                this.containerPath || ('packlist/' + this.projectIdentifier + '/details'),
                this.appContext?.currentPath
            );
            return params?.searchText || '';
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
        async initializeStore() {
            if (!this.projectIdentifier) return;

            // Fetch ship/return dates so inventory quantities reflect state at time of packing
            const [shipDate, returnDate] = await Promise.all([
                Requests.getProjectShipDate(this.projectIdentifier),
                Requests.getProjectReturnDate(this.projectIdentifier)
            ]);
            this.projectShipDate = shipDate || null;
            this.projectReturnDate = returnDate || null;
            const referenceDate = shipDate || todayISOString();

            const analysisConfig = [
                createAnalysisConfig(
                    Requests.getTabNameForItem,
                    'tabName',
                    'Getting inventory tab names...',
                    ['itemId'],
                    [],
                    'tabName',
                    false,
                    Priority.USER_ACTION // Used for navigation buttons
                ),
                createAnalysisConfig(
                    Requests.getItemInventoryQuantity,
                    'available',
                    'Checking inventory quantities...',
                    ['itemId'],
                    [referenceDate],
                    'available'
                ),
                createAnalysisConfig(
                    (itemId, currentProjectId) => Requests.getItemOverlappingPacklists(currentProjectId, itemId),
                    'overlappingShows',
                    'Finding overlapping shows...',
                    ['itemId'],
                    [this.projectIdentifier],
                    'overlappingShows',
                    false,
                    Priority.USER_ACTION // Used for navigation buttons
                ),
                createAnalysisConfig(
                    Requests.getItemMinQuantityInRange,
                    'remaining',
                    'Calculating remaining quantities...',
                    ['itemId'],
                    [this.projectShipDate, this.projectReturnDate],
                    'remaining'
                ),
                createAnalysisConfig(
                    Requests.getItemImageUrl,
                    'imageUrl',
                    'Loading item images...',
                    ['itemId'], // Extract itemId from row
                    [],
                    null, // Store in AppData, not a column
                    false,
                    Priority.BACKGROUND // Images are visual enhancements, lowest priority
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
            invalidateCache([
                { namespace: 'database', methodName: 'getData', args: ['PACK_LISTS', this.projectIdentifier] }
            ], true);
        },

        navigateToItemPage(row) {
            if (!row.tabName || !row.itemId) return;
            const basePath = `inventory/${row.tabName.toLowerCase()}/${row.itemId}`;
            const dateFilters = (this.projectShipDate && this.projectReturnDate)
                ? [
                    { column: 'Date', value: this.projectShipDate,  type: 'after'  },
                    { column: 'Date', value: this.projectReturnDate, type: 'before' }
                  ]
                : null;
            const finalPath = dateFilters
                ? NavigationRegistry.buildPath(basePath, { dateFilters })
                : basePath;
            this.appContext.navigateToPath(finalPath);
        },

        handleCategorySelected(categoryName) {
            this.selectedCategoryFilter = categoryName;
        },

        navigateBackToPacklist() {
            if (!this.projectIdentifier || !this.appContext?.navigateToPath) return;
            
            // Guard: Only navigate if we're still on the details page
            const currentPath = this.appContext.currentPath?.split('?')[0] || '';
            const expectedPath = `packlist/${this.projectIdentifier}/details`;
            
            if (!currentPath.includes(expectedPath)) {
                //console.log('[PacklistItemsSummary] Skipping navigation - user already navigated away');
                return;
            }
            
            this.appContext.navigateToPath(`packlist/${this.projectIdentifier}`);
        },

        async loadShowDetails() {
            if (!this.projectIdentifier) return;
            
            try {
                this.showDetails = await Requests.getShowDetails(this.projectIdentifier);
            } catch (err) {
                console.error('Error loading show details:', err);
                this.showDetails = null;
            }
        },

        openOverlappingShowsModal(shows) {
            this.$modal.custom(OverlappingShowsModal, { shows, modalClass: 'hamburger-menu small-menu'}, `${shows.length} Overlapping Shows`, { modalClass: 'hamburger-menu' });
        },

        showsMatchSearch(shows) {
            if (!this.currentSearchText || !this.currentSearchText.trim() || !Array.isArray(shows)) {
                return false;
            }
            const searchWords = this.currentSearchText.toLowerCase().trim().split(/\s+/).filter(word => word.length > 0);
            const showsText = shows.join(' ').toLowerCase();
            return searchWords.some(word => showsText.includes(word));
        }
    },
    template: html`
        <slot class="packlist-items-summary">
                <!--button @click="navigateBackToPacklist" class="small">Back</button-->

            <div class="details-grid">
                <div v-for="key in showDetailsVisible" :key="key" class="detail-item">
                    <label>{{ key }}:</label>
                    <span v-if="showDetails">{{ showDetails[key] || '—' }}</span>
                    <span v-else>...</span>
                </div>
            </div>
            
            <TableComponent
                :data="tableData"
                :columns="tableColumns"
                :hide-columns="['tabName']"
                :show-search="true"
                :showRefresh="false"
                :sync-search-with-url="true"
                :container-path="containerPath || 'packlist/' + projectIdentifier + '/details'"
                :navigate-to-path="appContext.navigateToPath"
                :hide-rows-on-search="false"
                :readonly="true"
                :is-loading="itemsSummaryStore ? itemsSummaryStore.isLoading : false"
                :is-analyzing="itemsSummaryStore ? itemsSummaryStore.isAnalyzing : false"
                :loading-message="itemsSummaryStore && itemsSummaryStore.isLoading ? itemsSummaryStore.analysisMessage.loadingMessage : (itemsSummaryStore ? itemsSummaryStore.analysisMessage : null)"
                :loading-progress="itemsSummaryStore && itemsSummaryStore.isAnalyzing ? itemsSummaryStore.analysisProgress : -1"
                empty-message="No item data available"
                class="items-summary-table"
                @refresh="handleRefresh"
            >
                <template #header-area>
                    <InventoryCategoryFilter
                        :container-path="containerPath || ('packlist/' + projectIdentifier + '/details')"
                        :navigate-to-path="appContext.navigateToPath"
                        @category-selected="handleCategorySelected"
                    />
                </template>
                <template #default="{ row, column }">
                    <slot v-if="column.key === 'image'">
                        <ItemImageComponent 
                            :imageSize="48"
                            :itemNumber="row.itemId"
                            :imageUrl="row.AppData && row.AppData.imageUrl"
                        />
                    </slot>
                    <slot v-else-if="column.key === 'itemId'">
                        <button v-if="row.tabName" 
                                @click="navigateToItemPage(row)"
                                class="purple card"
                                :title="'View timeline for ' + row.itemId">
                            {{ row.itemId }}
                        </button>
                        <span v-else>{{ row.itemId }}</span>
                    </slot>
                    <slot v-else-if="column.key === 'overlappingShows'">
                        <slot v-if="!Array.isArray(row.overlappingShows) || row.overlappingShows.length === 0">
                            —
                        </slot>
                        <slot v-else-if="row.overlappingShows.length <= 4" class="overlapping-shows-buttons">
                            <button v-for="packlistId in row.overlappingShows" 
                                    :key="packlistId"
                                    @click="appContext.navigateToPath('packlist/' + packlistId + '/details')"
                                    class="card white">
                                {{ packlistId }}
                            </button>
                        </slot>
                        <slot v-else>
                            <span style="position: absolute; left: -9999px; opacity: 0; pointer-events: none;">{{ row.overlappingShows.join(' ') }}</span>
                            <button @click="openOverlappingShowsModal(row.overlappingShows)" 
                                    :class="['card', 'white', 'font-black', showsMatchSearch(row.overlappingShows) ? 'search-highlight' : '']">
                                {{ row.overlappingShows.length }} shows
                            </button>
                        </slot>
                    </slot>
                    <!--div v-else-if="column.key === 'remaining'">
                        {{ row.remaining !== null ? row.remaining : '...' }}
                    </div>
                    <div v-else-if="column.key === 'available'">
                        {{ row.available !== null ? row.available : '...' }}
                    </div>
                    <div v-else-if="column.key === 'tabName'">
                        {{ row.tabName !== null ? row.tabName : '...' }}
                    </div-->
                    <div v-else>
                        {{ row[column.key] }}
                    </div>
                </template>
            </TableComponent>
        </slot>
        `
};
