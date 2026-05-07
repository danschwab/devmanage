import { html, Requests, NavigationRegistry, TableComponent, ScheduleFilterSelect, getReactiveStore, toISODateString } from '../../index.js';

/**
 * Lightweight item timeline component.
 * Mountable as a subpage at inventory/categories/<category>/<item#>
 * or in a modal. Accepts date range via URL path params.
 *
 * URL path params used (on the container path):
 *   startDate  YYYY-MM-DD
 *   endDate    YYYY-MM-DD
 */
export const InventoryItemTimeline = {
    components: { TableComponent, ScheduleFilterSelect },
    inject: ['$modal', 'appContext'],
    props: {
        containerPath: { type: String, default: '' },
        navigateToPath: Function,
        // When used directly (not as a route), these can be passed as props
        itemId: { type: String, default: null },
        startDate: { type: String, default: null },
        endDate: { type: String, default: null }
    },
    data() {
        return {
            filterStartDate: null,
            filterEndDate: null,
            resolvedItemId: null
        };
    },
    computed: {
        columns() {
            return [
                { key: 'date',     label: 'Date',     width: 120, sortable: false, format: 'date' },
                { key: 'event',    label: 'Event',    width: 120, sortable: false },
                { key: 'note',     label: 'Note',     sortable: false },
                { key: 'change',   label: 'Change',   width: 160, sortable: false },
                { key: 'quantity', label: 'Quantity', width: 90,  sortable: false, format: 'number', autoColor: true }
            ];
        },
        timelineStore() {
            if (!this.resolvedItemId) return null;
            const effectiveStart = this.startDate || this.filterStartDate;
            const effectiveEnd   = this.endDate   || this.filterEndDate;
            return getReactiveStore(
                Requests.getItemTimeline,
                null,
                [this.resolvedItemId, effectiveStart, effectiveEnd]
            );
        }
    },
    watch: {
        'appContext.currentPath': {
            handler(newPath, oldPath) {
                if (!this.containerPath || !oldPath) return;
                const newParams = NavigationRegistry.getParametersForContainer(this.containerPath, newPath);
                const oldParams = NavigationRegistry.getParametersForContainer(this.containerPath, oldPath);
                if (JSON.stringify(newParams) === JSON.stringify(oldParams)) return;
                this.resolveItemIdFromPath();
            }
        }
    },
    methods: {
        resolveItemIdFromPath() {
            // Path shape: inventory/categories/<category>/<item>
            if (this.itemId) {
                this.resolvedItemId = this.itemId;
                return;
            }
            const path = (this.containerPath || '').split('?')[0];
            const segments = path.split('/');
            // segments[0]=inventory, [1]=categories, [2]=category, [3]=item
            if (segments.length >= 4 && segments[1] === 'categories') {
                this.resolvedItemId = segments[3] ? decodeURIComponent(segments[3]) : null;
            } else {
                this.resolvedItemId = null;
            }
        },
        handleScheduleSearch(searchData) {
            // searchData.startDate/endDate are ISO strings when available (ISO date picker,
            // year preset, or async-resolved overlap mode). They are null when the filter
            // uses a numeric day-offset preset (e.g. "month ago" = -30, "in a year" = 365).
            // Resolve offsets to real dates here so the timeline store always gets ISO strings.
            let startDate = searchData?.startDate ?? null;
            let endDate   = searchData?.endDate   ?? null;

            if ((!startDate || !endDate) && searchData?.dateFilters?.length) {
                const offsetToDate = (value) => {
                    if (typeof value === 'number') {
                        const d = new Date();
                        d.setDate(d.getDate() + value);
                        return toISODateString(d);
                    }
                    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
                        return value;
                    }
                    return null;
                };
                const afterFilter  = searchData.dateFilters.find(f => f.column === 'Show Date' && f.type === 'after');
                const beforeFilter = searchData.dateFilters.find(f => f.column === 'Show Date' && f.type === 'before');
                if (!startDate && afterFilter)  startDate = offsetToDate(afterFilter.value);
                if (!endDate   && beforeFilter) endDate   = offsetToDate(beforeFilter.value);
            }

            this.filterStartDate = startDate;
            this.filterEndDate   = endDate;
            // timelineStore computed reacts automatically to the filter change
        }
    },
    mounted() {
        this.resolveItemIdFromPath();
    },
    template: html`
        <TableComponent
            :data="timelineStore?.data ?? []"
            :columns="columns"
            :readonly="true"
            :show-search="false"
            :show-refresh="false"
            :is-loading="timelineStore?.isLoading ?? false"
            :loading-message="timelineStore?.loadingMessage || 'Loading timeline...'"
            :error="timelineStore?.error ?? null"
            empty-message="No usage or change data found in this date range."
        >
            <template #header-area>
                <div class="button-bar">
                    <ScheduleFilterSelect
                        :container-path="containerPath"
                        :navigate-to-path="navigateToPath"
                        :show-advanced-button="true"
                        @search-selected="handleScheduleSearch"
                    />
                </div>
            </template>
        </TableComponent>
    `
};
