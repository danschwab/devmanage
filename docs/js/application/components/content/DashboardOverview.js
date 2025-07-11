import { html } from '../../utils/template-helpers.js';

export const DashboardOverview = {
    props: {
        currentUser: Object
    },
    template: html `
        <div class="overview-content">
            <p>Welcome to your overview, {{ currentUser?.name || 'User' }}!</p>
            <p>System Status: <span style="color: green;">Online</span></p>
            <p>Last Login: Today, 9:30 AM</p>
            <p>Active Sessions: 3</p>
        </div>
    `
};

// Also export as OverviewContent for the new naming convention
export const OverviewContent = DashboardOverview;
