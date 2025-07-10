import { ContainerComponent, containerManager } from './components/containerComponent.js';
import { TestTableComponent } from './components/testTableComponent.js';
import { ModalComponent, modalManager } from './components/modalComponent.js';
import { Auth, authState } from './utils/auth.js';

const { createApp } = Vue;

// Function to load template from external file
async function loadTemplate(templateName) {
    try {
        const response = await fetch(`html/templates/${templateName}.html`);
        if (!response.ok) {
            throw new Error(`Failed to load template: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error('Error loading template:', error);
        return '<div>Error loading template</div>';
    }
}

// Vue app that uses external template
const App = {
    components: {
        'app-container': ContainerComponent,
        'test-table': TestTableComponent,
        'app-modal': ModalComponent
    },
    data() {
        return {
            isMenuOpen: false,
            navigationItems: [
                { title: 'Dashboard', file: 'dashboard' },
                { title: 'Pack Lists', file: 'packlist' },
                { title: 'Inventory', file: 'inventory' },
                { title: 'Test', file: 'interfaces' }
            ],
            currentPage: 'dashboard',
            containers: [],
            modals: []
        };
    },
    computed: {
        // Make auth state reactive in the component
        isAuthenticated() {
            return authState.isAuthenticated;
        },
        currentUser() {
            return authState.user;
        },
        isAuthLoading() {
            return authState.isLoading;
        },
        authError() {
            return authState.error;
        }
    },
    async mounted() {
        // Initialize authentication on app mount
        await Auth.initialize();
        
        // Create containers based on auth state
        this.updateContainersForPage(this.currentPage);
        
        // Add ESC key support for closing modals
        document.addEventListener('keydown', this.handleKeyDown);
        
        // Watch for auth state changes
        this.$watch('isAuthenticated', (newVal) => {
            this.updateContainersForPage(this.currentPage);
        });
    },
    beforeUnmount() {
        // Clean up event listener
        document.removeEventListener('keydown', this.handleKeyDown);
    },
    methods: {
        toggleMenu() {
            this.isMenuOpen = !this.isMenuOpen;
        },
        async login() {
            try {
                const success = await Auth.login();
                if (success) {
                    console.log('Login successful');
                    // Containers will update automatically via watcher
                } else {
                    console.error('Login failed');
                }
            } catch (error) {
                console.error('Login error:', error);
            }
        },
        async logout() {
            try {
                await Auth.logout();
                console.log('Logout successful');
                // Containers will update automatically via watcher
            } catch (error) {
                console.error('Logout error:', error);
            }
        },
        navigateToPage(pageFile) {
            this.currentPage = pageFile;
            console.log(`Navigating to: ${pageFile}`);
            // Update containers based on current page
            this.updateContainersForPage(pageFile);
        },
        addContainer(type = 'default', title = '', options = {}) {
            const container = containerManager.createContainer(type, title, options);
            this.containers.push(container);
            return container;
        },
        removeContainer(containerId) {
            this.containers = this.containers.filter(c => c.id !== containerId);
            containerManager.removeContainer(containerId);
            
            // If authenticated and no containers remain, navigate to dashboard
            if (this.isAuthenticated && this.containers.length === 0) {
                this.navigateToPage('dashboard');
            }
        },
        addAuthenticatedContainers() {
            this.containers = [];
            this.addContainer('dashboard', 'Dashboard Overview');
            this.addContainer('actions', 'Quick Actions');
        },
        updateContainersForPage(pageFile) {
            // Clear existing containers
            this.containers = [];
            
            // If not authenticated, don't show any containers
            if (!this.isAuthenticated) {
                return;
            }
            
            // Add containers based on the current page when authenticated
            switch(pageFile) {
                case 'dashboard':
                    // Create dashboard cards
                    this.addContainer('dashboard-overview', 'Dashboard Overview', { cardStyle: true });
                    this.addContainer('dashboard-stats', 'Quick Stats', { cardStyle: true });
                    this.addContainer('dashboard-table', 'Recent Data', { cardStyle: true });
                    this.addContainer('dashboard-actions', 'Quick Actions', { cardStyle: true });
                    break;
                case 'packlist':
                    this.addContainer('packlist', 'Pack Lists');
                    break;
                case 'inventory':
                    this.addContainer('inventory', 'Inventory Management');
                    break;
                case 'interfaces':
                    this.addContainer('test', 'Interface Testing');
                    break;
                default:
                    this.addContainer('default', `${pageFile} Page`);
            }
            
            // If authenticated and no containers were added, navigate to dashboard
            if (this.isAuthenticated && this.containers.length === 0) {
                this.navigateToPage('dashboard');
            }
        },
        handleKeyDown(event) {
            if (event.key === 'Escape') {
                // Close all modals on ESC
                this.modals.forEach(modal => {
                    if (modal.isVisible) {
                        this.hideModal(modal.id);
                    }
                });
            }
        },
        // Modal management methods
        addModal(title = '', content = '', options = {}) {
            const modal = modalManager.createModal(title, content, options);
            this.modals.push(modal);
            return modal;
        },
        showModal(modalId) {
            const modal = modalManager.showModal(modalId);
            if (modal) {
                // Update the modal in the reactive array
                const index = this.modals.findIndex(m => m.id === modalId);
                if (index !== -1) {
                    this.modals[index].isVisible = true;
                }
            }
            return modal;
        },
        hideModal(modalId) {
            const modal = modalManager.hideModal(modalId);
            if (modal) {
                // Update the modal in the reactive array
                const index = this.modals.findIndex(m => m.id === modalId);
                if (index !== -1) {
                    this.modals[index].isVisible = false;
                }
            }
            return modal;
        },
        removeModal(modalId) {
            this.modals = this.modals.filter(m => m.id !== modalId);
            modalManager.removeModal(modalId);
        },
        // Quick modal creation methods
        showAlert(message, title = 'Alert') {
            const modal = this.addModal(title, message);
            this.showModal(modal.id);
            return modal;
        },
        showConfirm(message, title = 'Confirm') {
            const modal = this.addModal(title, message);
            this.showModal(modal.id);
            return modal;
        },
        showHamburgerMenuModal(menuData) {
            const modal = this.addModal(menuData.title, menuData.content);
            this.showModal(modal.id);
        },
        
        getHamburgerMenuContent(containerType) {
            switch (containerType) {
                case 'welcome':
                    return `
                        <ul style="list-style: none; padding: 0;">
                            <li><button onclick="window.vueApp.refreshWelcomeContent()">Refresh Content</button></li>
                            <li><button onclick="window.vueApp.showSystemInfo()">System Information</button></li>
                            <li><button onclick="window.vueApp.viewLogs()">View Logs</button></li>
                        </ul>
                    `;
                case 'actions':
                    return `
                        <ul style="list-style: none; padding: 0;">
                            <li><button onclick="window.vueApp.exportData()">Export Data</button></li>
                            <li><button onclick="window.vueApp.importData()">Import Data</button></li>
                            <li><button onclick="window.vueApp.clearCache()">Clear Cache</button></li>
                        </ul>
                    `;
                case 'stats':
                    return `
                        <ul style="list-style: none; padding: 0;">
                            <li><button onclick="window.vueApp.refreshStats()">Refresh Statistics</button></li>
                            <li><button onclick="window.vueApp.exportReport()">Export Report</button></li>
                            <li><button onclick="window.vueApp.scheduleReport()">Schedule Report</button></li>
                        </ul>
                    `;
                case 'test':
                    return `
                        <ul style="list-style: none; padding: 0;">
                            <li><button onclick="window.vueApp.refreshTestData()">Refresh Test Data</button></li>
                            <li><button onclick="window.vueApp.exportTestResults()">Export Results</button></li>
                            <li><button onclick="window.vueApp.runDiagnostics()">Run Diagnostics</button></li>
                        </ul>
                    `;
                case 'dynamic':
                    return `
                        <ul style="list-style: none; padding: 0;">
                            <li><button onclick="window.vueApp.editContainer()">Edit Container</button></li>
                            <li><button onclick="window.vueApp.duplicateContainer()">Duplicate</button></li>
                            <li><button onclick="window.vueApp.containerSettings()">Settings</button></li>
                        </ul>
                    `;
                default:
                    return `
                        <ul style="list-style: none; padding: 0;">
                            <li><button onclick="window.vueApp.refreshContainer()">Refresh</button></li>
                            <li><button onclick="window.vueApp.containerInfo()">Container Info</button></li>
                        </ul>
                    `;
            }
        },

        // Hamburger menu action handlers
        refreshWelcomeContent() {
            console.log('Refreshing welcome content...');
            this.showAlert('Welcome content refreshed!', 'Success');
        },

        showSystemInfo() {
            const systemInfo = `
                <div style="text-align: left;">
                    <h4>System Information</h4>
                    <p><strong>Browser:</strong> ${navigator.userAgent}</p>
                    <p><strong>Platform:</strong> ${navigator.platform}</p>
                    <p><strong>Language:</strong> ${navigator.language}</p>
                    <p><strong>Online:</strong> ${navigator.onLine ? 'Yes' : 'No'}</p>
                </div>
            `;
            this.addModal('System Information', systemInfo);
        },

        viewLogs() {
            console.log('Opening logs...');
            this.showAlert('Log viewer functionality coming soon!', 'Info');
        },

        exportData() {
            console.log('Exporting data...');
            this.showAlert('Data export functionality coming soon!', 'Info');
        },

        importData() {
            console.log('Importing data...');
            this.showAlert('Data import functionality coming soon!', 'Info');
        },

        clearCache() {
            console.log('Clearing cache...');
            this.showAlert('Cache cleared successfully!', 'Success');
        },

        refreshStats() {
            console.log('Refreshing statistics...');
            this.showAlert('Statistics refreshed!', 'Success');
        },

        exportReport() {
            console.log('Exporting report...');
            this.showAlert('Report export functionality coming soon!', 'Info');
        },

        scheduleReport() {
            console.log('Scheduling report...');
            this.showAlert('Report scheduling functionality coming soon!', 'Info');
        },

        refreshTestData() {
            console.log('Refreshing test data...');
            this.showAlert('Test data refreshed!', 'Success');
        },

        exportTestResults() {
            console.log('Exporting test results...');
            this.showAlert('Test results export functionality coming soon!', 'Info');
        },

        runDiagnostics() {
            console.log('Running diagnostics...');
            this.showAlert('Diagnostics completed successfully!', 'Success');
        },

        editContainer() {
            console.log('Editing container...');
            this.showAlert('Container editing functionality coming soon!', 'Info');
        },

        duplicateContainer() {
            console.log('Duplicating container...');
            this.showAlert('Container duplicated!', 'Success');
        },

        containerSettings() {
            console.log('Opening container settings...');
            this.showAlert('Container settings functionality coming soon!', 'Info');
        },

        refreshContainer() {
            console.log('Refreshing container...');
            this.showAlert('Container refreshed!', 'Success');
        },

        containerInfo() {
            console.log('Showing container info...');
            this.showAlert('Container information functionality coming soon!', 'Info');
        },

        expandContainer(containerData) {
            console.log('Expanding container:', containerData);
            
            // If the container has a specific page location, navigate to it
            if (containerData.pageLocation) {
                this.navigateToPage(containerData.pageLocation);
                return;
            }
            
            // Map dashboard containers to their corresponding pages
            const pageMapping = {
                'dashboard-overview': 'dashboard',
                'dashboard-stats': 'inventory',
                'dashboard-table': 'packlist',
                'dashboard-actions': 'dashboard'
            };
            
            // Check if there's a page mapping for this container type
            const targetPage = pageMapping[containerData.containerType];
            if (targetPage) {
                this.navigateToPage(targetPage);
            } else {
                // For containers without specific pages, show them in expanded view
                this.showAlert(`Expanded view for "${containerData.title}" - Full page functionality coming soon!`, 'Expand Container');
            }
        }
    }
};

// Initialize the app with external template
async function initApp() {
    const template = await loadTemplate('app');
    App.template = template;
    createApp(App).mount('body');
}

// Initialize the app when the page loads
initApp();
