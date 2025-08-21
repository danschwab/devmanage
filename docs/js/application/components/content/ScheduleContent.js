import { html, ScheduleTableComponent, NavigationRegistry } from '../../index.js';


export const ScheduleContent = {
    components: {
        ScheduleTableComponent
    },
    props: {
        navigateToPath: Function
    },
    data() {
        const today = new Date();
        const startDate = today.toISOString().slice(0, 10);
        const future = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
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
                calendar: {
                    displayName: 'Calendar View',
                    dashboardTitle: 'Schedule Calendar',
                    icon: 'calendar_month'
                },
                events: {
                    displayName: 'Events',
                    dashboardTitle: 'Schedule Events',
                    icon: 'event_note'
                },
                bookings: {
                    displayName: 'Bookings',
                    dashboardTitle: 'Event Bookings',
                    icon: 'book_online'
                }
            }
        });
    },
    computed: {
        // Direct navigation options for schedule
        scheduleNavigation() {
            return [
                { id: 'calendar', label: 'Calendar View', path: 'schedule/calendar' },
                { id: 'events', label: 'Events', path: 'schedule/events' },
                { id: 'bookings', label: 'Bookings', path: 'schedule/bookings' }
            ];
        }
    },
    template: html`
        <div class="schedule-page">
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
    `
};
