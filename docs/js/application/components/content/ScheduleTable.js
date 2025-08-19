import { html, Requests, TableComponent, getReactiveStore, modalManager } from '../../index.js';

// Schedule Table Menu Component
const ScheduleTableMenuComponent = Vue.defineComponent
    ? Vue.defineComponent({
        methods: {
            exportSchedule() {
                modalManager.showAlert('Export schedule functionality coming soon!', 'Info');
            },
            filterByDateRange() {
                modalManager.showAlert('Date range filter functionality coming soon!', 'Info');
            },
            showCalendarView() {
                modalManager.showAlert('Calendar view functionality coming soon!', 'Info');
            },
            scheduleSettings() {
                modalManager.showAlert('Schedule settings functionality coming soon!', 'Info');
            }
        },
        template: html`
            <div style="padding:1rem;">
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <button @click="exportSchedule" style="padding: 8px 12px; border: none; background: #007cba; color: white; border-radius: 4px; cursor: pointer;">
                        Export Schedule
                    </button>
                    <button @click="filterByDateRange" style="padding: 8px 12px; border: none; background: #28a745; color: white; border-radius: 4px; cursor: pointer;">
                        Filter by Date Range
                    </button>
                    <button @click="showCalendarView" style="padding: 8px 12px; border: none; background: #ffc107; color: black; border-radius: 4px; cursor: pointer;">
                        Calendar View
                    </button>
                    <button @click="scheduleSettings" style="padding: 8px 12px; border: none; background: #6c757d; color: white; border-radius: 4px; cursor: pointer;">
                        Schedule Settings
                    </button>
                </div>
            </div>
        `
    })
    : {
        methods: {
            exportSchedule() {
                modalManager.showAlert('Export schedule functionality coming soon!', 'Info');
            },
            filterByDateRange() {
                modalManager.showAlert('Date range filter functionality coming soon!', 'Info');
            },
            showCalendarView() {
                modalManager.showAlert('Calendar view functionality coming soon!', 'Info');
            },
            scheduleSettings() {
                modalManager.showAlert('Schedule settings functionality coming soon!', 'Info');
            }
        },
        template: html`
            <div style="padding:1rem;">
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <button @click="exportSchedule" style="padding: 8px 12px; border: none; background: #007cba; color: white; border-radius: 4px; cursor: pointer;">
                        Export Schedule
                    </button>
                    <button @click="filterByDateRange" style="padding: 8px 12px; border: none; background: #28a745; color: white; border-radius: 4px; cursor: pointer;">
                        Filter by Date Range
                    </button>
                    <button @click="showCalendarView" style="padding: 8px 12px; border: none; background: #ffc107; color: black; border-radius: 4px; cursor: pointer;">
                        Calendar View
                    </button>
                    <button @click="scheduleSettings" style="padding: 8px 12px; border: none; background: #6c757d; color: white; border-radius: 4px; cursor: pointer;">
                        Schedule Settings
                    </button>
                </div>
            </div>
        `
    };

export const ScheduleTableComponent = {
    components: {
        TableComponent,
        ScheduleTableMenuComponent
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
                { key: 'S. Start', label: 'Start Date', format: 'date' },
                { key: 'S. End', label: 'End Date', format: 'date' },
                { key: 'Ship', label: 'Ship Date', format: 'date' }
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
        },
        handleShowHamburgerMenu({ menuComponent, tableId }) {
            // Pass the actual component reference, not an object literal
            const menuComp = ScheduleTableMenuComponent;
            const modal = modalManager.createModal(
                'Schedule Table Menu',
                [menuComp], // <-- pass as array of component references
                {
                    componentProps: menuComponent?.props || {}
                }
            );
            modalManager.showModal(modal.id);
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
                :showSearch="true"
                :hamburger-menu-component="{
                    components: [ScheduleTableMenuComponent],
                    props: {}
                }"
                @refresh="handleRefresh"
                @show-hamburger-menu="handleShowHamburgerMenu"
            />
        </div>
    `
};
