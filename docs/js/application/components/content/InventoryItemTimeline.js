import { html, Requests, NavigationRegistry, TableComponent, ScheduleFilterSelect, getReactiveStore, toISODateString, CalendarComponent, CalendarLayoutToggle } from '../../index.js';

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
    components: { TableComponent, ScheduleFilterSelect, CalendarComponent, CalendarLayoutToggle },
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
                { key: 'quantity', label: 'Quantity', width: 90,  sortable: false, format: 'number', autoColor: true, firstRow: true },
                { key: 'event',    label: 'Event',    width: 120, sortable: false, firstRow: true },
                { key: 'note',     label: 'Note',     sortable: false, firstRow: true },
                { key: 'change',   label: 'Change',   width: 160, sortable: false, secondRow: true }
            ];
        },
        chipColorClassProvider() {
            return (row) => {
                if (row.quantity < 0) return 'red';
                if (row.quantity < 1) return 'yellow';
                return '';
            };
        },
        isCalendarView() {
            const params = NavigationRegistry.getNavigationParameters(this.containerPath);
            return params.layout === 'calendar';
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
        },
        calendarData() {
            const raw = this.timelineStore?.data ?? [];
            if (!raw.length) return [];
            const effectiveEnd = this.endDate || this.filterEndDate || toISODateString(new Date());
            return raw.map((row, i) => {
                const nextRow = raw[i + 1];
                let calendarEnd;
                if (nextRow && nextRow.date > row.date) {
                    const d = new Date(nextRow.date + 'T00:00:00');
                    d.setDate(d.getDate() - 1);
                    calendarEnd = toISODateString(d);
                } else {
                    calendarEnd = nextRow ? row.date : effectiveEnd;
                }
                return { ...row, calendarStart: row.date, calendarEnd };
            });
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
        },
        handleCalendarEventClick(row) {
            const DetailModalComponent = {
                props: { row: Object, columns: Array },
                template: html`
                    <div class="details-grid">
                        <template v-for="col in columns" :key="col.key">
                            <div class="detail-item" v-if="row[col.key] != null && row[col.key] !== ''">
                                <label>{{ col.label }}</label>
                                <span>{{ row[col.key] }}</span>
                            </div>
                        </template>
                    </div>
                `
            };
            const title = [row.event, row.note].filter(Boolean).join(' — ') || 'Event Details';
            this.$modal.custom(DetailModalComponent, { row, columns: this.columns }, title);
        }
    },
    mounted() {
        this.resolveItemIdFromPath();
    },
    template: html`
        <div>
            <CalendarComponent
                v-if="isCalendarView"
                :data="calendarData"
                :columns="columns"
                event-start-column="calendarStart"
                event-end-column="calendarEnd"
                :chip-color-class="chipColorClassProvider"
                :is-loading="timelineStore?.isLoading ?? false"
                :loading-message="timelineStore?.loadingMessage || 'Loading timeline...'"
                :error="timelineStore?.error ?? null"
                empty-message="No events found in this date range."
                @event-click="handleCalendarEventClick"
            >
                <template #header-area>
                    <div class="button-bar">
                        <ScheduleFilterSelect
                            :container-path="containerPath"
                            :navigate-to-path="navigateToPath"
                            :show-advanced-button="true"
                            @search-selected="handleScheduleSearch"
                        />
                        <CalendarLayoutToggle
                            v-if="navigateToPath"
                            :container-path="containerPath"
                            :navigate-to-path="navigateToPath"
                        />
                    </div>
                </template>
            </CalendarComponent>
            <TableComponent
                v-else
                :data="timelineStore?.data ?? []"
                :columns="columns"
                :readonly="true"
                :show-search="false"
                :show-refresh="false"
                :is-loading="timelineStore?.isLoading ?? false"
                :loading-message="timelineStore?.loadingMessage || 'Loading timeline...'"
                :error="timelineStore?.error ?? null"
                empty-message="No inventory changes found in this date range. Try expanding the date filters."
            >
                <template #header-area>
                    <div class="button-bar">
                        <ScheduleFilterSelect
                            :container-path="containerPath"
                            :navigate-to-path="navigateToPath"
                            :show-advanced-button="true"
                            @search-selected="handleScheduleSearch"
                        />
                        <CalendarLayoutToggle
                            v-if="navigateToPath"
                            :container-path="containerPath"
                            :navigate-to-path="navigateToPath"
                        />
                    </div>
                </template>
            </TableComponent>
        </div>
    `
};
