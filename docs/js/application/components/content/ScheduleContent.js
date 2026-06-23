import { html, ScheduleTableComponent, hamburgerMenuRegistry, DashboardToggleComponent, NavigationRegistry, Requests, ScheduleFilterSelect, CalendarLayoutToggle } from '../../index.js';
import { normalizeFilterValues } from '../../../data_management/utils/helpers.js';

// Schedule Hamburger Menu Component
export const ScheduleMenuComponent = {
    props: {
        containerPath: String,
        containerType: String,
        currentView: String,
        title: String,
        navigateToPath: Function
    },
    inject: ['$modal'],
    computed: {
        menuItems() {
            const items = [];
            
            // Placeholder items - not yet implemented
            // items.push(
            //     { label: 'Calendar View', action: 'showCalendarView', disabled: true },
            //     { label: 'Chart View', action: 'showChartView', disabled: true },
            //     { label: 'Set Current As Default', action: 'setAsDefault', disabled: true }
            // );
            
            return items;
        }
    },
    methods: {
        handleAction(action) {
            // Close the menu before action
            this.$emit('close-modal');

            switch (action) {
                case 'advancedSearch':
                    if (this.navigateToPath) {
                        this.navigateToPath('schedule/advanced-search');
                    }
                    break;
                default:
                    this.$modal.alert(`Action ${action} not implemented yet.`, 'Info');
            }
        }
    },
    template: html`
        <ul>
            <li v-for="item in menuItems" :key="item.action">
                <button 
                    @click="handleAction(item.action)"
                    :disabled="item.disabled"
                    >
                    {{ item.label }}
                </button>
            </li>
        </ul>
    `
};

export const ScheduleContent = {
    components: {
        ScheduleTableComponent,
        ScheduleFilterSelect,
        CalendarLayoutToggle
    },
    inject: ['$modal'],
    props: {
        navigateToPath: Function,
        containerPath: {
            type: String,
            default: 'schedule'
        }
    },
    computed: {
        cleanContainerPath() {
            return (this.containerPath || 'schedule').split('?')[0].replace(/\/calendar$/, '');
        },
        isCalendarView() {
            const params = NavigationRegistry.getNavigationParameters(this.containerPath);
            return params.layout === 'calendar';
        },
        // The effective base path for ScheduleFilterSelect URL sync
        scheduleBasePath() {
            return this.cleanContainerPath;
        },
        // Split filter into dateFilters and searchParams for table
        dateFilter() {
            if (!this.filter) return null;
            const { searchParams, ...dateFilter } = this.filter;
            return Object.keys(dateFilter).length > 0 ? dateFilter : null;
        },
        tableSearchParams() {
            return this.filter?.searchParams || null;
        }
    },
    data() {
        return {
            filter: null
        };
    },

    mounted() {
        // Register schedule navigation routes
        NavigationRegistry.registerNavigation('schedule', {
            routes: {}
        });

        // Register hamburger menu for schedule
        hamburgerMenuRegistry.registerMenu('schedule', {
            components: [ScheduleMenuComponent, DashboardToggleComponent],
            props: {
                navigateToPath: this.navigateToPath
            }
        });
    },
    methods: {
        handleSearchSelected(searchData) {
            // Handle empty/null search - clear the filter
            if (!searchData) {
                this.filter = null;
                return;
            }
            
            if (searchData.type === 'year') {
                // Handle year selection - use dateFilters array
                this.filter = { 
                    dateFilters: searchData.dateFilters || [
                        { column: 'Date', value: searchData.startDate, type: 'after' },
                        { column: 'Date', value: searchData.endDate, type: 'before' }
                    ]
                };
            } else {
                // Handle saved search or URL params
                this.applySavedSearch(searchData);
            }
        },
        
        applySavedSearch(searchData) {
            const filter = {
                searchParams: {}
            };
            
            // Use dateFilters array from saved search
            if (searchData.dateFilters && searchData.dateFilters.length > 0) {
                filter.dateFilters = searchData.dateFilters;
            }
            
            // Apply text filters
            if (searchData.textFilters && searchData.textFilters.length > 0) {
                searchData.textFilters.forEach(textFilter => {
                    if (textFilter.column && (textFilter.values || textFilter.value)) {
                        filter.searchParams[textFilter.column] = {
                            values: normalizeFilterValues(textFilter),
                            type: textFilter.type || 'contains'
                        };
                    }
                });
            }
            
            this.filter = filter;
        }
    },
    template: html`
        <slot>
            <div class="schedule-page">
                <ScheduleTableComponent
                    :filter="dateFilter"
                    :search-params="tableSearchParams"
                    :calendar-view="isCalendarView"
                    @navigate-to-path="navigateToPath"
                >
                    <template #header-area>
                        <div class="button-bar">
                            <ScheduleFilterSelect
                                :container-path="scheduleBasePath"
                                :include-years="true"
                                :start-year="2023"
                                :navigate-to-path="navigateToPath"
                                :show-advanced-button="true"
                                @search-selected="handleSearchSelected"
                            />
                            <CalendarLayoutToggle
                                :container-path="containerPath"
                                :navigate-to-path="navigateToPath"
                            />
                        </div>
                    </template>
                </ScheduleTableComponent>
            </div>
        </slot>
    `
};
