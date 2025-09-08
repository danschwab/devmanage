import { html, Requests, parseDate, TableComponent, getReactiveStore, modalManager } from '../../index.js';

// Schedule Table Menu Component
const ScheduleTableMenuComponent = {
    methods: {
        setAsDefault() {
            modalManager.showAlert('Export schedule functionality coming soon!', 'Info');
        },
        filterColumns() {
            modalManager.showAlert('Date range filter functionality coming soon!', 'Info');
        },
        showCalendarView() {
            modalManager.showAlert('Calendar view functionality coming soon!', 'Info');
        },
        showChartView() {
            modalManager.showAlert('Chart view functionality coming soon!', 'Info');
        }
    },
    template: html`
        <div>
            <button @click="showCalendarView">
                Calendar View
            </button>
            <button @click="showChartView">
                Chart View
            </button>
            <button @click="filterColumns">
                Filter Columns
            </button>
            <button @click="setAsDefault">
                Set Current As Default
            </button>
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
        },
        navigateToPath: {
            type: Function,
            required: false
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
                { key: 'Ship', label: 'Ship Date', format: 'date', autoColor: true },
                { key: 'packlist', label: 'Packlist', width: 120 }
            ],
            scheduleTableStore: null
        };
    },
    computed: {
        tableData() {
            const rawData = this.scheduleTableStore ? this.scheduleTableStore.data : [];
            // Add reactive packlist information to AppData for each row
            return rawData.map((row, index) => ({
                ...row,
                AppData: {
                    ...row.AppData,
                    packlist: {
                        loading: row.AppData?.packlist?.loading !== false,
                        exists: row.AppData?.packlist?.exists || false,
                        identifier: row.AppData?.packlist?.identifier || null
                    }
                }
            }));
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
                const date = parseDate(dateStr);
                if (!date || isNaN(date)) return dateStr;
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
    watch: {
        // Watch for data changes and enrich with packlist information
        'scheduleTableStore.data': {
            handler(newData) {
                if (newData && newData.length > 0) {
                    this.enrichWithPacklistData();
                }
            },
            immediate: true
        },
        // Watch for filter changes and recreate store with new parameters
        filter: {
            handler(newFilter, oldFilter) {
                if (JSON.stringify(newFilter) !== JSON.stringify(oldFilter)) {
                    // Create a new reactive store with the updated filter
                    this.scheduleTableStore = getReactiveStore(
                        Requests.getProductionScheduleData,
                        null,
                        [newFilter]
                    );
                }
            },
            deep: true,
            immediate: false
        }
    },
    async mounted() {
        this.scheduleTableStore = getReactiveStore(
            Requests.getProductionScheduleData,
            null,
            [this.filter]
        );
    },
    methods: {
        async handleRefresh() {
            Requests.clearCache('database', 'getData', ['PROD_SCHED', 'ProductionSchedule']);
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
        },
        async enrichWithPacklistData() {
            if (!this.scheduleTableStore?.data) return;
            
            const data = this.scheduleTableStore.data;
            
            // Enrich each row with packlist information in parallel
            const enrichmentPromises = data.map(async (row, index) => {
                try {
                    const identifier = await Requests.computeIdentifier(
                        row.Show, 
                        row.Client, 
                        parseInt(row.Year)
                    );
                    
                    // Get available tabs and check if packlist exists
                    const availableTabs = await Requests.getAvailableTabs('PACK_LISTS');
                    const tab = availableTabs.find(tab => tab.title === identifier);
                    
                    // Update the row's AppData with packlist information (Vue 3 compatible)
                    row.AppData = {
                        ...row.AppData,
                        packlist: {
                            loading: false,
                            exists: !!tab,
                            identifier: identifier
                        }
                    };
                } catch (error) {
                    console.warn(`Failed to enrich packlist data for row ${index}:`, error);
                    row.AppData = {
                        ...row.AppData,
                        packlist: {
                            loading: false,
                            exists: false,
                            identifier: null
                        }
                    };
                }
            });
            
            await Promise.all(enrichmentPromises);
        },
        async handlePacklistClick(packlistInfo) {
            if (!this.navigateToPath) {
                modalManager.showAlert('Navigation not available', 'Error');
                return;
            }
            
            if (!packlistInfo.exists || !packlistInfo.identifier) {
                modalManager.showAlert('No packlist available for this show', 'Info');
                return;
            }
            
            this.navigateToPath(`packlist/${packlistInfo.identifier}`);
        },
        getPacklistCards(row, columnKey) {
            // Only show packlist cards in the packlist column
            if (columnKey !== 'packlist') {
                return [];
            }
            
            const packlistInfo = row.AppData?.packlist;
            if (!packlistInfo) {
                return [];
            }
            
            // Create a card based on packlist status
            if (packlistInfo.loading) {
                return [{
                    message: 'Loading...',
                    disabled: true
                }];
            }
            
            if (packlistInfo.exists) {
                return [{
                    message: 'View Packlist',
                    disabled: false,
                    action: () => this.handlePacklistClick(packlistInfo)
                }];
            } else {
                return [{
                    message: 'No Packlist',
                    disabled: true
                }];
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
                :showSearch="true"
                :sortable="true"
                :hamburger-menu-component="{
                    components: [ScheduleTableMenuComponent],
                    props: {}
                }"
                @refresh="handleRefresh"
                @show-hamburger-menu="handleShowHamburgerMenu"
            >
                <template #table-header-area>
                    <slot name="table-header-area"></slot>
                </template>
                <template #default="{ row, column }">
                    <!-- Add packlist cards based on AppData -->
                    <template v-for="card in getPacklistCards(row, column.key)" :key="card.message">
                        <button 
                            class="table-cell-card"
                            :disabled="card.disabled"
                            @click="!card.disabled ? card.action() : null"
                            v-html="card.message"
                        ></button>
                    </template>
                </template>
            </TableComponent>
        </div>
    `
};
