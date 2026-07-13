import { html, TableComponent, CalendarComponent, Requests, getReactiveStore, createAnalysisConfig, NavigationRegistry, ItemImageComponent, ScheduleFilterSelect, InventoryCategoryFilter, Priority, invalidateCache, toISODateString, todayISOString, offsetToISO, getAutoColorClass, OverlappingShowsModal } from '../../index.js';
import { normalizeFilterValues } from '../../../data_management/utils/helpers.js';

/**
 * Item-centric inventory report.
 * For a filtered date range, shows each item once with:
 *   item# | description | startDate | endDate | Inv Qty | Min Qty | Overlapping Shows
 */
export const InventoryItemReport = {
    components: { TableComponent, CalendarComponent, ItemImageComponent, ScheduleFilterSelect, InventoryCategoryFilter, OverlappingShowsModal },
    inject: ['$modal', 'appContext'],
    props: {
        containerPath: { type: String, default: '' },
        navigateToPath: Function
    },
    data() {
        return {
            reportStore: null,
            referenceDate: null,
            ctgFilter: null,
            searchFilter: null,
            searchParams: null,
            error: null,
            endDate: null,
            qtyFilter: 1,
            hasPerformedInitialSync: false,
            isPrinting: false,
            viewModes: [
                { paramName: 'layout', paramValue: 'calendar', symbol: 'calendar_month', title: 'Switch to calendar view' },
                { paramName: 'layout', paramValue: null, symbol: 'table', title: 'Switch to table view' }
            ],
            NavigationRegistry
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
                { key: 'itemId', label: 'Item#', type: 'item', sortable: true },
                { key: 'description', label: 'Description', details: true, sortable: true },
                { key: 'startDate', label: 'Start', format: 'date', sortable: true },
                { key: 'endDate', label: 'End', format: 'date', sortable: true },
                { key: 'inventoryQty', label: 'Inv Qty', format: 'number', sortable: true },
                {
                    key: 'minQty',
                    label: 'Min Qty',
                    format: 'number',
                    sortable: true,
                    cellClass: (value) => getAutoColorClass(value)
                },
                { key: 'overlappingShows', label: 'Overlapping Shows', sortable: false, columnClass: 'gray' }
            ];
        },

        isLoading() {
            return this.reportStore?.isLoading || false;
        },

        isAnalyzing() {
            return this.reportStore?.isAnalyzing || false;
        },

        tableData() {
            return (this.reportStore?.data || [])
                .map(row => ({
                    ...row,
                    overlappingShows: row.shows ? Object.keys(row.shows).filter(k => (row.shows[k] || 0) > 0) : []
                }))
                .filter(row => {
                    if (row.minQty === null || row.minQty === undefined) return true;
                    return row.minQty < this.qtyFilter;
                });
        },

        loadingMessage() {
            return this.reportStore?.loadingMessage || 'Loading...';
        },

        isCalendarView() {
            return NavigationRegistry.getNavigationParameters(this.containerPath || 'reports/item-shortages').layout === 'calendar';
        },

        calendarColumns() {
            return [
                { key: 'minQty', label: 'Min', width: 40, sortable: false, format: 'number', firstRow: true },
                { key: 'itemId', label: 'Item#', width: 60, sortable: false, firstRow: true },
                { key: 'description', label: 'Description', sortable: false, firstRow: true }
            ];
        },

        calendarData() {
            return this.tableData
                .filter(row => row.startDate)
                .map(row => ({
                    ...row,
                    calendarStart: row.startDate,
                    calendarEnd: row.endDate || row.startDate
                }));
        },

        chipColorClassProvider() {
            return (row) => getAutoColorClass(row.minQty) || 'green';
        },

        emptyMessage() {
            const params = NavigationRegistry.getParametersForContainer(
                this.containerPath || 'reports/item-shortages',
                this.appContext?.currentPath
            );
            const hasSearchParams = params && (params.dateFilters || params.textFilters || params.view);

            if (hasSearchParams && !this.reportStore && !this.isLoading) {
                return 'No packlists found for the selected search criteria';
            }
            if (this.reportStore && !this.isLoading && !this.isAnalyzing && this.tableData.length === 0 && this.ctgFilter) {
                return 'No items were found in this category.';
            }
            if (this.reportStore && !this.isLoading && !this.isAnalyzing && this.tableData.length === 0) {
                return 'No items found for the selected search criteria.';
            }
            return 'Select a schedule filter to load shows and generate report';
        },

        currentSearchText() {
            const params = NavigationRegistry.getParametersForContainer(
                this.containerPath || 'reports/item-shortages',
                this.appContext?.currentPath
            );
            return params?.searchText || '';
        }
    },
    watch: {
        // Watch for URL parameter changes
        'appContext.currentPath': {
            handler(newPath, oldPath) {
                // Skip initial load (handled by mounted)
                if (!oldPath) return;
                
                // Get params for both paths
                const newParams = NavigationRegistry.getParametersForContainer(
                    this.containerPath || 'reports/item-shortages',
                    newPath
                );
                const oldParams = NavigationRegistry.getParametersForContainer(
                    this.containerPath || 'reports/item-shortages',
                    oldPath
                );
                
                // Skip if params haven't actually changed
                if (JSON.stringify(newParams) === JSON.stringify(oldParams)) return;
                
                this.syncWithURL();
            },
            deep: true
        }
    },
    methods: {
        async loadShowsFromSearch(searchData) {
            if (!searchData) {
                this.searchFilter = null;
                this.searchParams = null;
                this.reportStore = null;
                this.error = null;
                return;
            }

            const filter = {};
            const searchParams = {};

            if (searchData.dateFilters && searchData.dateFilters.length > 0) {
                filter.dateFilters = searchData.dateFilters;
            }

            let resolvedStart = searchData?.startDate ?? null;
            let resolvedEnd   = searchData?.endDate   ?? null;
            if (!resolvedStart || !resolvedEnd) {
                const shipAfterFilter  = searchData.dateFilters?.find(f => f.column === 'Ship' && f.type === 'after');
                const shipBeforeFilter = searchData.dateFilters?.find(f => f.column === 'Ship' && f.type === 'before');
                if (!resolvedStart) resolvedStart = offsetToISO(shipAfterFilter?.value);
                if (!resolvedEnd)   resolvedEnd   = offsetToISO(shipBeforeFilter?.value);
            }
            this.referenceDate = resolvedStart ?? todayISOString();
            this.endDate = resolvedEnd ?? null;

            if (searchData.textFilters && searchData.textFilters.length > 0) {
                searchData.textFilters.forEach(textFilter => {
                    if (textFilter.column && (textFilter.values || textFilter.value)) {
                        searchParams[textFilter.column] = {
                            values: normalizeFilterValues(textFilter),
                            type: textFilter.type || 'contains'
                        };
                    }
                });
            }

            this.searchFilter = filter;
            this.searchParams = searchParams;

            try {
                this.initializeReportStore();
            } catch (err) {
                console.error('[InventoryItemReport] Error initializing report:', err);
                this.error = 'Failed to load report: ' + err.message;
            }
        },

        initializeReportStore() {
            if (!this.searchFilter && !this.searchParams) return;

            const analysisConfig = [
                createAnalysisConfig(
                    Requests.getItemInventoryQuantity,
                    'inventoryQty',
                    'Loading inventory quantities...',
                    ['itemId'],
                    [this.referenceDate],
                    'inventoryQty',
                    false,
                    Priority.USER_ACTION
                ),
                createAnalysisConfig(
                    Requests.getTabNameForItem,
                    'tabName',
                    'Getting inventory tab names...',
                    ['itemId'],
                    [],
                    'tabName',
                    false,
                    Priority.USER_ACTION
                ),
                createAnalysisConfig(
                    Requests.getItemDescription,
                    'description',
                    'Loading item descriptions...',
                    ['itemId'],
                    [this.referenceDate],
                    'description',
                    false,
                    Priority.BACKGROUND,
                    undefined,
                    false
                )
            ];

            this.reportStore = getReactiveStore(
                Requests.getMultipleShowsItemsSummary,
                null,
                [this.searchFilter, this.searchParams, this.ctgFilter, false],
                analysisConfig,
                true
            );

            this.error = null;
        },

        async handleSearchSelected(searchData) {
            await this.loadShowsFromSearch(searchData);
        },

        async handleRefresh() {
            invalidateCache([
                { namespace: 'database', methodName: 'getData', args: ['PROD_SCHED', 'Production Schedule'] },
                { namespace: 'database', methodName: 'getData', args: ['INVENTORY'] },
                { namespace: 'database', methodName: 'getData', args: ['PACK_LISTS'] },
                { namespace: 'database', methodName: 'getTabs', args: ['PACK_LISTS'] }
            ]);
            this.reportStore = null;
            this.initializeReportStore();
        },

        navigateToItemPage(row) {
            if (!row.tabName || !row.itemId) return;
            const basePath = `inventory/${row.tabName.toLowerCase()}/${row.itemId}`;
            const dateFilters = (row.startDate || row.endDate)
                ? [
                    ...(row.startDate ? [{ column: 'Date', value: row.startDate, type: 'after'  }] : []),
                    ...(row.endDate   ? [{ column: 'Date', value: row.endDate,   type: 'before' }] : [])
                  ]
                : null;
            const finalPath = dateFilters
                ? NavigationRegistry.buildPath(basePath, { dateFilters })
                : basePath;
            this.navigateToPath(finalPath);
        },

        handleCategorySelected(categoryName) {
            this.ctgFilter = categoryName || null;
            if (this.searchFilter || this.searchParams) {
                this.initializeReportStore();
            }
        },

        handleMinThresholdChange(event) {
            const value = parseInt(event.target.value, 10);
            if (!isNaN(value)) {
                this.qtyFilter = value;
                this.updateURL(value);
            }
        },

        updateURL(threshold) {
            const cleanPath = (this.containerPath || 'reports/item-shortages').split('?')[0];
            const isOnDashboard = this.appContext?.currentPath?.split('?')[0].split('/')[0] === 'dashboard';
            
            // Build new path with qtyFilter parameter
            const newPath = NavigationRegistry.buildPathWithCurrentParams(
                cleanPath,
                this.appContext?.currentPath,
                {
                    qtyFilter: threshold !== 1 ? threshold : undefined // undefined removes the parameter when it's the default
                }
            );
            
            if (isOnDashboard) {
                // Update dashboard registry with new path
                NavigationRegistry.dashboardRegistry.updatePath(
                    cleanPath,
                    newPath
                );
            } else if (this.navigateToPath) {
                this.navigateToPath(newPath);
            }
        },

        syncWithURL() {
            const params = NavigationRegistry.getParametersForContainer(
                this.containerPath || 'reports/item-shortages',
                this.appContext?.currentPath
            );
            
            // Get qtyFilter from URL params (default to 1 if not present)
            const thresholdFromUrl = params?.qtyFilter !== undefined ? parseInt(params.qtyFilter, 10) : 1;
            
            // Update threshold value
            if (!isNaN(thresholdFromUrl)) {
                this.qtyFilter = thresholdFromUrl;
            }
        },

        async handlePrint() {
            // If not on the item shortage report page, navigate to it first
            if (this.navigateToPath) {
                this.navigateToPath(this.containerPath || 'reports/item-shortages');
            }

            this.isPrinting = true;

            // Wait for DOM update
            await this.$nextTick();
            
            // Print
            window.print();
            
            // Restore state after printing
            setTimeout(() => {
                this.isPrinting = false;
            }, 100);
        },

        openOverlappingShowsModal(shows) {
            this.$modal.custom(OverlappingShowsModal, { shows, modalClass: 'hamburger-menu small-menu' }, `${shows.length} Overlapping Shows`, { modalClass: 'hamburger-menu' });
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
    mounted() {
        const params = NavigationRegistry.getParametersForContainer(
            this.containerPath || 'reports/item-shortages',
            this.appContext?.currentPath
        );
        //console.log('[InventoryItemReport] Initial URL parameters:', params);
        //console.log('[InventoryItemReport] Waiting for child components to sync with URL...');
        
        // Perform initial sync with URL
        this.hasPerformedInitialSync = true;
        this.syncWithURL();
    },
    template: html`
        <div>
            <!-- Print-only Header -->
            <div class="print-header">
                <img src="assets/logo.png" alt="Top Shelf Exhibits Logo" class="print-logo" />
                <h1>Item Shortage Report</h1>
                <span class="page-number"></span>
            </div>

            <div v-if="error" class="card red">
                <p>{{ error }}</p>
            </div>

            <CalendarComponent
                v-if="isCalendarView"
                :data="calendarData"
                :columns="calendarColumns"
                event-start-column="calendarStart"
                event-end-column="calendarEnd"
                :chip-color-class="chipColorClassProvider"
                :is-loading="isLoading"
                :is-analyzing="isAnalyzing"
                :loading-message="loadingMessage"
                :loading-progress="reportStore && isAnalyzing ? reportStore.analysisProgress : -1"
                :show-refresh="true"
                :show-search="true"
                :sync-search-with-url="true"
                :empty-message="emptyMessage"
                :container-path="containerPath || 'reports/item-shortages'"
                :navigate-to-path="navigateToPath"
                :view-modes="viewModes"
                @event-click="navigateToItemPage"
                @refresh="handleRefresh"
            >
                <template #header-area>
                    <div class="button-bar">
                        <ScheduleFilterSelect
                            :container-path="containerPath || 'reports/item-shortages'"
                            :navigate-to-path="navigateToPath"
                            :show-advanced-button="true"
                            :default-search="null"
                            @search-selected="handleSearchSelected"
                        />
                        <InventoryCategoryFilter
                            :container-path="containerPath || 'reports/item-shortages'"
                            :navigate-to-path="navigateToPath"
                            @category-selected="handleCategorySelected"
                        />
                        <input type="number" :title="'Show items with less than ' + qtyFilter + ' remaining'" :value="qtyFilter" @change="handleMinThresholdChange" style="width:60px" />
                        <button @click="handlePrint" :disabled="isLoading || isAnalyzing" class="button-symbol white" title="Print Item Shortage Report">
                            <span class="material-symbols-outlined">print</span>
                        </button>
                    </div>
                </template>
            </CalendarComponent>

            <TableComponent
                v-else
                :data="tableData"
                :columns="tableColumns"
                :hide-columns="['tabName']"
                :show-search="true"
                :sync-search-with-url="true"
                :container-path="containerPath || 'reports/item-shortages'"
                :navigate-to-path="navigateToPath"
                :view-modes="viewModes"
                :hide-rows-on-search="false"
                :readonly="true"
                :allowDetails="true"
                :show-search="true"
                :is-loading="isLoading"
                :is-analyzing="isAnalyzing"
                :loading-message="loadingMessage"
                :loading-progress="reportStore && isAnalyzing ? reportStore.analysisProgress : -1"
                :empty-message="emptyMessage"
                @refresh="handleRefresh"
            >
                <template #header-area>
                    <div class="button-bar">
                        <ScheduleFilterSelect
                            :container-path="containerPath || 'reports/item-shortages'"
                            :navigate-to-path="navigateToPath"
                            :show-advanced-button="true"
                            :default-search="null"
                            @search-selected="handleSearchSelected"
                        />
                        <InventoryCategoryFilter
                            :container-path="containerPath || 'reports/item-shortages'"
                            :navigate-to-path="navigateToPath"
                            @category-selected="handleCategorySelected"
                        />
                        <input type="number" :title="'Show items with less than ' + qtyFilter + ' remaining'" :value="qtyFilter" @change="handleMinThresholdChange" style="width:60px" />
                        <button @click="handlePrint" :disabled="isLoading || isAnalyzing" class="button-symbol white" title="Print Item Shortage Report">
                            <span class="material-symbols-outlined">print</span>
                        </button>
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
                                @click="navigateToItemPage(row)"
                                class="purple card"
                                :title="'View timeline for ' + row.itemId">
                            {{ row.itemId }}
                        </button>
                        <span v-else>{{ row.itemId }}</span>
                    </slot>
                    <slot v-else-if="column.key === 'minQty'">
                        {{ row.minQty !== null && row.minQty !== undefined ? row.minQty : '—' }}
                    </slot>
                    <slot v-else-if="column.key === 'overlappingShows'">
                        <slot v-if="!Array.isArray(row.overlappingShows) || row.overlappingShows.length === 0">
                            —
                        </slot>
                        <slot v-else-if="row.overlappingShows.length <= 2" class="overlapping-shows-buttons">
                            <button v-for="showId in row.overlappingShows"
                                    :key="showId"
                                    @click="navigateToPath && navigateToPath('packlist/' + showId)"
                                    class="card white">
                                {{ showId }}
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
                    <div v-else>
                        {{ row[column.key] !== null && row[column.key] !== undefined ? row[column.key] : '—' }}
                    </div>
                </template>
            </TableComponent>
        </div>
    `
};
