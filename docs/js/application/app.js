import { ContainerComponent, containerManager } from './components/containerComponent.js';
import { TestTableComponent } from './components/testTableComponent.js';
import { ModalComponent, modalManager } from './components/modalComponent.js';
import { Auth, authState } from './utils/auth.js';
import { html } from './utils/template-helpers.js';
import { 
    DashboardOverview, 
    DashboardStats, 
    DashboardActions, 
    PacklistContent, 
    InventoryContent, 
    InterfacesContent 
} from './components/content/index.js';

const { createApp } = Vue;

// Vue app with inline template
const App = {
    components: {
        'app-container': ContainerComponent,
        'test-table': TestTableComponent,
        'app-modal': ModalComponent,
        'dashboard-overview': DashboardOverview,
        'dashboard-stats': DashboardStats,
        'dashboard-actions': DashboardActions,
        'packlist-content': PacklistContent,
        'inventory-content': InventoryContent,
        'interfaces-content': InterfacesContent
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
        async addContainer(type = 'default', title = '', options = {}) {
            const container = containerManager.createContainer(type, title, options);
            
            // Set container type and page for content determination
            container.containerType = type;
            container.currentPage = this.currentPage;
            
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
        async updateContainersForPage(pageFile) {
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
                    await this.addContainer('dashboard-overview', 'Dashboard Overview', { cardStyle: true });
                    await this.addContainer('dashboard-stats', 'Quick Stats', { cardStyle: true });
                    await this.addContainer('dashboard-actions', 'Quick Actions', { cardStyle: true });
                    break;
                case 'packlist':
                    await this.addContainer('packlist', 'Pack Lists');
                    break;
                case 'inventory':
                    await this.addContainer('inventory', 'Inventory Management');
                    break;
                case 'interfaces':
                    await this.addContainer('test', 'Interface Testing');
                    break;
                default:
                    await this.addContainer('default', `${pageFile} Page`);
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
    },
    template: html `
        <div id="app">
            <header>
                <nav :class="{ 'open': isMenuOpen }">
                    <a href="#"><img src="images/logo.png" alt="Top Shelf Exhibits" /></a>
                    
                    <span id="navbar">
                        <template v-if="isAuthenticated">
                            <a v-for="item in navigationItems" 
                               :key="item.file"
                               :class="{ 'active': currentPage === item.file }"
                               @click="navigateToPage(item.file); isMenuOpen = false"
                               href="#">
                                {{ item.title }}
                            </a>
                        </template>
                        
                        <button v-if="!isAuthenticated" 
                                @click="login" 
                                :disabled="isAuthLoading"
                                class="login-out-button active">
                            {{ isAuthLoading ? 'Loading...' : 'Login' }}
                        </button>
                        <button v-else 
                                @click="logout" 
                                :disabled="isAuthLoading"
                                class="login-out-button">
                            {{ isAuthLoading ? 'Logging out...' : 'Logout (' + (currentUser?.name || '') + ')' }}
                        </button>
                    </span>
                    
                    <button class="button-symbol gray" @click="toggleMenu">
                        {{ isMenuOpen ? '×' : '≡' }}
                    </button>
                </nav>
            </header>

            <div id="app-content">
                <!-- Show auth error if present -->
                <div v-if="authError" class="error-message" style="background: #ffebee; border: 1px solid #f44336; padding: 1rem; margin: 1rem; border-radius: 4px; color: #c62828;">
                    <strong>Authentication Error:</strong> {{ authError }}
                    <button @click="authError = null" style="float: right; background: none; border: none; font-size: 1.2em; cursor: pointer;">&times;</button>
                </div>

                <!-- Dynamic containers inserted directly here -->
                <app-container 
                    v-for="container in containers" 
                    :key="container.id"
                    :container-id="container.id"
                    :container-type="container.containerType"
                    :title="container.title"
                    :card-style="container.cardStyle"
                    :show-close-button="container.containerType !== 'dashboard-overview'"
                    :show-hamburger-menu="!container.containerType.startsWith('dashboard')"
                    :show-expand-button="container.cardStyle"
                    :page-location="container.pageLocation"
                    :hamburger-menu-content="getHamburgerMenuContent(container.containerType)"
                    :container-data="container"
                    @close-container="removeContainer"
                    @show-hamburger-menu="showHamburgerMenuModal"
                    @expand-container="expandContainer">
                    <template #content>
                        <!-- Dashboard Overview Content -->
                        <dashboard-overview 
                            v-if="container.containerType === 'dashboard-overview'"
                            :current-user="currentUser">
                        </dashboard-overview>
                        
                        <!-- Dashboard Stats Content -->
                        <dashboard-stats 
                            v-else-if="container.containerType === 'dashboard-stats'">
                        </dashboard-stats>
                        
                        <!-- Dashboard Actions Content -->
                        <dashboard-actions 
                            v-else-if="container.containerType === 'dashboard-actions'"
                            :navigate-to-page="navigateToPage"
                            :add-container="addContainer"
                            :show-alert="showAlert"
                            :show-confirm="showConfirm">
                        </dashboard-actions>
                        
                        <!-- Packlist Content -->
                        <packlist-content 
                            v-else-if="container.containerType === 'packlist'"
                            :show-alert="showAlert">
                        </packlist-content>
                        
                        <!-- Inventory Content -->
                        <inventory-content 
                            v-else-if="container.containerType === 'inventory'"
                            :show-alert="showAlert">
                        </inventory-content>
                        
                        <!-- Test/Interfaces Content -->
                        <interfaces-content 
                            v-else-if="container.containerType === 'test'">
                        </interfaces-content>
                        
                        <!-- Default Content -->
                        <div v-else class="default-container">
                            <p>Container {{ container.id }} loaded successfully!</p>
                            <p>Type: {{ container.containerType }}</p>
                            <p>Page: {{ currentPage }}</p>
                        </div>
                    </template>
                </app-container>
                
                <!-- Show message when not authenticated and no containers -->
                <div v-if="!isAuthenticated && containers.length === 0" class="welcome-message" style="text-align: center; padding: 2rem; margin: 2rem; background: #f5f5f5; border-radius: 8px;">
                    <div v-if="isAuthLoading">
                        <p>Initializing authentication...</p>
                        <div style="font-size: 2em;">⟳</div>
                    </div>
                    <div v-else>
                        <h2>Welcome to Top Shelf Live Inventory</h2>
                        <p>Please log in to access the application.</p>
                        <button @click="login" :disabled="isAuthLoading" class="login-button" style="padding: 0.5rem 1rem; font-size: 1.1em; background: #007cba; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            {{ isAuthLoading ? 'Authenticating...' : 'Login with Google' }}
                        </button>
                    </div>
                </div>
                
                <footer>
                    <p>
                        &copy; 2024 Top Shelf Exhibits
                        <br>
                        <a href="https://topshelfexhibits.com">www.topshelfexhibits.com</a>
                    </p>
                </footer>
            </div>
        </div>
        <!-- Modal Space -->
        <div id="modal-space">
            <transition-group name="fade">
                <app-modal 
                    v-for="modal in modals" 
                    :key="modal.id"
                    :modal-id="modal.id"
                    :title="modal.title"
                    :is-visible="modal.isVisible"
                    @close-modal="removeModal">
                    <template #content>
                        <div v-if="modal.content" v-html="modal.content"></div>
                        <div v-else>
                            <p>Modal {{ modal.id }} content</p>
                        </div>
                    </template>
                </app-modal>
            </transition-group>
        </div>
    `
};

// Initialize the app directly
createApp(App).mount('body');
