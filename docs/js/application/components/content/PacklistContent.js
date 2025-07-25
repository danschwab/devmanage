import { Requests, html, modalManager, hamburgerMenuRegistry, TabComponent, TabsListComponent, PacklistTable } from '../../index.js';

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
        TabComponent,
        TabsListComponent // Use TabsListComponent instead of PacklistTabsComponent
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
            activeTab: cached.activeTab,
            globalLoading: false // only for initial tab list loading
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
        async handleNewTab(tabName) {
            // If tabName is provided and tab already exists, fire open-tab instead
            if (tabName) {
                const existingTabIdx = this.tabs.findIndex(t => t.name === tabName);
                if (existingTabIdx !== -1) {
                    this.activeTab = tabName;
                    this.$emit && this.$emit('open-tab', tabName);
                    this.$root.setProperty('tabSystems', 'packlist', {
                        tabs: this.tabs,
                        activeTab: tabName
                    });
                    return;
                }
            }
            // Make modal tabs reactive
            const modalTabs = Vue.reactive([]);
            // Use a reactive loading flag
            const modalLoading = Vue.ref(true);

            const modal = modalManager.createModal(
                'Open Packlist',
                TabsListComponent,
                {
                    id: 'packlist-tabs-modal',
                    componentProps: {
                        tabs: modalTabs,
                        onSelect: () => { },
                        isLoading: modalLoading.value,
                        loadingMessage: 'Getting shows from production schedule...'
                    }
                }
            );
            modalManager.showModal(modal.id);

            let tabs = [];
            try {
                tabs = await Requests.getAvailableTabs('PACK_LISTS');
                tabs = tabs.filter(tab => tab.title !== 'TEMPLATE');
            } catch (err) {
                this.modalManager.showAlert('Failed to load packlist tabs: ' + err.message, 'Error');
                modalManager.removeModal && modalManager.removeModal('packlist-tabs-modal');
                return;
            }

            // Update modal to remove loading and show tab selection
            modalLoading.value = false;
            modal.componentProps.isLoading = modalLoading.value;
            modalTabs.splice(0, modalTabs.length, ...tabs);
            modal.componentProps.onSelect = async (selectedTabName) => {
                // Prevent duplicate tab creation
                const existingTabIdx = this.tabs.findIndex(t => t.name === selectedTabName);
                if (existingTabIdx !== -1) {
                    modalManager.removeModal && modalManager.removeModal('packlist-tabs-modal');
                    this.activeTab = selectedTabName;
                    this.$emit && this.$emit('open-tab', selectedTabName);
                    this.$root.setProperty('tabSystems', 'packlist', {
                        tabs: this.tabs,
                        activeTab: selectedTabName
                    });
                    return;
                }
                modalManager.removeModal && modalManager.removeModal('packlist-tabs-modal');
                // Add tab with loading state, let PacklistTable fetch its own data
                this.tabs.push({
                    name: selectedTabName,
                    label: selectedTabName,
                    closable: true,
                    component: PacklistTable,
                    props: { tabName: selectedTabName, isLoading: true },
                    isLoading: true
                });
                this.activeTab = selectedTabName;
                this.$root.setProperty('tabSystems', 'packlist', {
                    tabs: this.tabs,
                    activeTab: selectedTabName
                });
            };
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
        </div>
    `
};