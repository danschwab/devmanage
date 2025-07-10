import { html } from '../../utils/template-helpers.js';

export const DashboardOverview = {
    props: {
        currentUser: Object
    },
    template: html `
        <div class="dashboard-overview">
            <p>Welcome to your dashboard, {{ currentUser?.name || 'User' }}!</p>
            <p>System Status: <span style="color: green;">Online</span></p>
            <p>Last Login: Today, 9:30 AM</p>
            <p>Active Sessions: 3</p>
        </div>
    `
};
