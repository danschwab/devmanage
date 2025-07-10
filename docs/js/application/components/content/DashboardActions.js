import { html } from '../../utils/template-helpers.js';

export const DashboardActions = {
    props: {
        navigateToPage: Function,
        addContainer: Function,
        showAlert: Function,
        showConfirm: Function
    },
    template: html `
        <div class="dashboard-actions" style="display: flex; flex-direction: column; gap: 0.5rem;">
            <button @click="navigateToPage('inventory')">Manage Inventory</button>
            <button @click="navigateToPage('packlist')">Create Pack List</button>
            <button @click="addContainer('dynamic', 'New Card', { cardStyle: true })">Add Card</button>
            <button @click="showAlert('This is a test alert modal!', 'Test Alert')">Show Alert</button>
            <button @click="showConfirm('Do you want to proceed?', 'Confirmation')">Show Confirm</button>
        </div>
    `
};
