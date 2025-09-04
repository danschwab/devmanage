import { ContainerComponent, containerManager } from './index.js';
import { InventoryTableComponent } from './index.js';
import { ModalComponent, modalManager } from './index.js';
import { PrimaryNavComponent } from './index.js';
import { Auth, authState } from './index.js';
import { NavigationRegistry } from './index.js';
import { html } from './index.js';
import { 
    PacklistContent, 
    InventoryContent, 
    ScheduleContent 
} from './index.js';
import { DashboardToggleComponent, hamburgerMenuRegistry } from './index.js';
import { Requests, getReactiveStore } from './index.js';

const { createApp } = Vue;

// Vue app with inline template
const App = {
    components: {
        'app-container': ContainerComponent,
        'inventory-table': InventoryTableComponent,
        'app-modal': ModalComponent,
        'primary-nav': PrimaryNavComponent,
        'packlist-content': PacklistContent,
        'inventory-content': InventoryContent,
        'schedule-content': ScheduleContent,
    },
    provide() {
        return {
            appContext: this,
            hamburgerMenuRegistry: hamburgerMenuRegistry
        };
    },
    data() {
        return {
            isMenuOpen: false,
            navigationItems: NavigationRegistry.primaryNavigation,
            currentPage: 'dashboard',
            containers: [],
            dashboardContainers: [],
            modals: [],
            tabSystems: {},
            dashboardLoading: false,
            reactiveTableData: {},
            dashboardStore: null,
            availablePaths: [],
            currentYear: new Date().getFullYear()
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
    
        // Show dashboard loading indicator before loading state
        this.dashboardLoading = true;
        
        if (this.isAuthenticated) {
            // Initialize dashboard reactive store if authenticated
            await NavigationRegistry.initializeDashboardStore();
            this.dashboardContainers = NavigationRegistry.dashboardStore?.data || [];
        }

        // Hide dashboard loading indicator after state is loaded
        this.dashboardLoading = false;

        // Create containers based on auth state
        NavigationRegistry.updateContainersForPage(this.currentPage, this);
        
        // Add ESC key support for closing modals
        document.addEventListener('keydown', this.handleKeyDown);
        
        // Watch for auth state changes
        this.$watch('isAuthenticated', async (newVal) => {
            if (newVal) {
                await NavigationRegistry.initializeDashboardStore();
                this.dashboardContainers = NavigationRegistry.dashboardStore?.data || [];
            }
            NavigationRegistry.updateContainersForPage(this.currentPage, this);
        });

        // Pass the reactive modals array to modalManager for all modal operations
        modalManager.setReactiveModals(this.modals);
    },
    beforeUnmount() {
        // Clean up event listener
        document.removeEventListener('keydown', this.handleKeyDown);
        // No interval to clear
        if (this.dashboardPathInterval) {
            clearInterval(this.dashboardPathInterval);
        }
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
                    // Always set location to dashboard after login
                    this.currentPage = 'dashboard';
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
            NavigationRegistry.navigateToPage(pageFile, this);
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
            const containerToRemove = this.containers.find(c => c.id === containerId);
            
            if (this.currentPage === 'dashboard' && containerToRemove) {
                console.log('App: Removing dashboard container:', containerToRemove.containerPath || containerToRemove.containerType);
                
                const pathToRemove = containerToRemove.containerPath || containerToRemove.containerType;
                
                NavigationRegistry.removeDashboardContainer(pathToRemove);
                this.dashboardContainers = NavigationRegistry.dashboardStore?.data || [];
                
                NavigationRegistry.saveDashboardState();
                
                console.log('App: Dashboard containers after removal:', this.dashboardContainers);
            }
            
            this.containers = this.containers.filter(c => c.id !== containerId);
            containerManager.removeContainer(containerId);
            
            // If authenticated and no containers remain on a non-dashboard page, navigate to dashboard
            if (this.isAuthenticated && this.containers.length === 0 && this.currentPage !== 'dashboard') {
                this.navigateToPage('dashboard');
            }
        },

        /**
         * Initialize dashboard reactive store
         */
        async initializeDashboardStore() {
            if (!this.isAuthenticated || !this.currentUser?.email) {
                return;
            }
            
            this.dashboardLoading = true;
            try {
                await NavigationRegistry.initializeDashboardStore();
                this.dashboardContainers = NavigationRegistry.dashboardStore?.data || [];
                console.log('Dashboard state loaded from NavigationRegistry store');
            } catch (error) {
                console.error('Failed to initialize dashboard store:', error);
            }
            this.dashboardLoading = false;
        },

        /**
         * Save current dashboard state using reactive store
         */
        async saveDashboardState() {
            try {
                await NavigationRegistry.saveDashboardState();
                console.log('Dashboard state saved successfully');
            } catch (error) {
                console.warn('Failed to save dashboard state (continuing without saving):', error.message);
                this.showAlert?.('Dashboard preferences could not be saved. Your changes will apply for this session only.', 'Warning');
            }
        },

        removeDashboardContainer(containerPath) {
            NavigationRegistry.removeDashboardContainer(containerPath);
            this.dashboardContainers = NavigationRegistry.dashboardStore?.data || [];
            NavigationRegistry.saveDashboardState();
            if (this.currentPage === 'dashboard') {
                NavigationRegistry.updateContainersForPage('dashboard', this);
            }
        },

        addToDashboard(containerPath, title = null) {
            NavigationRegistry.addDashboardContainer(containerPath, title);
            this.dashboardContainers = NavigationRegistry.dashboardStore?.data || [];
            NavigationRegistry.saveDashboardState();
            if (this.currentPage === 'dashboard') {
                NavigationRegistry.updateContainersForPage('dashboard', this);
            }
        },

        /**
         * Get all available paths with their status
         * @returns {Array} Array of paths with isAdded status
         */
        getAllPathsWithStatus() {
            return NavigationRegistry.getAvailablePaths().map(path => ({
                path,
                isAdded: NavigationRegistry.hasDashboardContainer(path),
                displayName: NavigationRegistry.getDisplayName(path)
            }));
        },

        async updateContainersForPage(pageFile) {
            await NavigationRegistry.updateContainersForPage(pageFile, this);
        },
        expandContainer(containerData) {
            NavigationRegistry.expandContainer(containerData, this);
        },
        handleNavigateBack(navigationData) {
            NavigationRegistry.handleNavigateBack(navigationData, this);
        },
        handleNavigateToPath(navigationData) {
            NavigationRegistry.handleNavigateToPath(navigationData, this);
        },
        createNavigateToPathHandler(containerId) {
            return NavigationRegistry.createNavigateToPathHandler(containerId, (navigationData) => {
                NavigationRegistry.handleNavigateToPath(navigationData, this);
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

        /**
         * Generic property getter for module state
         * @param {string} module - Module name/key
         * @param {string} prop - Property name
         * @param {*} defaultValue - Value to return if not set
         */
        getProperty(module, prop, defaultValue = undefined) {
            if (this[module] && prop in this[module]) {
                return this[module][prop];
            }
            return defaultValue;
        },
        /**
         * Generic property setter for module state
         * @param {string} module - Module name/key
         * @param {string} prop - Property name
         * @param {*} value - Value to set
         */
        setProperty(module, prop, value) {
            if (!this[module]) this[module] = {};
            this[module][prop] = value;
        }
    },
    setup() {
        return { modalManager };
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
                <!-- Dashboard loading indicator -->
                <div v-if="dashboardLoading && currentPage === 'dashboard'" class="container dashboard-card" style="display:flex; align-items: center; justify-content: center;">
                    <div class="loading-message">
                        <img src="images/loading.gif" alt="..."/>
                        <p>Loading dashboard cards...</p>
                    </div>
                </div>
                <!-- Dynamic containers inserted directly here -->
                <app-container 
                    v-for="container in containers" 
                    :key="container.id"
                    :ref="'container-' + container.id"
                    :container-id="container.id"
                    :container-type="container.containerType"
                    :title="container.title"
                    :container-path="container.containerPath"
                    :full-path="container.fullPath"
                    :navigation-parameters="container.navigationParameters || {}"
                    :navigation-map="container.navigationMap"
                    :card-style="currentPage === 'dashboard'"
                    :show-close-button="true"
                    :show-hamburger-menu="true"
                    :show-expand-button="currentPage === 'dashboard'"
                    :page-location="container.pageLocation"
                    :container-data="container"
                    :app-context="{ 
                        addToDashboard, 
                        removeDashboardContainer, 
                        dashboardContainers,
                        showAlert
                    }"
                    @close-container="removeContainer"
                    @navigate-back="handleNavigateBack"
                    @navigate-to-path="handleNavigateToPath"
                    @navigation-mapping-added="handleNavigationMappingAdded"
                    @show-hamburger-menu="showHamburgerMenuModal"
                    @expand-container="expandContainer"
                    v-if="!dashboardLoading || currentPage !== 'dashboard'"
                >
                    <template #content>
                        <!-- Inventory Content -->
                        <inventory-content 
                            v-if="container.containerType === 'inventory' || container.containerPath?.startsWith('inventory')"
                            :show-alert="showAlert"
                            :container-path="container.containerPath"
                            :full-path="container.fullPath"
                            :navigation-parameters="container.navigationParameters || {}"
                            :navigate-to-path="createNavigateToPathHandler(container.id)"
                        >
                        </inventory-content>
                        <!-- Packlist Content -->
                        <packlist-content 
                            v-else-if="container.containerType === 'packlist' || container.containerPath?.startsWith('packlist')"
                            :show-alert="showAlert"
                            :container-path="container.containerPath"
                            :full-path="container.fullPath"
                            :navigation-parameters="container.navigationParameters || {}"
                            :navigate-to-path="createNavigateToPathHandler(container.id)"
                        >
                        </packlist-content>
                        
                        <!-- Schedule Content -->
                        <schedule-content 
                            v-else-if="container.containerType === 'schedule' || container.containerPath?.startsWith('schedule')"
                            :container-path="container.containerPath"
                            :full-path="container.fullPath"
                            :navigation-parameters="container.navigationParameters || {}"
                            :navigate-to-path="createNavigateToPathHandler(container.id)">
                        </schedule-content>
                        
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
                        &copy; {{ currentYear }} Top Shelf Exhibits
                        <br>
                        <a href="https://topshelfexhibits.com">www.topshelfexhibits.com</a>
                    </p>
                </footer>
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
                        :components="modal.components"
                        :component-props="modal.componentProps"
                        @close-modal="modalManager.removeModal(modal.id)"
                    ></app-modal>
                </transition-group>
            </div>
        </div>
    `
};

// Initialize the app
const app = createApp(App);
app.mount('body');