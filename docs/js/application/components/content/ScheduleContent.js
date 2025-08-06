import { html } from '../../index.js';
import { ScheduleTableComponent } from './ScheduleTable.js';


export const ScheduleContent = {
    components: {
        ScheduleTableComponent
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
    template: html`
        <div class="schedule-page">
            <p>Shows scheduled for this month and beyond.</p>
            <ScheduleTableComponent :filter="filter" />
        </div>
    `
};
