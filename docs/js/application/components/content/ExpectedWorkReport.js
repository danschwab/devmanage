import { html, DataView, ButtonBar, Requests, getReactiveStore, getPreferencesStore, invalidateCache, resolveWorkSettings, WORK_CATEGORIES } from '../../index.js';
import { monthLabel } from './InventoryProjectionReport.js';

const showsText = (n) => `${n} show${n === 1 ? '' : 's'}`;

// What each details month row key is (Requests.getExpectedWork), as readable text; derived on a
// computed copy
const MONTH_FIELDS = [
    { key: 'monthLabel', label: 'Month' },
    { key: 'bookedText', label: 'Booked shows' },
    { key: 'bookedHours', label: 'Booked hours', format: 'number', type: 'number' },
    { key: 'expectedHours', label: 'Expected hours', format: 'number', type: 'number' }
];

const MONTH_VIEWS = {
    id: 'expected-work-months',
    default: 'table',
    theme: 'blue',
    views: [{ id: 'table', name: 'Months', layout: 'table', columns: MONTH_FIELDS.map(field => field.key), style: { monthLabel: { width: 90 } } }]
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
            return [
                ...work.categories.map(category => ({
                    label: category.label,
                    value: `${category.small} h a small booth, ${category.large} h a large booth (from ${work.largeSqft.toLocaleString()} sq ft)`
                })),
                { label: 'Booked', value: 'the shows on the schedule, at their booth sizes; a show without a size is a small booth' },
                { label: 'Not booked yet', value: 'each month is the larger of the hours booked and the same month last year\'s hours, carried forward by the inventory projection\'s History Years and Growth Factor; each category on its own hours, so more small booths raise the work small booths take most' },
                { label: 'Months', value: 'a show\'s work counts in the month it ships' }
            ];
        },
        rows() {
            return (this.workStore.data || []).map(month => ({
                monthLabel: monthLabel(month.month),
                bookedText: month.bookedShows ? `${showsText(month.bookedShows)}, ${month.bookedLarge} large` : 'none',
                bookedHours: Math.round(month.total.booked),
                expectedHours: Math.round(month.total.expected)
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
 * month, from the booked shows and those expected but not booked yet. The model:
 * data_management/utils/work-projection.js; its hours are preference rows (Work*), shown in the
 * page menu (View Parameters), with the inventory projection's shared ones.
 */
export const ExpectedWorkReport = {
    components: { DataView, ButtonBar },
    inject: ['$modal'],
    props: {
        containerPath: { type: String, default: 'reports/expected-work' },
        navigateToPath: Function
    },
    data() {
        return {
            workStore: getReactiveStore(Requests.getExpectedWork, null, [])
        };
    },
    computed: {
        months() {
            return (this.workStore.data || []).map(month => month.month);
        },
        // One row per category and a total; one column per month, its expected hours
        fields() {
            return [
                { key: 'label', label: 'Work' },
                ...this.months.map((month, i) => ({ key: `m${i}`, label: monthLabel(month), format: 'number', type: 'number' }))
            ];
        },
        registry() {
            return {
                id: 'expected-work',
                default: 'table',
                theme: 'blue',
                views: [{ id: 'table', name: 'Expected Work', layout: 'table', columns: this.fields.map(field => field.key), style: { label: { width: 150 } } }]
            };
        },
        rows() {
            const data = this.workStore.data || [];
            const row = (label, hours) => Object.fromEntries([['label', label], ...data.map((month, i) => [`m${i}`, Math.round(hours(month))])]);
            return [
                ...WORK_CATEGORIES.map(category => row(category.label, month => month.hours[category.key]?.expected || 0)),
                row('Total', month => month.total.expected)
            ];
        }
    },
    methods: {
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
            :fields="fields"
            :rows="rows"
            :registry="registry"
            :container-path="containerPath"
            :navigate-to-path="navigateToPath"
            title="Expected Work"
            :is-loading="workStore.isLoading"
            :loading-message="workStore.loadingMessage || 'Projecting work...'"
            :loading-progress="workStore.loadingProgress ?? -1"
            :show-refresh="true"
            empty-message="No months to show."
            @refresh="handleRefresh"
        >
            <template #header-area>
                <ButtonBar>
                    <button class="button-symbol" title="Expected work details" @click="openDetails">☷</button>
                </ButtonBar>
            </template>
        </DataView>
    `
};
