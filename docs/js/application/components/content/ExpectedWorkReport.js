import { html, DataView, ButtonBar, ScheduleFilterSelect, searchDateRange, Requests, getReactiveStore, getPreferencesStore, invalidateCache, resolveWorkSettings, WORK_CATEGORIES } from '../../index.js';
import { monthLabel } from './InventoryProjectionReport.js';

const showsText = (n) => `${n} show${n === 1 ? '' : 's'}`;

// What each details month row key is (Requests.getExpectedWork), as readable text; derived on a
// computed copy
const MONTH_FIELDS = [
    { key: 'monthLabel', label: 'Month' },
    { key: 'bookedText', label: 'Booked shows shipping' },
    { key: 'bookedHours', label: 'Booked control hours', format: 'number', type: 'number' },
    { key: 'expectedHours', label: 'Expected control hours', format: 'number', type: 'number' }
];

const MONTH_VIEWS = {
    id: 'expected-work-months',
    default: 'table',
    theme: 'blue',
    views: [{ id: 'table', name: 'Months', layout: 'table', columns: MONTH_FIELDS.map(field => field.key), style: { monthLabel: { width: 90 } } }]
};

// The page's rows are months: what each key is
const WORK_FIELDS = [
    { key: 'monthLabel', label: 'Month' },
    ...WORK_CATEGORIES.map(category => ({ key: category.key, label: category.label, format: 'number', type: 'number' })),
    { key: 'control', label: 'Total Control', format: 'number', type: 'number' }
];
const WORK_KEYS = [...WORK_CATEGORIES.map(category => category.key), 'control'];

// A line per category and a dashed total control, by month; or the same as a table
const WORK_VIEWS = {
    id: 'expected-work',
    default: 'chart',
    theme: 'blue',
    views: [
        {
            id: 'chart', name: 'Chart', icon: 'timeline', layout: 'chart',
            chart: { x: 'monthLabel', series: WORK_KEYS, dashed: ['control'], yLabel: 'Hours' },
            style: { control: { color: 'text' } }
        },
        { id: 'table', name: 'Table', icon: 'table', layout: 'table', columns: ['monthLabel', ...WORK_KEYS], style: { monthLabel: { width: 90 } } }
    ]
};

/**
 * The expected work's details: how the hours are reached (the work preference rows), then month
 * by month the shows booked and the hours booked and expected. A modal component: open it with
 * $modal.custom(ExpectedWorkDetails, {}).
 */
const ExpectedWorkDetails = {
    components: { DataView },
    data() {
        return {
            workStore: getReactiveStore(Requests.getExpectedWork, null, []),
            prefsStore: getPreferencesStore(),
            MONTH_FIELDS,
            MONTH_VIEWS
        };
    },
    computed: {
        detailItems() {
            const work = resolveWorkSettings(this.prefsStore?.data);
            const sqft = (n) => `${n.toLocaleString()} sq ft`;
            const when = (days) => days > 0 ? `${days} days before shipping` : (days < 0 ? `${-days} days after shipping` : 'when it ships');
            return [
                ...work.categories.map(category => ({
                    label: category.label,
                    value: `${category.small} h at ${sqft(work.smallSqft)}, ${category.large} h at ${sqft(work.largeSqft)}; ${when(category.offsetDays)}`
                })),
                { label: 'Booth size', value: `a booth between ${sqft(work.smallSqft)} and ${sqft(work.largeSqft)} takes hours in proportion to its size; a smaller booth, or a show without a size, the small hours; a larger one the large hours` },
                { label: 'Months', value: 'each category\'s work for a show counts in the month its days before shipping fall in; work falling before this month is past' },
                { label: 'Total control', value: `${work.categories.filter(c => c.control).map(c => c.label).join(', ')} added up, each in its own month` },
                { label: 'Not booked yet', value: 'each month is the larger of the hours booked and the same month last year\'s hours, carried forward by the inventory projection\'s History Years and Growth Factor; each category on its own hours, so more small booths raise the work small booths take most' }
            ];
        },
        rows() {
            return (this.workStore.data || []).map(month => ({
                monthLabel: monthLabel(month.month),
                bookedText: month.bookedShows ? `${showsText(month.bookedShows)}, ${month.bookedLarge} large` : 'none',
                bookedHours: Math.round(month.control.booked),
                expectedHours: Math.round(month.control.expected)
            }));
        }
    },
    template: html`
        <div class="card details-grid">
            <div v-for="item in detailItems" :key="item.label" class="detail-item">
                <label>{{ item.label }}</label>
                <span>{{ item.value }}</span>
            </div>
        </div>
        <DataView
            :fields="MONTH_FIELDS"
            :rows="rows"
            :registry="MONTH_VIEWS"
            :is-loading="workStore.isLoading"
            :loading-message="workStore.loadingMessage || 'Projecting work...'"
            :loading-progress="workStore.loadingProgress ?? -1"
            :show-refresh="false"
            empty-message="No months to show."
        />
    `,
    inheritAttrs: false
};

/**
 * Expected work report (reports/expected-work): the hours of each work category expected each
 * month, from the booked shows and those expected but not booked yet, as a line chart (or a
 * table: the view switch). The schedule's date filter (ScheduleFilterSelect, in the URL) narrows
 * the months shown to those it covers, within the projection's months. The model:
 * data_management/utils/work-projection.js; its hours are preference rows (Work*), shown in the
 * page menu (View Parameters), with the inventory projection's shared ones.
 */
export const ExpectedWorkReport = {
    components: { DataView, ButtonBar, ScheduleFilterSelect },
    inject: ['$modal'],
    props: {
        containerPath: { type: String, default: 'reports/expected-work' },
        navigateToPath: Function
    },
    data() {
        return {
            workStore: getReactiveStore(Requests.getExpectedWork, null, []),
            // The date filter's range (ISO dates; null for an open end)
            filterStartDate: null,
            filterEndDate: null,
            thisYear: new Date().getFullYear(),
            WORK_FIELDS,
            WORK_VIEWS
        };
    },
    computed: {
        // The projected months the date filter covers (every one without a filter)
        months() {
            const from = this.filterStartDate?.slice(0, 7);
            const to = this.filterEndDate?.slice(0, 7);
            return (this.workStore.data || []).filter(month => (!from || month.month >= from) && (!to || month.month <= to));
        },
        emptyMessage() {
            return (this.workStore.data || []).length && (this.filterStartDate || this.filterEndDate)
                ? 'No projected months in this date range. The projection runs from this month for its Future Years.'
                : 'No months to show.';
        },
        // One row per month: each category's expected hours and the total control
        rows() {
            return this.months.map(month => ({
                monthLabel: monthLabel(month.month),
                ...Object.fromEntries(WORK_CATEGORIES.map(category => [category.key, Math.round(month.hours[category.key]?.expected || 0)])),
                control: Math.round(month.control.expected)
            }));
        }
    },
    methods: {
        handleScheduleSearch(searchData) {
            const { startDate, endDate } = searchDateRange(searchData);
            this.filterStartDate = startDate;
            this.filterEndDate = endDate;
        },
        openDetails() {
            this.$modal.custom(ExpectedWorkDetails, { size: 'page' }, 'Expected work details');
        },
        handleRefresh() {
            invalidateCache([
                { namespace: 'database', methodName: 'getData', args: ['PROD_SCHED', 'Production Schedule'] },
                { namespace: 'database', methodName: 'getData', args: ['CACHE', 'Preferences'] }
            ]);
        }
    },
    template: html`
        <DataView
            :fields="WORK_FIELDS"
            :rows="rows"
            :registry="WORK_VIEWS"
            :container-path="containerPath"
            :navigate-to-path="navigateToPath"
            title="Expected Work"
            :is-loading="workStore.isLoading"
            :loading-message="workStore.loadingMessage || 'Projecting work...'"
            :loading-progress="workStore.loadingProgress ?? -1"
            :show-refresh="true"
            :empty-message="emptyMessage"
            @refresh="handleRefresh"
        >
            <template #header-area>
                <ButtonBar>
                    <ScheduleFilterSelect
                        :container-path="containerPath"
                        :navigate-to-path="navigateToPath"
                        :include-years="true"
                        :start-year="thisYear"
                        default-search=""
                        :show-advanced-button="true"
                        @search-selected="handleScheduleSearch"
                    />
                    <button class="button-symbol" title="Expected work details" @click="openDetails">☷</button>
                </ButtonBar>
            </template>
        </DataView>
    `
};
