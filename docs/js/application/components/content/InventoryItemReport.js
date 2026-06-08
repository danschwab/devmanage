import { html, TableComponent, CalendarComponent, CalendarLayoutToggle, Requests, getReactiveStore, createAnalysisConfig, NavigationRegistry, ItemImageComponent, ScheduleFilterSelect, InventoryCategoryFilter, Priority, invalidateCache, toISODateString, todayISOString, offsetToISO, getAutoColorClass } from '../../index.js';
import { normalizeFilterValues } from '../../../data_management/utils/helpers.js';

/**
 * Item-centric inventory report.
 * For a filtered date range, shows each item once with:
 *   item# | description | startDate | endDate | Inv Qty | Min Qty | Overlapping Shows
 */
export const InventoryItemReport = {
    components: { TableComponent, CalendarComponent, CalendarLayoutToggle, ItemImageComponent, ScheduleFilterSelect, InventoryCategoryFilter },
    inject: ['$modal', 'appContext'],
    props: {
        containerPath: { type: String, default: '' },
        navigateToPath: Function
    },
    data() {
        return {
            reportStore: null,
            referenceDate: null,
            itemCategoryFilter: null,
            searchFilter: null,
            searchParams: null,
            error: null,
            endDate: null,
            minQtyThreshold: 1,
            NavigationRegistry
        };
    },
    computed: {
        tableColumns() {
            return [
                {
                    key: 'image',
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
                { key: 'overlappingShows', label: 'Overlapping Shows', sortable: false }
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
                    return row.minQty < this.minQtyThreshold;
                });
        },

        loadingMessage() {
            return this.reportStore?.loadingMessage || 'Loading...';
        },

        isCalendarView() {
            return NavigationRegistry.getNavigationParameters(this.containerPath || 'inventory/reports/item-shortages').layout === 'calendar';
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
                this.containerPath || 'inventory/reports/item-shortages',
                this.appContext?.currentPath
            );
            const hasSearchParams = params && (params.dateFilters || params.textFilters || params.view);

            if (hasSearchParams && !this.reportStore && !this.isLoading) {
                return 'No packlists found for the selected search criteria';
            }
            if (this.reportStore && !this.isLoading && !this.isAnalyzing && this.tableData.length === 0 && this.itemCategoryFilter) {
                return 'No items were found in this category.';
            }
            if (this.reportStore && !this.isLoading && !this.isAnalyzing && this.tableData.length === 0) {
                return 'No items found for the selected search criteria.';
            }
            return 'Select a schedule filter to load shows and generate report';
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
                ),
                createAnalysisConfig(
                    Requests.getItemImageUrl,
                    'imageUrl',
                    'Loading item images...',
                    ['itemId'],
                    [],
                    null,
                    false,
                    Priority.BACKGROUND,
                    undefined,
                    false
                )
            ];

            this.reportStore = getReactiveStore(
                Requests.getMultipleShowsItemsSummary,
                null,
                [this.searchFilter, this.searchParams, this.itemCategoryFilter, false],
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
            const basePath = `inventory/categories/${row.tabName.toLowerCase()}/${row.itemId}`;
            const dateFilters = (row.startDate || row.endDate)
                ? [
                    ...(row.startDate ? [{ column: 'Show Date', value: row.startDate, type: 'after'  }] : []),
                    ...(row.endDate   ? [{ column: 'Show Date', value: row.endDate,   type: 'before' }] : [])
                  ]
                : null;
            const finalPath = dateFilters
                ? NavigationRegistry.buildPath(basePath, { dateFilters })
                : basePath;
            this.navigateToPath(finalPath);
        },

        handleCategorySelected(categoryName) {
            this.itemCategoryFilter = categoryName || null;
            if (this.searchFilter || this.searchParams) {
                this.initializeReportStore();
            }
        }
    },
    mounted() {
        const params = NavigationRegistry.getParametersForContainer(
            this.containerPath || 'inventory/reports/item-shortages',
            this.appContext?.currentPath
        );
        console.log('[InventoryItemReport] Initial URL parameters:', params);
        console.log('[InventoryItemReport] Waiting for child components to sync with URL...');
    },
    template: html`
        <div>
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
                :empty-message="emptyMessage"
                @event-click="navigateToItemPage"
                @refresh="handleRefresh"
            >
                <template #header-area>
                    <div class="button-bar">
                        <ScheduleFilterSelect
                            :container-path="containerPath || 'inventory/reports/item-shortages'"
                            :navigate-to-path="navigateToPath"
                            :show-advanced-button="true"
                            @search-selected="handleSearchSelected"
                        />
                        <InventoryCategoryFilter
                            :container-path="containerPath || 'inventory/reports/item-shortages'"
                            :navigate-to-path="navigateToPath"
                            @category-selected="handleCategorySelected"
                        />
                        <input type="number" :title="'Show items with less than ' + minQtyThreshold + ' remaining'" v-model.number="minQtyThreshold" style="width:60px" />
                        <CalendarLayoutToggle
                            :container-path="containerPath || 'inventory/reports/item-shortages'"
                            :navigate-to-path="navigateToPath"
                        />
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
                :container-path="containerPath || 'inventory/reports/item-shortages'"
                :navigate-to-path="navigateToPath"
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
                            :container-path="containerPath || 'inventory/reports/item-shortages'"
                            :navigate-to-path="navigateToPath"
                            :show-advanced-button="true"
                            @search-selected="handleSearchSelected"
                        />
                        <InventoryCategoryFilter
                            :container-path="containerPath || 'inventory/reports/item-shortages'"
                            :navigate-to-path="navigateToPath"
                            @category-selected="handleCategorySelected"
                        />
                        <input type="number" :title="'Show items with less than ' + minQtyThreshold + ' remaining'" v-model.number="minQtyThreshold" style="width:60px" />
                        <CalendarLayoutToggle
                            :container-path="containerPath || 'inventory/reports/item-shortages'"
                            :navigate-to-path="navigateToPath"
                        />
                    </div>
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
                    <slot v-else-if="column.key === 'minQty'">
                        {{ row.minQty !== null && row.minQty !== undefined ? row.minQty : '—' }}
                    </slot>
                    <slot v-else-if="column.key === 'overlappingShows'">
                        <slot v-if="!Array.isArray(row.overlappingShows) || row.overlappingShows.length === 0">
                            —
                        </slot>
                        <slot v-else class="overlapping-shows-buttons">
                            <button v-for="showId in row.overlappingShows"
                                    :key="showId"
                                    @click="navigateToPath && navigateToPath('packlist/' + showId)"
                                    class="card white">
                                {{ showId }}
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
