import { Requests, html, modalManager, hamburgerMenuRegistry, TabComponent, PacklistTable } from '../../index.js';

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



export const PacklistTabsComponent = {
    props: {
        tabs: {
            type: Array,
            required: true
        },
        onSelect: {
            type: Function,
            required: true
        }
    },
    methods: {
        selectTab(tabName) {
            this.onSelect(tabName);
        }
    },
    template: html`
        <div>
            <h3>Select a Packlist Tab</h3>
            <ul>
                <li v-for="tab in tabs" :key="tab.title">
                    <button @click="selectTab(tab.title)">
                        {{ tab.title }}
                    </button>
                </li>
            </ul>
        </div>
    `
};



export const PacklistContent = {
    components: {
        TabComponent,
        PacklistTabsComponent
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
            cached.tabs = [];
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
        async handleNewTab() {
            let tabs = [];
            try {
                tabs = await Requests.getAvailableTabs('PACK_LISTS');
                // Remove "Current" tab if present
                tabs = tabs.filter(tab => tab.title !== 'TEMPLATE');
            } catch (err) {
                this.modalManager.showAlert('Failed to load packlist tabs: ' + err.message, 'Error');
                return;
            }
            const self = this;
            const handleSelect = async function(tabName) {
                let content;
                try {
                    content = await Requests.getPackList(tabName);
                } catch (err) {
                    self.modalManager.showAlert('Failed to load packlist: ' + err.message, 'Error');
                    return;
                }
                self.tabs.push({
                    name: tabName,
                    label: tabName,
                    closable: true,
                    component: PacklistTable,
                    props: { content, tabName }
                });
                self.activeTab = tabName;
                self.$root.setProperty('tabSystems', 'packlist', {
                    tabs: self.tabs,
                    activeTab: tabName
                });
                self.modalManager.removeModal && self.modalManager.removeModal('packlist-tabs-modal');
            };
            const modal = modalManager.createModal(
                'Open Packlist',
                PacklistTabsComponent,
                {
                    id: 'packlist-tabs-modal',
                    componentProps: {
                        tabs,
                        onSelect: handleSelect
                    }
                }
            );
            modalManager.showModal(modal.id);
        }
    },
    template: html `
        <div class="packlist-page">
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