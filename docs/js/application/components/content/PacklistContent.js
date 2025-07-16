import { html } from '../../index.js';

export const PacklistMenuComponent = {
    props: {
        currentView: String,
        showAlert: Function
    },
    computed: {
        menuItems() {
            switch (this.currentView) {
                default:
                    return [
                        { label: 'Refresh', action: 'button' },
                        { label: 'Help', action: '' }
                    ];
            }
        }
    },
    methods: {
        handleAction(action) {
            switch (action) {
                case 'button':
                    this.showAlert?.('Button action triggered!', 'Info');
                    break;
                default:
                    this.showAlert?.(`Action ${action} not implemented yet.`, 'Info');
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



export const PacklistContent = {
    props: {
        showAlert: Function
    },
    template: html `
        <div class="packlist-page">
            <h3>Pack List Management</h3>
            <p>Create and manage pack lists for exhibits and events.</p>
            <div style="margin-top: 1rem;">
                <button @click="showAlert('Create new pack list functionality coming soon!', 'Info')">Create New Pack List</button>
                <button @click="showAlert('Import from Inventor functionality coming soon!', 'Info')">Import from Inventor</button>
            </div>
        </div>
    `
};
