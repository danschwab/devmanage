import { ContainerComponent, containerManager } from './components/containerComponent.js';
import { TestTableComponent } from './components/testTableComponent.js';
import { ModalComponent, modalManager } from './components/modalComponent.js';
import { PrimaryNavComponent } from './components/navigation/primaryNavComponent.js';
import { Auth, authState } from './utils/auth.js';
import { NavigationConfig } from './utils/navigation.js';
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
        'primary-nav': PrimaryNavComponent,
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
            navigationItems: NavigationConfig.navigationItems.map(itemId => ({
                title: itemId.charAt(0).toUpperCase() + itemId.slice(1),
                file: itemId
            })),
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
            NavigationConfig.navigateToPage(pageFile, this);
        },
        async addContainer(type = 'default', title = '', options = {}) {
            const containerOptions = { ...options };
            
            const container = containerManager.createContainer(type, title, containerOptions);
            
            // Set container type and page for content determination
            container.containerType = type;
            container.currentPage = this.currentPage;
            container.containerPath = options.containerPath || '';
            
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
            await NavigationConfig.updateContainersForPage(pageFile, this);
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
            NavigationConfig.expandContainer(containerData, this);
        },
        handleNavigateBack(navigationData) {
            NavigationConfig.handleNavigateBack(navigationData, this);
        },
        handleNavigateToPath(navigationData) {
            NavigationConfig.handleNavigateToPath(navigationData, this);
        },
        createNavigateToPathHandler(containerId) {
            return NavigationConfig.createNavigateToPathHandler(containerId, (navigationData) => {
                NavigationConfig.handleNavigateToPath(navigationData, this);
            });
        },
        /**
         * Handle navigation mapping added by a container
         */
        handleNavigationMappingAdded(mappingData) {
            const { segmentId, displayName } = mappingData;
            
            // Add to container manager's global map
            containerManager.addGlobalNavigationMapping(segmentId, displayName);
        },
    },
    template: html `
        <div id="app">
            <!-- Primary Navigation Component -->
            <primary-nav
                :is-menu-open="isMenuOpen"
                :navigation-items="navigationItems"
                :current-page="currentPage"
                :is-authenticated="isAuthenticated"
                :is-auth-loading="isAuthLoading"
                :current-user="currentUser"
                @toggle-menu="toggleMenu"
                @navigate-to-page="navigateToPage"
                @login="login"
                @logout="logout">
            </primary-nav>

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
                    :container-path="container.containerPath"
                    :navigation-map="container.navigationMap"
                    :card-style="currentPage === 'dashboard'"
                    :show-close-button="container.containerType !== 'overview'"
                    :show-hamburger-menu="!container.containerType.startsWith('dashboard')"
                    :show-expand-button="currentPage === 'dashboard' && container.containerType !== 'overview'"
                    :page-location="container.pageLocation"
                    :container-data="container"
                    @close-container="removeContainer"
                    @navigate-back="handleNavigateBack"
                    @navigate-to-path="handleNavigateToPath"
                    @navigation-mapping-added="handleNavigationMappingAdded"
                    @show-hamburger-menu="showHamburgerMenuModal"
                    @expand-container="expandContainer">
                    <template #content>
                        <!-- Overview Content -->
                        <dashboard-overview 
                            v-if="container.containerType === 'overview'"
                            :current-user="currentUser">
                        </dashboard-overview>
                        
                        <!-- Stats Content -->
                        <dashboard-stats 
                            v-else-if="container.containerType === 'stats'">
                        </dashboard-stats>
                        
                        <!-- Actions Content -->
                        <dashboard-actions 
                            v-else-if="container.containerType === 'actions'"
                            :navigate-to-page="navigateToPage"
                            :add-container="addContainer"
                            :show-alert="showAlert"
                            :show-confirm="showConfirm">
                        </dashboard-actions>
                        
                        <!-- Packlist Content -->
                        <packlist-content 
                            v-else-if="container.containerType === 'packlist'"
                            :show-alert="showAlert"
                            :container-path="container.containerPath"
                            :navigate-to-path="createNavigateToPathHandler(container.id)">
                        </packlist-content>
                        
                        <!-- Inventory Content -->
                        <inventory-content 
                            v-else-if="container.containerType === 'inventory'"
                            :show-alert="showAlert"
                            :container-path="container.containerPath"
                            :navigate-to-path="createNavigateToPathHandler(container.id)"
                            @custom-hamburger-content="container.customHamburgerContent = $event">
                        </inventory-content>
                        
                        <!-- Interfaces Content -->
                        <interfaces-content 
                            v-else-if="container.containerType === 'interfaces'">
                        </interfaces-content>
                        
                        <!-- Default Content -->
                        <div v-else class="default-container">
                            <p>Container {{ container.id }} loaded successfully!</p>
                            <p>Type: {{ container.containerType }}</p>
                            <p>Path: {{ container.containerPath || 'No path' }}</p>
                        </div>
                    </template>
                </app-container>
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