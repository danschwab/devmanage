import { html, ScheduleTableComponent, modalManager, hamburgerMenuRegistry, DashboardToggleComponent } from '../../index.js';

// Schedule Hamburger Menu Component
export const ScheduleMenuComponent = {
    props: {
        containerPath: String,
        containerType: String,
        currentView: String,
        title: String
    },
    computed: {
        menuItems() {
            return [
                { label: 'Calendar View', action: 'showCalendarView' },
                { label: 'Chart View', action: 'showChartView' },
                { label: 'Info Priority', action: 'filterColumns' },
                { label: 'Set Current As Default', action: 'setAsDefault' },
                { label: 'Refresh', action: 'refresh' },
                { label: 'Help', action: 'help' }
            ];
        }
    },
    methods: {
        handleAction(action) {
            switch (action) {
                case 'showCalendarView':
                    modalManager.showAlert('Calendar view functionality coming soon!', 'Info');
                    break;
                case 'showChartView':
                    modalManager.showAlert('Chart view functionality coming soon!', 'Info');
                    break;
                case 'filterColumns':
                    modalManager.showAlert('Date range filter functionality coming soon!', 'Info');
                    break;
                case 'setAsDefault':
                    modalManager.showAlert('Export schedule functionality coming soon!', 'Info');
                    break;
                case 'refresh':
                    modalManager.showAlert('Refreshing schedule data...', 'Info');
                    break;
                case 'help':
                    modalManager.showAlert('Schedule help functionality coming soon!', 'Info');
                    break;
                default:
                    modalManager.showAlert(`Action ${action} not implemented yet.`, 'Info');
            }
        }
    },
    template: html`
        <ul>
            <li v-for="item in menuItems" :key="item.action">
                <button 
                    @click="handleAction(item.action)">
                    {{ item.label }}
                </button>
            </li>
        </ul>
    `
};

export const ScheduleContent = {
    components: {
        ScheduleTableComponent
    },
    props: {
        navigateToPath: Function,
        containerPath: {
            type: String,
            default: 'schedule'
        },
        fullPath: String
    },
    data() {
        return {
            availableYearOptions: [],
            selectedYearOption: 'upcoming', // Default to "Upcoming"
            isLoadingYears: false,
            filter: null
        };
    },
    mounted() {
        // Register hamburger menu for schedule
        hamburgerMenuRegistry.registerMenu('schedule', {
            components: [ScheduleMenuComponent, DashboardToggleComponent],
            props: {}
        });
        
        this.loadAvailableYears();
        this.handleYearSelection(); // Set initial filter
    },
    methods: {
        loadAvailableYears() {
            this.isLoadingYears = true;
            try {
                // Generate years from 2023 to current year, plus "Upcoming" option
                const currentYear = new Date().getFullYear();
                const startYear = 2023;
                const yearOptions = [];
                
                // Add "Upcoming" as first option
                yearOptions.push({ value: 'upcoming', label: 'Upcoming' });
                
                // Add years from current year down to start year
                for (let year = currentYear; year >= startYear; year--) {
                    yearOptions.push({ value: year.toString(), label: year.toString() });
                }
                
                this.availableYearOptions = yearOptions;
            } catch (error) {
                console.error('Failed to generate available years:', error);
            } finally {
                this.isLoadingYears = false;
            }
        },
        handleYearSelection() {
            if (this.selectedYearOption === 'upcoming') {
                // Create filter for upcoming shows (today to +10 years)
                const today = new Date();
                const startDate = today.toISOString().slice(0, 10);
                const future = new Date(today.getTime() + 10 * 365 * 24 * 60 * 60 * 1000);
                const endDate = future.toISOString().slice(0, 10);
                this.filter = { startDate, endDate };
            } else if (this.selectedYearOption) {
                // Create date range filter for the entire selected year
                const year = parseInt(this.selectedYearOption);
                const startDate = `${year}-01-01`;
                const endDate = `${year}-12-31`;
                this.filter = { startDate, endDate, year };
            } else {
                this.filter = null;
            }
        }
    },
    template: html`
        <div class="schedule-page">
            <ScheduleTableComponent 
                :filter="filter" 
                @navigate-to-path="(event) => navigateToPath(event.targetPath)"
            >
                <template #table-header-area>
                    <div class="year-selector-bar">
                        <select 
                            id="year-select"
                            v-model="selectedYearOption" 
                            @change="handleYearSelection"
                            :disabled="isLoadingYears"
                            class="year-select"
                        >
                            <option 
                                v-for="option in availableYearOptions" 
                                :key="option.value" 
                                :value="option.value"
                            >
                                {{ option.label }}
                            </option>
                        </select>
                        <span v-if="isLoadingYears" class="status-text">
                            Loading years...
                        </span>
                    </div>
                </template>
            </ScheduleTableComponent>
        </div>
    `
};
