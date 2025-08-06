import { html, Requests, TableComponent, getReactiveStore } from '../../index.js';

export const ScheduleTableComponent = {
    components: {
        TableComponent
    },
    props: {
        filter: {
            type: [Object, String],
            default: null
        }
    },
    data() {
        return {
            columns: [
                { key: 'Show', label: 'Show' },
                { key: 'Client', label: 'Client' },
                { key: 'Year', label: 'Year' },
                { key: 'City', label: 'City' },
                { key: 'Booth#', label: 'Booth#' },
                { key: 'S. Start', label: 'Start Date' },
                { key: 'S. End', label: 'End Date' },
                { key: 'Ship', label: 'Ship Date' }
            ],
            scheduleTableStore: null
        };
    },
    computed: {
        tableData() {
            return this.scheduleTableStore ? this.scheduleTableStore.data : [];
        },
        originalData() {
            return this.scheduleTableStore && Array.isArray(this.scheduleTableStore.originalData)
                ? JSON.parse(JSON.stringify(this.scheduleTableStore.originalData))
                : [];
        },
        error() {
            return this.scheduleTableStore ? this.scheduleTableStore.error : null;
        },
        loadingMessage() {
            return this.scheduleTableStore ? (this.scheduleTableStore.loadingMessage || 'Loading schedule...') : 'Loading schedule...';
        },
        isLoading() {
            return this.scheduleTableStore ? this.scheduleTableStore.isLoading : false;
        },
        tableTitle() {
            // Helper to format date as 'mmm d, yyyy'
            function formatDate(dateStr) {
                if (!dateStr) return '';
                const date = new Date(dateStr);
                if (isNaN(date)) return dateStr;
                return date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            }
            if (this.filter && typeof this.filter === 'object' && this.filter.startDate && this.filter.endDate) {
                const start = formatDate(this.filter.startDate);
                const end = formatDate(this.filter.endDate);
                return `Shows between ${start} and ${end}`;
            }
            if (this.filter && (typeof this.filter === 'string' || this.filter.identifier)) {
                const id = typeof this.filter === 'string' ? this.filter : this.filter.identifier;
                return `Shows during ${id}`;
            }
            return 'Production Schedule';
        }
    },
    async mounted() {
        this.scheduleTableStore = getReactiveStore(
            (params) => Requests.getProductionScheduleData(params),
            null,
            [this.filter]
        );
    },
    methods: {
        async handleRefresh() {
            Requests.clearCache('PROD_SCHED', 'ProductionSchedule');
            if (this.scheduleTableStore) {
                await this.scheduleTableStore.load('Reloading schedule...');
            }
        }
    },
    template: html`
        <div class="schedule-table-component">
            <TableComponent
                ref="tableComponent"
                :data="tableData"
                :originalData="originalData"
                :columns="columns"
                :isLoading="isLoading"
                :error="error"
                :showRefresh="true"
                :title="tableTitle"
                emptyMessage="No shows found."
                :loading-message="loadingMessage"
                @refresh="handleRefresh"
            />
        </div>
    `
};
