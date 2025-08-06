import { html } from '../../index.js';

export const PrimaryNavComponent = {
    props: {
        isMenuOpen: {
            type: Boolean,
            default: false
        },
        navigationItems: {
            type: Array,
            default: () => []
        },
        currentPage: {
            type: String,
            default: 'dashboard'
        },
        isAuthenticated: {
            type: Boolean,
            default: false
        },
        isAuthLoading: {
            type: Boolean,
            default: false
        },
        currentUser: {
            type: Object,
            default: () => null
        }
    },
    emits: [
        'toggle-menu',
        'navigate-to-page',
        'login',
        'logout'
    ],
    methods: {
        toggleMenu() {
            this.$emit('toggle-menu');
        },
        navigateToPage(pageFile) {
            this.$emit('navigate-to-page', pageFile);
        },
        login() {
            this.$emit('login');
        },
        logout() {
            this.$emit('logout');
        }
    },
    template: html`
        <header>
            <nav :class="{ 'open': isMenuOpen }">
                <a href="#"><img src="images/logo.png" alt="Top Shelf Exhibits" /></a>
                
                <span id="navbar">
                    <template v-if="isAuthenticated">
                        <a v-for="item in navigationItems" 
                           :key="item.file"
                           :class="{ 'active': currentPage === item.file }"
                           @click="navigateToPage(item.file); $emit('toggle-menu')"
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
                
                <button class="button-symbol white" @click="toggleMenu">
                    {{ isMenuOpen ? '×' : '≡' }}
                </button>
            </nav>
        </header>
    `
};


/**
 * Centralized navigation configuration and utilities
 */
export const NavigationConfig = {
    // Primary navigation items (just IDs)
    navigationItems: ['dashboard', 'packlist', 'inventory', 'schedule'],

    // Dynamic list of dashboard containers (now path-based)
    allDashboardContainers: [
        { path: 'dashboard/dashboard-settings', title: 'Dashboard Settings' }
    ],

    /**
     * Add a dashboard container by path
     * @param {string} containerPath - The container path to add
     * @param {string} title - Display title for the container
     */
    addDashboardContainer(containerPath, title = null) {
        // Check if container already exists
        const exists = this.allDashboardContainers.some(container => 
            container.path === containerPath
        );
        
        if (!exists) {
            const displayTitle = title || this.getDisplayNameForPath(containerPath);
            this.allDashboardContainers.push({ 
                path: containerPath, 
                title: displayTitle 
            });
        }
    },

    /**
     * Remove a dashboard container by path
     * @param {string} containerPath - The container path to remove
     */
    removeDashboardContainer(containerPath) {
        this.allDashboardContainers = this.allDashboardContainers.filter(container => 
            container.path !== containerPath
        );
    },

    /**
     * Check if a dashboard container exists for a path
     * @param {string} containerPath - The container path to check
     * @returns {boolean} Whether the container exists
     */
    hasDashboardContainer(containerPath) {
        return this.allDashboardContainers.some(container => container.path === containerPath);
    },

    /**
     * Get display name for a path
     * @param {string} path - The path to get display name for
     * @returns {string} Display name
     */
    getDisplayNameForPath(path) {
        const segments = path.split('/').filter(segment => segment.length > 0);
        const names = {
            'dashboard': 'Dashboard',
            'dashboard-settings': 'Dashboard',
            'inventory': 'Inventory',
            'categories': 'Categories',
            'search': 'Search',
            'reports': 'Reports',
            'packlist': 'Packlist',
            'schedule': 'Schedule',
            'furniture': 'Furniture',
            'electronics': 'Electronics',
            'signage': 'Signage'
        };

        // Return the last segment's display name, or generate one
        const lastSegment = segments[segments.length - 1];
        return names[lastSegment] || lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1);
    },

    /**
     * Get all paths that can be added to dashboard
     * @returns {Array} Array of available paths
     */
    getAvailablePaths() {
        return [
            'dashboard/dashboard-settings',
        ];
    },

    /**
     * Get paths not currently on dashboard
     * @returns {Array} Array of paths that can be added
     */
    getAddablePaths() {
        const currentPaths = this.allDashboardContainers.map(container => container.path);
        return this.getAvailablePaths().filter(path => !currentPaths.includes(path));
    },

    /**
     * Get navigation result for a page (containers configuration)
     * @param {string} pageFile - The page to navigate to
     * @param {boolean} isAuthenticated - Whether user is authenticated
     * @returns {Object} Navigation result with containers
     */
    getNavigationResult(pageFile, isAuthenticated = true) {
        // If not authenticated, return empty containers
        if (!isAuthenticated) {
            return {
                page: pageFile,
                containers: []
            };
        }

        // Get container configurations based on page type
        let containerConfigs;
        if (pageFile === 'dashboard') {
            // Return copy of current dashboard containers with proper structure
            containerConfigs = this.allDashboardContainers.map(container => ({
                path: container.path,
                title: container.title,
                containerPath: container.path,
                type: this.getTypeFromPath(container.path)
            }));
        } else {
            containerConfigs = [{ 
                path: pageFile, 
                title: this.getDisplayNameForPath(pageFile),
                containerPath: pageFile,
                type: this.getTypeFromPath(pageFile)
            }];
        }
        
        return {
            page: pageFile,
            containers: containerConfigs.map(config => ({
                ...config,
                options: {
                    containerPath: config.containerPath,
                    title: config.title
                }
            }))
        };
    },

    /**
     * Get container type from path
     * @param {string} path - The container path
     * @returns {string} Container type
     */
    getTypeFromPath(path) {
        const segments = path.split('/').filter(segment => segment.length > 0);
        return segments[segments.length - 1];
    },

    /**
     * Handle container expansion logic
     * @param {Object} containerData - Container data object
     * @param {string} currentPage - Current page identifier
     * @returns {Object} Expansion result with target page and action
     */
    handleContainerExpansion(containerData, currentPage) {
        // For dashboard cards, navigate to the specific path
        const targetPath = containerData.containerPath || containerData.path;
        const targetPage = targetPath.split('/')[0];
        
        if (targetPage !== currentPage) {
            return {
                action: 'navigate',
                targetPage: targetPage,
                containerPath: targetPath
            };
        } else {
            return {
                action: 'already_here',
                message: `You are already viewing the ${containerData.title} page.`
            };
        }
    },

    /**
     * Handle navigation back logic and execute the action
     * @param {Object} navigationData - Navigation data with containerId and parentPath
     * @param {Object} appContext - App context with containers and removeContainer method
     * @returns {Object} Navigation result with action and data
     */
    handleNavigateBack(navigationData, appContext) {
        const { containerId, parentPath } = navigationData;
        const container = appContext.containers.find(c => c.id === containerId);
        
        if (container) {
            // If previous location is dashboard, remove the container (close button behavior)
            if (parentPath === 'dashboard' || !parentPath) {
                appContext.removeContainer(containerId);
                return {
                    action: 'remove_container',
                    containerId
                };
            } else {
                container.containerPath = parentPath;
                return {
                    action: 'update_path',
                    containerId,
                    newPath: parentPath
                };
            }
        }
        
        return { action: 'no_action' };
    },

    /**
     * Handle navigation to path logic and execute the action
     * @param {Object} navigationData - Navigation data with containerId and targetPath
     * @param {Object} appContext - App context with containers
     * @returns {Object} Navigation result with action and data
     */
    handleNavigateToPath(navigationData, appContext) {
        const { containerId, targetPath, navigationMap } = navigationData;
        const container = appContext.containers.find(c => c.id === containerId);
        
        if (container) {
            // If we're on dashboard and trying to navigate to a different path,
            // navigate to that path as a new page (like expand button behavior)
            if (appContext.currentPage === 'dashboard' && targetPath !== 'dashboard') {
                // Extract the base page from the target path (e.g., 'inventory/items' -> 'inventory')
                const basePage = targetPath.split('/')[0];
                
                this.navigateToPage(basePage, appContext);
                
                // After navigation, find the container that matches the target path exactly
                appContext.$nextTick(() => {
                    const expandedContainer = appContext.containers.find(c => 
                        c.containerPath === basePage || c.containerType === basePage
                    );
                    if (expandedContainer) {
                        expandedContainer.containerPath = targetPath;
                    }
                });
                
                return {
                    action: 'navigate_to_new_page',
                    containerId,
                    targetPage: basePage,
                    targetPath: targetPath
                };
            }
            
            // If navigating to dashboard, navigate to dashboard page instead of updating path
            if (targetPath === 'dashboard') {
                this.navigateToPage('dashboard', appContext);
                return {
                    action: 'navigate_to_dashboard',
                    containerId,
                    targetPage: 'dashboard'
                };
            }
            
            container.containerPath = targetPath;
            
            // Update container's navigation map if provided
            if (navigationMap) {
                container.navigationMap = { ...container.navigationMap, ...navigationMap };
            }
            
            return {
                action: 'update_path',
                containerId,
                newPath: targetPath,
                navigationMap
            };
        }
        
        return { action: 'no_action' };
    },

    /**
     * Create a navigation handler for a specific container
     * @param {string} containerId - Container ID
     * @param {Function} handleNavigateToPath - Navigation handler function
     * @returns {Function} Path navigation handler
     */
    createNavigateToPathHandler(containerId, handleNavigateToPath) {
        return (path) => {
            handleNavigateToPath({
                containerId: containerId,
                targetPath: path
            });
        };
    },

    /**
     * Navigate to a specific page (Application-level function)
     * @param {string} pageFile - Page to navigate to
     * @param {Object} appContext - App context with currentPage, isMenuOpen, updateContainersForPage
     */
    navigateToPage(pageFile, appContext) {
        appContext.currentPage = pageFile;
        appContext.isMenuOpen = false; // Close menu when navigating
        console.log(`Navigating to: ${pageFile}`);
        // Update containers based on current page
        this.updateContainersForPage(pageFile, appContext);
    },

    /**
     * Update containers for a specific page (Application-level function)
     * @param {string} pageFile - Page file identifier
     * @param {Object} appContext - App context with containers, isAuthenticated, addContainer
     */
    async updateContainersForPage(pageFile, appContext) {
        // Clear existing containers
        appContext.containers = [];
        
        // Use centralized navigation logic
        const navigationResult = this.getNavigationResult(pageFile, appContext.isAuthenticated);
        
        // Create containers based on navigation result
        for (const containerConfig of navigationResult.containers) {
            await appContext.addContainer(
                containerConfig.type,
                containerConfig.title,
                containerConfig.options
            );
        }
        
        // If authenticated and no containers were added for non-dashboard pages, navigate to dashboard
        if (appContext.isAuthenticated && appContext.containers.length === 0 && pageFile !== 'dashboard') {
            this.navigateToPage('dashboard', appContext);
        }
    },

    /**
     * Handle container expansion (Application-level function)
     * @param {Object} containerData - Container data
     * @param {Object} appContext - App context with currentPage, showAlert
     */
    expandContainer(containerData, appContext) {
        console.log('Expanding container:', containerData);
        
        const expansionResult = this.handleContainerExpansion(containerData, appContext.currentPage);
        
        switch (expansionResult.action) {
            case 'navigate':
                this.navigateToPage(expansionResult.targetPage, appContext);
                
                // If the container has a path, update the new container to that path
                if (expansionResult.containerPath) {
                    appContext.$nextTick(() => {
                        // Find the container that matches the base page and update its path
                        const basePage = expansionResult.containerPath.split('/')[0];
                        const expandedContainer = appContext.containers.find(c => 
                            c.containerType === basePage || c.containerPath === basePage
                        );
                        if (expandedContainer) {
                            expandedContainer.containerPath = expansionResult.containerPath;
                        }
                    });
                }
                break;
            case 'already_here':
                appContext.showAlert(expansionResult.message, 'Already Here');
                break;
        }
    }
};