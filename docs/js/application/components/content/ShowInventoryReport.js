import { html, TableComponent, Requests, getReactiveStore, createAnalysisConfig, NavigationRegistry, ItemImageComponent, authState, parseDateSearchParameter } from '../../index.js';

/**
 * Component for displaying inventory report across multiple shows
 * Shows: Item ID, Inventory Qty, quantities for each show, Remaining
 */
export const ShowInventoryReport = {
    components: { TableComponent, ItemImageComponent },
    props: {
        containerPath: { type: String, default: '' },
        navigateToPath: Function
    },
    data() {
        return {
            savedSearchesStore: null,
            reportStore: null,
            selectedSearch: '',
            showIdentifiers: [], // List of show IDs from search
            error: null,
            NavigationRegistry // Make NavigationRegistry available in template
        };
    },
    computed: {
        // Dynamic table columns based on loaded shows
        tableColumns() {
            const baseColumns = [
                { 
                    key: 'image', 
                    label: 'IMG',
                    width: 1,
                },
                { key: 'itemId', label: 'Item#' },
                { key: 'available', label: 'Inv Qty.' },
            ];
            
            // Add dynamic show columns (narrow width)
            const showColumns = this.showIdentifiers.map(showId => ({
                key: `show_${showId}`,
                label: showId,
                width: 1,
                format: 'number'
            }));
            
            // Add remaining column with custom cellClass function
            const finalColumns = [
                {
                    key: 'remaining',
                    label: 'Remaining',
                    format: 'number',
                    cellClass: (value, row) => {
                        // Compute remaining on the fly
                        const remaining = this.calculateRemaining(row);
                        if (remaining === null || remaining === undefined) return '';
                        if (remaining < 0) return 'red';
                        if (remaining < 5) return 'orange';
                        return '';
                    }
                }
            ];
            
            return [...baseColumns, ...showColumns, ...finalColumns];
        },
        
        savedSearches() {
            return this.savedSearchesStore?.data || [];
        },
        
        isLoading() {
            return this.reportStore?.isLoading || false;
        },
        
        isAnalyzing() {
            return this.reportStore?.isAnalyzing || false;
        },
        
        tableData() {
            return this.reportStore?.data || [];
        },

        // Navigation-based parameters from NavigationRegistry
        navParams() {
            return NavigationRegistry.getNavigationParameters(this.containerPath || 'inventory/reports/show-inventory');
        },

        // Get search term from URL parameters
        initialSearchTerm() {
            return this.navParams?.searchTerm || '';
        }
    },
    watch: {
        selectedSearch(newVal) {
            if (newVal) {
                this.handleSearchSelection();
            }
        }
    },
    methods: {
        async initializeSavedSearchesStore() {
            // Only initialize store if user is authenticated
            if (!authState.isAuthenticated || !authState.user?.email) {
                console.log('[ShowInventoryReport] User not authenticated, skipping saved searches initialization');
                return;
            }
            
            // Initialize reactive store using the same pattern as ScheduleContent
            this.savedSearchesStore = getReactiveStore(
                Requests.getUserData,
                Requests.storeUserData,
                [authState.user.email, 'saved_searches'],
                null, // No analysis config
                true // Auto-load
            );
            
            // Ensure default searches exist after store loads
            if (this.savedSearchesStore.isLoading) {
                // Wait for initial load to complete
                await new Promise(resolve => {
                    const checkLoading = setInterval(() => {
                        if (!this.savedSearchesStore.isLoading) {
                            clearInterval(checkLoading);
                            resolve();
                        }
                    }, 50);
                });
            }
            
            // Initialize defaults if no searches exist
            if (!this.savedSearchesStore.data || this.savedSearchesStore.data.length === 0) {
                const defaultSearches = [
                    {
                        name: 'Upcoming',
                        dateSearch: '0,30', // Today to 30 days in the future
                        textFilters: []
                    }
                ];
                this.savedSearchesStore.data = defaultSearches;
                await this.savedSearchesStore.save();
            }
        },

        async loadShowsFromSearch(searchData) {
            if (!searchData) return;
            
            // Parse search to get date filter and search params
            const filter = {};
            const searchParams = {};
            
            if (searchData.dateSearch) {
                const dateFilter = parseDateSearchParameter(searchData.dateSearch);
                
                // Check if this is an overlap search (has overlapShowIdentifier)
                if (dateFilter.overlapShowIdentifier) {
                    // Convert overlapShowIdentifier to identifier for API
                    filter.identifier = dateFilter.overlapShowIdentifier;
                } else {
                    // Regular date filter
                    Object.assign(filter, dateFilter);
                }
            }
            
            // Apply text filters
            if (searchData.textFilters && searchData.textFilters.length > 0) {
                searchData.textFilters.forEach(textFilter => {
                    if (textFilter.column && textFilter.value) {
                        searchParams[textFilter.column] = textFilter.value;
                    }
                });
            }
            
            try {
                // Get overlapping shows based on filter
                const shows = await Requests.getProductionScheduleData(filter, searchParams);
                
                // Extract identifiers from shows
                this.showIdentifiers = shows.map(s => {
                    if (s.Identifier) return s.Identifier;
                    // Compute identifier if not present
                    const show = s.Show || '';
                    const client = s.Client || '';
                    const year = s.Year || '';
                    return `${show}_${client}_${year}`.replace(/\s+/g, '_');
                }).filter(id => id && id !== '__'); // Filter out empty identifiers
                
                console.log('[ShowInventoryReport] Loaded shows:', this.showIdentifiers);
                
                // Initialize report store with these shows
                if (this.showIdentifiers.length > 0) {
                    this.initializeReportStore();
                } else {
                    this.error = 'No shows found for the selected search criteria';
                }
            } catch (err) {
                console.error('[ShowInventoryReport] Error loading shows:', err);
                this.error = 'Failed to load shows: ' + err.message;
            }
        },

        initializeReportStore() {
            if (this.showIdentifiers.length === 0) return;
            
            // Build analysis config (only for tab name and inventory quantity)
            const analysisConfig = [
                // Get inventory tab name for each item
                createAnalysisConfig(
                    Requests.getTabNameForItem,
                    'tabName',
                    'Getting inventory tab names...',
                    ['itemId'],
                    [],
                    'tabName'
                ),
                // Get inventory quantity
                createAnalysisConfig(
                    Requests.getItemInventoryQuantity,
                    'available',
                    'Getting inventory quantities...',
                    ['itemId'],
                    [],
                    'available'
                )
            ];
            
            this.reportStore = getReactiveStore(
                Requests.getMultipleShowsItemsSummary,
                null,
                [this.showIdentifiers],
                analysisConfig,
                true // Auto-load
            );
            
            this.error = null;
        },

        // Calculate remaining quantity for a row
        calculateRemaining(row) {
            if (!row || row.available === null || row.available === undefined) {
                return null;
            }
            
            const totalUsed = Object.values(row.shows || {}).reduce(
                (sum, qty) => sum + (qty || 0), 
                0
            );
            
            return row.available - totalUsed;
        },

        async handleSearchSelection() {
            const searchData = this.savedSearches.find(s => s.name === this.selectedSearch);
            if (searchData) {
                await this.loadShowsFromSearch(searchData);
            }
        },

        loadFromURLParams() {
            const params = this.navParams;
            if (params.savedSearch) {
                this.selectedSearch = params.savedSearch;
                // handleSearchSelection will be triggered by the watch
            }
        },

        async handleRefresh() {
            if (this.reportStore) {
                await this.reportStore.load('Refreshing report...');
            }
        }
    },
    async mounted() {
        await this.initializeSavedSearchesStore();
        this.loadFromURLParams();
    },
    template: html`
        <div class="show-inventory-report">
            <div v-if="error" class="error-message">
                <p>{{ error }}</p>
            </div>

            <TableComponent
                :data="tableData"
                :columns="tableColumns"
                :hide-columns="['tabName']"
                :show-search="true"
                :search-term="initialSearchTerm"
                :hide-rows-on-search="false"
                :readonly="true"
                :is-loading="isLoading"
                :is-analyzing="isAnalyzing"
                :loading-message="reportStore ? reportStore.loadingMessage : 'Loading...'"
                :loading-progress="reportStore && isAnalyzing ? reportStore.analysisProgress : -1"
                empty-message="Select a saved search to load shows and generate report"
                class="show-inventory-report-table"
                @refresh="handleRefresh"
            >
                <template #table-header-area>
                    <div class="button-bar">
                        <select 
                            v-model="selectedSearch"
                            :disabled="!savedSearches || savedSearches.length === 0"
                        >
                            <option value="">Select a saved search...</option>
                            <option 
                                v-for="search in savedSearches" 
                                :key="search.name"
                                :value="search.name"
                            >
                                {{ search.name }}
                            </option>
                        </select>
                        <span v-if="showIdentifiers.length > 0" style="margin-left: 1rem;">
                            {{ showIdentifiers.length }} show{{ showIdentifiers.length !== 1 ? 's' : '' }} loaded
                        </span>
                    </div>
                </template>

                <template #default="{ row, column }">
                    <slot v-if="column.key === 'image'">
                        <ItemImageComponent 
                            :imageSize="48"
                            :itemNumber="row.itemId"
                        />
                    </slot>
                    <slot v-else-if="column.key === 'itemId'">
                        <button v-if="row.tabName" 
                                @click="navigateToPath(NavigationRegistry.buildPath('inventory/categories/' + row.tabName.toLowerCase(), { searchTerm: row.itemId }))"
                                class="purple"
                                :title="'Search for ' + row.itemId + ' in ' + row.tabName">
                            {{ row.itemId }}
                        </button>
                        <span v-else>{{ row.itemId }}</span>
                    </slot>
                    <slot v-else-if="column.key === 'remaining'">
                        {{ calculateRemaining(row) !== null ? calculateRemaining(row) : '—' }}
                    </slot>
                    <slot v-else-if="column.key.startsWith('show_')">
                        <span v-if="row.shows && row.shows[column.key.replace('show_', '')]">
                            {{ row.shows[column.key.replace('show_', '')] }}
                        </span>
                        <span v-else>—</span>
                    </slot>
                    <div v-else>
                        {{ row[column.key] !== null && row[column.key] !== undefined ? row[column.key] : '—' }}
                    </div>
                </template>
            </TableComponent>
        </div>
    `
};
