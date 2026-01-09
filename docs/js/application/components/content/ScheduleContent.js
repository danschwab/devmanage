import { html, ScheduleTableComponent, hamburgerMenuRegistry, DashboardToggleComponent, NavigationRegistry, Requests, parsedateFilterParameter, SavedSearchSelect, AdvancedSearchComponent } from '../../index.js';

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
            
            // Only show Advanced Search if not already on advanced search page
            if (this.containerPath !== 'schedule/advanced-search') {
                items.push({ label: 'Advanced Search', action: 'advancedSearch' });
            }
            
            items.push(
                { label: 'Calendar View', action: 'showCalendarView', disabled: true },
                { label: 'Chart View', action: 'showChartView', disabled: true },
                { label: 'Set Current As Default', action: 'setAsDefault', disabled: true }
            );
            
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
        AdvancedSearchComponent,
        SavedSearchSelect
    },
    inject: ['$modal'],
    props: {
        navigateToPath: Function,
        containerPath: {
            type: String,
            default: 'schedule'
        }
    },
    data() {
        return {
            filter: null
        };
    },
    computed: {
        isAdvancedSearchView() {
            const cleanPath = this.containerPath.split('?')[0];
            return cleanPath === 'schedule/advanced-search';
        },
        // Split filter into dateFilter and searchParams for table
        dateFilter() {
            if (!this.filter) return null;
            const { searchParams, ...dateFilter } = this.filter;
            return Object.keys(dateFilter).length > 0 ? dateFilter : null;
        },
        tableSearchParams() {
            return this.filter?.searchParams || null;
        }
    },
    mounted() {
        // Register schedule navigation routes
        NavigationRegistry.registerNavigation('schedule', {
            routes: {
                'advanced-search': {
                    displayName: 'Advanced Search',
                    dashboardTitle: 'Schedule Advanced Search',
                    icon: 'search'
                }
            }
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
                // Handle year selection
                this.filter = { 
                    startDate: searchData.startDate, 
                    endDate: searchData.endDate,
                    year: searchData.year
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
            
            // Parse dateFilter from saved search
            if (searchData.dateFilter) {
                const dateFilter = parsedateFilterParameter(searchData.dateFilter);
                
                // Check if this is an overlap search (has overlapShowIdentifier)
                if (dateFilter.overlapShowIdentifier) {
                    // Convert overlapShowIdentifier to identifier for API
                    filter.identifier = dateFilter.overlapShowIdentifier;
                } else {
                    // Regular date filter
                    Object.assign(filter, dateFilter);
                }
            }
            
            // Add byShowDate flag if present
            if (searchData.byShowDate) {
                filter.byShowDate = true;
            }
            
            // Apply text filters
            if (searchData.textFilters && searchData.textFilters.length > 0) {
                searchData.textFilters.forEach(textFilter => {
                    if (textFilter.column && textFilter.value) {
                        filter.searchParams[textFilter.column] = textFilter.value;
                    }
                });
            }
            
            this.filter = filter;
        },
        openAdvancedSearchModal() {
            // Open AdvancedSearchComponent in a modal
            // The modal will auto-close when AdvancedSearchComponent emits 'close-modal'
            this.$modal.custom(AdvancedSearchComponent, {
                containerPath: this.containerPath,
                navigateToPath: this.navigateToPath,
                onSearchSelected: (searchData) => {
                    this.handleSearchSelected(searchData);
                }
            }, 'Advanced Search', { size: 'large' });
        }
    },
    template: html`
        <slot>
            <!-- Main Schedule View (Year Selector & Results Table) -->
            <div class="schedule-page">
                <ScheduleTableComponent 
                    :filter="dateFilter"
                    :search-params="tableSearchParams"
                    @navigate-to-path="navigateToPath"
                >
                    <template #header-area>
                        <div class="button-bar">
                            <SavedSearchSelect
                                container-path="schedule"
                                :include-years="true"
                                :start-year="2023"
                                :navigate-to-path="navigateToPath"
                                default-search="Upcoming"
                                @search-selected="handleSearchSelected"
                            />
                            <button @click="openAdvancedSearchModal">
                                Advanced
                            </button>
                        </div>
                    </template>
                </ScheduleTableComponent>
            </div>
        </slot>
    `
};
