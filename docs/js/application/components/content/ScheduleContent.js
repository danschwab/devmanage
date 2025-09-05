import { html, ScheduleTableComponent, NavigationRegistry } from '../../index.js';


export const AllShowsContent = {
    components: {
        ScheduleTableComponent
    },
    props: {
        navigateToPath: Function
    },
    data() {
        return {
            availableYears: [],
            selectedYear: null,
            isLoadingYears: true,
            filter: null,
            hasSelectedYear: false
        };
    },
    mounted() {
        this.loadAvailableYears();
    },
    computed: {
        // No computed properties needed since we use filter directly
    },
    methods: {
        loadAvailableYears() {
            this.isLoadingYears = true;
            try {
                // Generate years from 2023 to current year
                const currentYear = new Date().getFullYear();
                const startYear = 2023;
                const years = [];
                
                for (let year = currentYear; year >= startYear; year--) {
                    years.push(year);
                }
                
                this.availableYears = years;
                
                // Auto-select the most recent year if available
                if (this.availableYears.length > 0) {
                    this.selectedYear = this.availableYears[0];
                    this.handleYearSelection();
                }
            } catch (error) {
                console.error('Failed to generate available years:', error);
            } finally {
                this.isLoadingYears = false;
            }
        },
        handleYearSelection() {
            if (this.selectedYear) {
                // Create date range filter for the entire selected year
                const year = parseInt(this.selectedYear);
                const startDate = `${year}-01-01`;
                const endDate = `${year}-12-31`;
                
                // Use Vue.set to ensure reactivity (if available) or direct assignment
                if (Vue.set) {
                    Vue.set(this, 'filter', { startDate, endDate, year });
                } else {
                    this.filter = { startDate, endDate, year };
                }
                this.hasSelectedYear = true;
            } else {
                if (Vue.set) {
                    Vue.set(this, 'filter', null);
                } else {
                    this.filter = null;
                }
                this.hasSelectedYear = false;
            }
        }
    },
    template: html`
        <div class="all-shows-page">
            <ScheduleTableComponent 
            :filter="filter" 
            :navigate-to-path="navigateToPath"
            >
                <template #table-header-area>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label for="year-select">Showing results in:</label>
                        <select 
                            id="year-select"
                            v-model="selectedYear" 
                            @change="handleYearSelection"
                            :disabled="isLoadingYears"
                        >
                            <option value="" disabled>Choose a year...</option>
                            <option 
                                v-for="year in availableYears" 
                                :key="year" 
                                :value="year"
                            >
                                {{ year }}
                            </option>
                        </select>
                        <span v-if="isLoadingYears" class="loading-text">
                            Loading years...
                        </span>
                    </div>
                </template>
            </ScheduleTableComponent>
        </div>
    `
};


export const ScheduleContent = {
    components: {
        ScheduleTableComponent,
        AllShowsContent
    },
    props: {
        navigateToPath: Function,
        containerPath: {
            type: String,
            default: 'schedule'
        },
        fullPath: String,
        navigationParameters: {
            type: Object,
            default: () => ({})
        }
    },
    data() {
        const today = new Date();
        const startDate = today.toISOString().slice(0, 10);
        const future = new Date(today.getTime() + 10 * 365 * 24 * 60 * 60 * 1000); // 10 years in the future. Should reliably get the end of the data
        const endDate = future.toISOString().slice(0, 10);
        const filter = { startDate, endDate };
        return {
            filter
        };
    },
    mounted() {
        // Register schedule navigation routes
        NavigationRegistry.registerNavigation('schedule', {
            routes: {
                allshows: {
                    displayName: 'Shows by Year',
                    dashboardTitle: 'Shows by Year',
                    icon: 'view_list'
                }
            }
        });
    },
    computed: {
        // Direct navigation options for schedule
        scheduleNavigation() {
            return [
                { id: 'allshows', label: 'Shows by Year', path: 'schedule/allshows' }
            ];
        },
        pathSegments() {
            if (!this.containerPath) return [];
            return this.containerPath.split('/').filter(segment => segment.length > 0);
        }
    },
    template: html`
        <div class="schedule-page">
            <!-- Default Schedule View (next 30 days) -->
            <div v-if="containerPath === 'schedule'">
                <div class="button-bar">
                    <button 
                        v-for="nav in scheduleNavigation" 
                        :key="nav.id"
                        @click="navigateToPath(nav.path)">
                        {{ nav.label }}
                    </button>
                </div>
                <ScheduleTableComponent 
                    :filter="filter" 
                    :navigate-to-path="navigateToPath"
                />
            </div>
            
            <!-- All Shows View -->
            <div v-else-if="containerPath === 'schedule/allshows'">
                <AllShowsContent 
                    :navigate-to-path="navigateToPath"
                />
            </div>
            
            <!-- Default fallback -->
            <div v-else>
                <p>Unknown schedule view: {{ containerPath }}</p>
            </div>
        </div>
    `
};
