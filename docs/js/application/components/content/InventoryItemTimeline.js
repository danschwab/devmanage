import { html, Requests, NavigationRegistry, TableComponent, ScheduleFilterSelect, getReactiveStore, toISODateString, todayISOString, offsetToISO, CalendarComponent, ItemImageComponent, getAutoColorClass } from '../../index.js';

/**
 * Lightweight item timeline component.
 * Mountable as a subpage at inventory/<category>/<item#>
 * or in a modal. Accepts date range via URL path params.
 *
 * URL path params used (on the container path):
 *   startDate  YYYY-MM-DD
 *   endDate    YYYY-MM-DD
 */
export const InventoryItemTimeline = {
    components: { TableComponent, ScheduleFilterSelect, CalendarComponent, ItemImageComponent },
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
            resolvedItemId: null,
            itemImageUrl: null,
            viewModes: [
                { paramName: 'layout', paramValue: 'calendar', symbol: 'calendar_month', title: 'Switch to calendar view' },
                { paramName: 'layout', paramValue: null, symbol: 'table', title: 'Switch to table view' }
            ]
        };
    },
    computed: {
        columns() {
            return [
                { key: 'date',     label: 'Date',     width: 120, sortable: true, format: 'date' },
                { key: 'quantity', label: 'Quantity', width: 90,  sortable: false, format: 'number', autoColor: true, firstRow: true },
                { key: 'event',    label: 'Event',    width: 120, sortable: false, firstRow: true },
                { key: 'note',     label: 'Note',     sortable: false, firstRow: true },
                { key: 'change',   label: 'Change',   width: 160, sortable: false, secondRow: true }
            ];
        },
        chipColorClassProvider() {
            return (row) => getAutoColorClass(row.quantity) || 'green';
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
        itemInfoStore() {
            if (!this.resolvedItemId) return null;
            return getReactiveStore(
                Requests.getInventoryInfo,
                null,
                [this.resolvedItemId, ['description', 'notes', 'quantity']]
            );
        },
        itemInfo() {
            const data = this.itemInfoStore?.data;
            if (!data || !data.length) return null;
            return data[0];
        },
        itemInfoEntries() {
            if (!this.itemInfo) return null;
            return Object.entries(this.itemInfo)
                .filter(([key, value]) => key !== 'itemName' && !(value !== null && typeof value === 'object'));
        },
        calendarData() {
            const raw = this.timelineStore?.data ?? [];
            if (!raw.length) return [];
            const effectiveEnd = this.endDate || this.filterEndDate || todayISOString();
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
        },
        resolvedItemId: {
            immediate: true,
            async handler(newItemId) {
                if (!newItemId) {
                    this.itemImageUrl = null;
                    return;
                }
                // Fetch image URL directly, not through reactive store
                this.itemImageUrl = await Requests.getItemImageUrl(newItemId);
            }
        }
    },
    methods: {
        resolveItemIdFromPath() {
            // Path shape: inventory/<category>/<item>
            if (this.itemId) {
                this.resolvedItemId = this.itemId;
                return;
            }
            const path = (this.containerPath || '').split('?')[0];
            const segments = path.split('/');
            // segments[0]=inventory, [1]=category, [2]=item
            if (segments.length >= 3) {
                this.resolvedItemId = segments[2] ? decodeURIComponent(segments[2]) : null;
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
                // Find any 'after' and 'before' filters regardless of column (inventory timeline doesn't care about columns)
                const afterFilter  = searchData.dateFilters.find(f => f.type === 'after');
                const beforeFilter = searchData.dateFilters.find(f => f.type === 'before');
                if (!startDate && afterFilter)  startDate = offsetToISO(afterFilter.value);
                if (!endDate   && beforeFilter) endDate   = offsetToISO(beforeFilter.value);
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
        <!-- Loading state while resolving identifier -->
        <div v-if="!itemInfoStore || itemInfoStore.isLoading" class="loading-message">
            <img src="assets/loading.gif" alt="..."/>
            <p>Finding item...</p>
        </div>
        <!-- 404 state when item not found (aka when the store returns null) -->
        <div v-else-if="itemInfoStore && itemInfoStore.data && itemInfoStore.data.length === 0">
            <div class="card red">
                <h3>Item Not Found</h3>
                <p>"{{ resolvedItemId }}" could not be found.</p>
            </div>
        </div>
        <div v-else>
            <div v-if="resolvedItemId" style="margin-bottom: var(--padding-md);">
                <div style="display: flex; gap: var(--padding-md); align-items: flex-start;">
                    <ItemImageComponent
                        :itemNumber="resolvedItemId"
                        :imageUrl="itemImageUrl"
                        :imageSize="96"
                        :editable="true"
                    />
                    <div class="details-grid" style="flex: 1; grid-template-columns: repeat(2, 1fr); align-content: start;">
                        <div class="detail-item">
                            <label>Item#:</label>
                            <span>{{ resolvedItemId }}</span>
                        </div>
                        <template v-if="itemInfoEntries">
                            <div v-for="[key, value] in itemInfoEntries" :key="key" class="detail-item">
                                <label>{{ key.charAt(0).toUpperCase() + key.slice(1) }}:</label>
                                <span>{{ value != null && value !== '' ? value : '—' }}</span>
                            </div>
                        </template>
                        <template v-else>
                            <div class="detail-item"><span>...</span></div>
                        </template>
                    </div>
                </div>
            </div>
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
                :empty-message="filterStartDate && filterEndDate ? 'No inventory usage found in this date range. Try expanding the date filters.' : 'This item has no inventory changes. Set a date filter to see usage data.'"
                :container-path="containerPath"
                :navigate-to-path="navigateToPath"
                :view-modes="viewModes"
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
                :empty-message="filterStartDate && filterEndDate ? 'No inventory usage found in this date range. Try expanding the date filters.' : 'This item has no inventory changes. Set a date filter to see usage data.'"
                :container-path="containerPath"
                :navigate-to-path="navigateToPath"
                :view-modes="viewModes"
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
        </div>
    `
};
