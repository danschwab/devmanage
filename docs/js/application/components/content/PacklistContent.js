import { html, modalManager, hamburgerMenuRegistry } from '../../index.js';
import { TabComponent } from '../interface/tabComponent.js';

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
                    modalManager.showAlert?.('Button action triggered!', 'Info');
                    break;
                default:
                    modalManager.showAlert?.(`Action ${action} not implemented yet.`, 'Info');
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
    components: {
        TabComponent
    },
    props: {
        showAlert: Function,
        containerPath: String,
        navigateToPath: Function
    },
    data() {
        // Use $root property system for initial state
        const root = this.$root || {};
        const cached = root.getProperty?.('tabSystems', 'packlist', { tabs: [], activeTab: '' }) || { tabs: [], activeTab: '' };
        // If no tabs, create a default tab
        if (!cached.tabs || cached.tabs.length === 0) {
            cached.tabs = [{
                name: 'main-packlist',
                label: 'Main Packlist',
                closable: false,
                content: '<div><p>Main packlist content goes here.</p></div>'
            }];
            cached.activeTab = 'main-packlist';
        }
        return {
            tabs: cached.tabs,
            activeTab: cached.activeTab
        };
    },
    computed: {
        // Expose NavigationConfig to the template
        NavigationConfig() {
            return NavigationConfig;
        },
        // Add modalManager reference for template access
        modalManager() {
            return modalManager;
        }
    },
    mounted() {
        // Ensure we emit hamburger component for the initial view
        hamburgerMenuRegistry.registerMenu('packlist', {
            components: [PacklistMenuComponent],
            props: {
                currentView: 'packlist',
            }
        });
    },
    methods: {
        handleTabChange(tabName) {
            this.activeTab = tabName;
            this.$root.setProperty('tabSystems', 'packlist', {
                tabs: this.tabs,
                activeTab: tabName
            });
        },
        handleTabClose(tabName) {
            const idx = this.tabs.findIndex(t => t.name === tabName);
            if (idx !== -1) {
                this.tabs.splice(idx, 1);
                // Open previous tab if possible, otherwise next tab, otherwise none
                if (this.activeTab === tabName) {
                    if (this.tabs.length === 0) {
                        this.activeTab = '';
                    } else if (idx > 0) {
                        this.activeTab = this.tabs[idx - 1].name;
                    } else {
                        this.activeTab = this.tabs[0].name;
                    }
                }
                this.$root.setProperty('tabSystems', 'packlist', {
                    tabs: this.tabs,
                    activeTab: this.activeTab
                });
            }
        },
        handleNewTab() {
            // Ensure unique tab name
            let newTabIdx = this.tabs.length + 1;
            let newTabName = `packlist-${newTabIdx}`;
            while (this.tabs.some(tab => tab.name === newTabName)) {
                newTabIdx++;
                newTabName = `packlist-${newTabIdx}`;
            }
            this.tabs.push({
                name: newTabName,
                label: `Packlist ${newTabIdx}`,
                closable: true,
                content: `<div><p>New packlist tab #${newTabIdx}.</p></div>`
            });
            this.activeTab = newTabName;
            this.$root.setProperty('tabSystems', 'packlist', {
                tabs: this.tabs,
                activeTab: newTabName
            });
        }
    },
    template: html `
        <div class="packlist-page">
            <h3>Pack List Management</h3>
            <p>Create and manage pack lists for exhibits and events.</p>
            <TabComponent
                :tabs="tabs"
                :active-tab="activeTab"
                :show-new-tab-button="true"
                @tab-change="handleTabChange"
                @tab-close="handleTabClose"
                @new-tab="handleNewTab"
            />
            <div style="margin-top: 1rem;">
                <button @click="modalManager.showAlert('Create new pack list functionality coming soon!', 'Info')">Create New Pack List</button>
                <button @click="modalManager.showAlert('Import from Inventor functionality coming soon!', 'Info')">Import from Inventor</button>
            </div>
        </div>
    `
};