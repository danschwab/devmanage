import { ContainerComponent, containerManager } from './index.js';
import { InventoryTableComponent } from './index.js';
import { ModalComponent, modalManager } from './index.js';
import { PrimaryNavComponent } from './index.js';
import { Auth, authState } from './index.js';
import { NavigationConfig } from './index.js';
import { html } from './index.js';
import { 
    PacklistContent, 
    InventoryContent, 
    InterfacesContent 
} from './index.js';
import { DashboardToggleComponent, DashboardSettings, hamburgerMenuRegistry } from './index.js';
import { Requests } from './index.js';

const { createApp } = Vue;

// Vue app with inline template
const App = {
    components: {
        'app-container': ContainerComponent,
        'inventory-table': InventoryTableComponent,
        'app-modal': ModalComponent,
        'primary-nav': PrimaryNavComponent,
        'dashboard-settings': DashboardSettings,
        'packlist-content': PacklistContent,
        'inventory-content': InventoryContent,
        'interfaces-content': InterfacesContent,
        DashboardToggleComponent
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
            navigationItems: NavigationConfig.navigationItems.map(itemId => ({
                title: itemId.charAt(0).toUpperCase() + itemId.slice(1),
                file: itemId
            })),
            currentPage: 'dashboard',
            containers: [],
            dashboardContainers: [...NavigationConfig.allDashboardContainers],
            modals: [],
            tabSystems: {},
            dashboardLoading: false // <-- add dashboard loading flag
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

        // Load dashboard state from user data if authenticated
        if (this.isAuthenticated) {
            await this.loadDashboardState();
        }

        // Hide dashboard loading indicator after state is loaded
        this.dashboardLoading = false;

        // Create containers based on auth state
        this.updateContainersForPage(this.currentPage);
        
        // Add ESC key support for closing modals
        document.addEventListener('keydown', this.handleKeyDown);
        
        // Watch for auth state changes
        this.$watch('isAuthenticated', async (newVal) => {
            if (newVal) {
                await this.loadDashboardState();
            }
            this.updateContainersForPage(this.currentPage);
        });

        // Pass the reactive modals array to modalManager for all modal operations
        modalManager.setReactiveModals(this.modals);
    },
    beforeUnmount() {
        // Clean up event listener
        document.removeEventListener('keydown', this.handleKeyDown);
        // No interval to clear
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
            NavigationConfig.navigateToPage(pageFile, this);
        },
        async addContainer(type = 'default', title = '', options = {}) {
            const containerOptions = { ...options };
            
            const container = containerManager.createContainer(type, title, containerOptions);
            
            // Set container type and page for content determination
            container.containerType = type;
            container.currentPage = this.currentPage;
            container.containerPath = options.containerPath || '';
            
            // Debug logging for dashboard-settings containers
            if (type === 'dashboard-settings' || (options.containerPath && options.containerPath.includes('dashboard-settings'))) {
                console.log('Adding dashboard-settings container:', {
                    type,
                    title,
                    containerType: container.containerType,
                    containerPath: container.containerPath,
                    options
                });
            }
            
            this.containers.push(container);
            return container;
        },
        removeContainer(containerId) {
            const containerToRemove = this.containers.find(c => c.id === containerId);
            
            // If removing a dashboard container, remove it from NavigationConfig and save state
            if (this.currentPage === 'dashboard' && containerToRemove) {
                console.log('App: Removing dashboard container:', containerToRemove.containerPath || containerToRemove.containerType);
                
                // Use the container path if available, otherwise fall back to container type
                const pathToRemove = containerToRemove.containerPath || containerToRemove.containerType;
                
                // Update both the NavigationConfig and reactive data
                NavigationConfig.removeDashboardContainer(pathToRemove);
                this.dashboardContainers = [...NavigationConfig.allDashboardContainers];
                
                // Save the updated dashboard state
                this.saveDashboardState();
                
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
         * Load dashboard state from user data
         */
        async loadDashboardState() {
            if (!this.isAuthenticated || !this.currentUser?.email) {
                return;
            }
            this.dashboardLoading = true; // <-- set loading before async
            try {
                const savedDashboardData = await Requests.getUserData(this.currentUser.email, 'dashboard_containers');
                if (savedDashboardData && savedDashboardData.length > 0) {
                    const savedContainers = JSON.parse(savedDashboardData[0] || '[]');
                    NavigationConfig.allDashboardContainers = savedContainers;
                    this.dashboardContainers = [...savedContainers];
                    console.log('Dashboard state loaded:', savedContainers);
                } else {
                    console.log('No saved dashboard state found, using defaults');
                }
            } catch (error) {
                console.error('Failed to load dashboard state:', error);
            }
            this.dashboardLoading = false; // <-- unset loading after async
        },

        /**
         * Save current dashboard state to user data
         */
        async saveDashboardState() {
            if (!this.isAuthenticated || !this.currentUser?.email) {
                return;
            }
            
            try {
                const dashboardData = JSON.stringify(this.dashboardContainers);
                await Requests.storeUserData(this.currentUser.email, 'dashboard_containers', [dashboardData]);
                console.log('Dashboard state saved successfully');
            } catch (error) {
                console.warn('Failed to save dashboard state (continuing without saving):', error.message);
                // Show a non-intrusive notification to the user
                this.showAlert?.('Dashboard preferences could not be saved. Your changes will apply for this session only.', 'Warning');
                // Don't throw the error - let the application continue functioning
                // The dashboard state will still work in memory for the current session
            }
        },

        /**
         * Remove a container from the dashboard and refresh if on dashboard
         * @param {string} containerPath - The container path to remove
         */
        removeDashboardContainer(containerPath) {
            console.log('App: removeDashboardContainer called with:', containerPath);
            console.log('App: Dashboard containers before removal:', this.dashboardContainers);
            
            // Update both the NavigationConfig and reactive data
            NavigationConfig.removeDashboardContainer(containerPath);
            this.dashboardContainers = [...NavigationConfig.allDashboardContainers];
            
            console.log('App: Dashboard containers after removal:', this.dashboardContainers);
            
            // Save the updated state
            this.saveDashboardState();
            
            // If currently on dashboard, refresh to remove the container
            if (this.currentPage === 'dashboard') {
                this.updateContainersForPage('dashboard');
            }
        },

        /**
         * Add a container to the dashboard and refresh if on dashboard
         * @param {string} containerPath - The container path to add
         * @param {string} title - The title for the container (optional)
         */
        addToDashboard(containerPath, title = null) {
            console.log('App: addToDashboard called with:', containerPath, title);
            console.log('App: Dashboard containers before addition:', this.dashboardContainers);
            
            // Update both the NavigationConfig and reactive data
            NavigationConfig.addDashboardContainer(containerPath, title);
            this.dashboardContainers = [...NavigationConfig.allDashboardContainers];
            
            console.log('App: Dashboard containers after addition:', this.dashboardContainers);
            
            // Save the updated state
            this.saveDashboardState();
            
            // If currently on dashboard, refresh to show the new container
            if (this.currentPage === 'dashboard') {
                this.updateContainersForPage('dashboard');
            }
        },

        /**
         * Get paths that can be added to dashboard
         * @returns {Array} Array of addable paths
         */
        getAddablePaths() {
            return NavigationConfig.getAddablePaths();
        },

        /**
         * Get all available paths with their status
         * @returns {Array} Array of paths with isAdded status
         */
        getAllPathsWithStatus() {
            const allPaths = NavigationConfig.getAvailablePaths();
            // Use reactive dashboardContainers instead of NavigationConfig directly
            return allPaths.map(path => ({
                path,
                isAdded: this.dashboardContainers.some(container => container.path === path),
                displayName: NavigationConfig.getDisplayNameForPath(path)
            }));
        },

        async updateContainersForPage(pageFile) {
            await NavigationConfig.updateContainersForPage(pageFile, this);
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
        },
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
                    :navigation-map="container.navigationMap"
                    :card-style="currentPage === 'dashboard'"
                    :show-close-button="container.containerType !== 'dashboard-settings'"
                    :show-hamburger-menu="true"
                    :show-expand-button="currentPage === 'dashboard' && container.containerType !== 'dashboard-settings'"
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
                        <!-- dashboard-settings Content -->
                        <dashboard-settings 
                            v-if="container.containerType === 'dashboard-settings'"
                            :current-user="currentUser"
                            :get-all-paths-with-status="getAllPathsWithStatus"
                            :add-to-dashboard="addToDashboard"
                            :remove-dashboard-container="removeDashboardContainer">
                        </dashboard-settings>
                        
                        <!-- Packlist Content -->
                        <packlist-content 
                            v-else-if="container.containerType === 'packlist'"
                            :show-alert="showAlert"
                            :container-path="container.containerPath"
                            :navigate-to-path="createNavigateToPathHandler(container.id)">
                        </packlist-content>
                        
                        <!-- Inventory Content -->
                        <inventory-content 
                            v-else-if="container.containerType === 'inventory' || container.containerPath?.startsWith('inventory')"
                            :show-alert="showAlert"
                            :container-path="container.containerPath"
                            :navigate-to-path="createNavigateToPathHandler(container.id)">
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