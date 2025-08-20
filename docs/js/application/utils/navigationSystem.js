import { html } from '../index.js';

/**
 * Unified Navigation System
 * 
 * Consolidates all navigation-related functionality into a single module:
 * - NavigationRegistry: Central route definitions and path management
 * - NavigationUtils: Helper functions for navigation operations
 * - NavigationConfig: Legacy compatibility layer
 * - PrimaryNavComponent: Main navigation component
 * - BreadcrumbComponent: Breadcrumb navigation component
 * - NavigationInit: Initialization and dynamic route loading
 */

// =============================================================================
// NAVIGATION REGISTRY - Central route definitions
// =============================================================================

export const NavigationRegistry = {
    /**
     * Primary navigation structure - defines the main sections and their hierarchical paths
     */
    routes: {
        // Dashboard section
        dashboard: {
            path: 'dashboard',
            displayName: 'Dashboard',
            icon: 'dashboard',
            isMainSection: true,
            children: {
                'dashboard-settings': {
                    path: 'dashboard/dashboard-settings',
                    displayName: 'Dashboard Settings',
                    icon: 'settings'
                }
            }
        },

        // Inventory section
        inventory: {
            path: 'inventory',
            displayName: 'Inventory',
            icon: 'inventory_2',
            isMainSection: true,
            children: {
                categories: {
                    path: 'inventory/categories',
                    displayName: 'Categories',
                    icon: 'category',
                    children: {
                        // Dynamic category paths will be added at runtime
                        // e.g., 'inventory/categories/furniture'
                    }
                },
                search: {
                    path: 'inventory/search',
                    displayName: 'Search',
                    icon: 'search'
                },
                reports: {
                    path: 'inventory/reports',
                    displayName: 'Reports',
                    icon: 'assessment'
                },
                items: {
                    path: 'inventory/items',
                    displayName: 'All Items',
                    icon: 'list'
                }
            }
        },

        // Packlist section
        packlist: {
            path: 'packlist',
            displayName: 'Packlists',
            icon: 'list_alt',
            isMainSection: true,
            children: {
                // Dynamic packlist paths will be added at runtime
                // e.g., 'packlist/{packlist-name}'
                active: {
                    path: 'packlist/active',
                    displayName: 'Active Packlists',
                    icon: 'play_arrow'
                },
                archived: {
                    path: 'packlist/archived',
                    displayName: 'Archived Packlists',
                    icon: 'archive'
                },
                templates: {
                    path: 'packlist/templates',
                    displayName: 'Templates',
                    icon: 'content_copy'
                }
            }
        },

        // Schedule section
        schedule: {
            path: 'schedule',
            displayName: 'Schedule',
            icon: 'event',
            isMainSection: true,
            children: {
                calendar: {
                    path: 'schedule/calendar',
                    displayName: 'Calendar View',
                    icon: 'calendar_month'
                },
                events: {
                    path: 'schedule/events',
                    displayName: 'Events',
                    icon: 'event_note'
                },
                bookings: {
                    path: 'schedule/bookings',
                    displayName: 'Bookings',
                    icon: 'book_online'
                }
            }
        }
    },

    /**
     * Quick access to main navigation items (for primary nav bar)
     */
    get primaryNavigation() {
        return Object.entries(this.routes)
            .filter(([key, route]) => route.isMainSection)
            .map(([key, route]) => ({
                id: key,
                title: route.displayName,
                file: key,
                path: route.path,
                icon: route.icon
            }));
    },

    /**
     * Get route configuration by path
     * @param {string} path - The route path (e.g., 'inventory/categories')
     * @returns {Object|null} Route configuration or null if not found
     */
    getRoute(path) {
        const pathSegments = path.split('/').filter(segment => segment.length > 0);
        
        if (pathSegments.length === 0) return null;
        
        let currentRoute = this.routes[pathSegments[0]];
        
        for (let i = 1; i < pathSegments.length && currentRoute?.children; i++) {
            currentRoute = currentRoute.children[pathSegments[i]];
        }
        
        return currentRoute || null;
    },

    /**
     * Get display name for a path
     * @param {string} path - The path to get display name for
     * @returns {string} Display name
     */
    getDisplayName(path) {
        const route = this.getRoute(path);
        if (route) {
            return route.displayName;
        }
        
        // Fallback: generate from last segment
        const segments = path.split('/').filter(segment => segment.length > 0);
        const lastSegment = segments[segments.length - 1];
        return lastSegment ? lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1) : 'Unknown';
    },

    /**
     * Get breadcrumb trail for a path
     * @param {string} path - The path to generate breadcrumbs for
     * @returns {Array} Array of breadcrumb items
     */
    getBreadcrumbs(path) {
        const pathSegments = path.split('/').filter(segment => segment.length > 0);
        const breadcrumbs = [];
        let currentPath = '';
        
        for (const segment of pathSegments) {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
            const route = this.getRoute(currentPath);
            
            breadcrumbs.push({
                id: segment,
                path: currentPath,
                displayName: route?.displayName || this.getDisplayName(segment),
                icon: route?.icon
            });
        }
        
        return breadcrumbs;
    },

    /**
     * Check if a path exists in the registry
     * @param {string} path - Path to check
     * @returns {boolean} Whether the path exists
     */
    pathExists(path) {
        return this.getRoute(path) !== null;
    },

    /**
     * Get the main section for a path (e.g., 'inventory' for 'inventory/categories')
     * @param {string} path - The path to get main section for
     * @returns {string} Main section name
     */
    getMainSection(path) {
        const pathSegments = path.split('/').filter(segment => segment.length > 0);
        return pathSegments[0] || '';
    },

    /**
     * Add a dynamic route at runtime (useful for categories, etc.)
     * @param {string} parentPath - Parent path where to add the route
     * @param {string} routeKey - Key for the new route
     * @param {Object} routeConfig - Route configuration
     */
    addDynamicRoute(parentPath, routeKey, routeConfig) {
        const parentRoute = this.getRoute(parentPath);
        if (parentRoute) {
            if (!parentRoute.children) {
                parentRoute.children = {};
            }
            parentRoute.children[routeKey] = {
                path: `${parentPath}/${routeKey}`,
                ...routeConfig
            };
        }
    },

    /**
     * Get all available paths (for dashboard container configuration)
     * @returns {Array} Array of all available paths
     */
    getAllPaths() {
        const paths = [];
        
        const collectPaths = (routeObj, currentPath = '') => {
            if (routeObj.path && currentPath !== routeObj.path) {
                paths.push(routeObj.path);
            }
            
            if (routeObj.children) {
                Object.values(routeObj.children).forEach(child => {
                    collectPaths(child, routeObj.path);
                });
            }
        };
        
        Object.values(this.routes).forEach(route => {
            collectPaths(route);
        });
        
        return paths;
    },

    /**
     * Get quick action routes for a section (for content components)
     * @param {string} section - Main section (e.g., 'inventory')
     * @returns {Array} Array of quick action routes
     */
    getQuickActions(section) {
        const route = this.getRoute(section);
        if (!route?.children) return [];
        
        return Object.entries(route.children)
            .filter(([key, child]) => !child.isHidden)
            .map(([key, child]) => ({
                id: key,
                label: child.displayName,
                path: child.path,
                icon: child.icon
            }));
    },

    /**
     * Legacy compatibility methods (to maintain existing API)
     */
    
    // For NavigationConfig.navigationItems compatibility
    get navigationItems() {
        return this.primaryNavigation.map(item => item.id);
    },
    
    // For NavigationConfig.getDisplayNameForPath compatibility  
    getDisplayNameForPath(path) {
        return this.getDisplayName(path);
    },

    /**
     * Initialize dynamic routes based on common patterns
     */
    initializeDynamicRoutes() {
        // Add common inventory categories (these could come from API in the future)
        const commonCategories = ['furniture', 'electronics', 'signage', 'accessories'];
        
        commonCategories.forEach(category => {
            this.addDynamicRoute('inventory/categories', category, {
                displayName: category.charAt(0).toUpperCase() + category.slice(1),
                icon: 'folder'
            });
        });
    }
};

// =============================================================================
// NAVIGATION UTILITIES - Helper functions
// =============================================================================

export const NavigationUtils = {
    /**
     * Get parent path for navigation back functionality
     * @param {string} currentPath - Current path
     * @returns {string|null} Parent path or null if at root
     */
    getParentPath(currentPath) {
        if (!currentPath || currentPath === 'dashboard') return null;
        
        const segments = currentPath.split('/').filter(segment => segment.length > 0);
        if (segments.length <= 1) return 'dashboard';
        
        return segments.slice(0, -1).join('/');
    }
};

// =============================================================================
// NAVIGATION INITIALIZATION - Setup and dynamic route loading
// =============================================================================

export class NavigationInit {
    static initialized = false;

    /**
     * Initialize the navigation system
     * @param {Object} options - Configuration options
     * @param {Function} options.apiLoader - Function to load dynamic data from API
     */
    static async initialize(options = {}) {
        if (this.initialized) return;

        console.log('Initializing navigation system...');

        // Initialize static routes
        NavigationRegistry.initializeDynamicRoutes();

        // Load dynamic categories if API loader is provided
        if (options.apiLoader) {
            await this.loadDynamicRoutes(options.apiLoader);
        }

        this.initialized = true;
        console.log('Navigation system initialized');
    }

    /**
     * Load dynamic routes from API or other data sources
     * @param {Function} apiLoader - Function to load data
     */
    static async loadDynamicRoutes(apiLoader) {
        try {
            // Example: Load inventory categories from API
            const categories = await apiLoader.getInventoryCategories?.();
            
            if (categories && Array.isArray(categories)) {
                categories.forEach(category => {
                    NavigationRegistry.addDynamicRoute(
                        'inventory/categories',
                        category.slug || category.name.toLowerCase(),
                        {
                            displayName: category.name,
                            icon: category.icon || 'folder',
                            metadata: category
                        }
                    );
                });
                console.log(`Added ${categories.length} dynamic inventory categories`);
            }

        } catch (error) {
            console.warn('Failed to load some dynamic routes:', error);
            // Continue with initialization even if dynamic routes fail
        }
    }

    /**
     * Get initialization status
     */
    static get isInitialized() {
        return this.initialized;
    }
}

/**
 * Auto-initialize with basic setup if no custom initialization is called
 */
export function autoInitializeNavigation() {
    if (!NavigationInit.isInitialized) {
        NavigationInit.initialize();
    }
}

// =============================================================================
// PRIMARY NAVIGATION COMPONENT - Main navigation bar
// =============================================================================

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

// =============================================================================
// BREADCRUMB COMPONENT - Breadcrumb navigation
// =============================================================================

export const BreadcrumbComponent = {
    props: {
        containerPath: {
            type: String,
            default: ''
        },
        title: {
            type: String,
            default: ''
        },
        cardStyle: {
            type: Boolean,
            default: false
        },
        navigationMap: {
            type: Object,
            default: () => ({})
        },
        containerId: {
            type: String,
            required: true
        }
    },
    data() {
        return {
            // Local navigation map that can be extended at runtime
            localNavigationMap: {}
        };
    },
    mounted() {
        // Initialize local navigation map with props
        this.localNavigationMap = { ...this.navigationMap };
        
        // Add any segments from current path that aren't already mapped
        this.pathSegments.forEach(segment => {
            if (!this.localNavigationMap[segment]) {
                this.addNavigationMapping(segment);
            }
        });
    },
    computed: {
        pathSegments() {
            if (!this.containerPath) return [];
            return this.containerPath.split('/').filter(segment => segment.length > 0);
        },
        pathSegmentsWithNames() {
            if (!this.pathSegments.length) return [];
            
            return this.pathSegments.map((segment, index) => ({
                id: segment,
                name: this.getSegmentName(segment),
                index: index
            }));
        },
        breadcrumbTitle() {
            if (this.pathSegmentsWithNames.length === 0) return this.title;
            return this.pathSegmentsWithNames[this.pathSegmentsWithNames.length - 1].name;
        },
        displayTitle() {
            // Always use breadcrumb title if containerPath exists, otherwise fallback to title
            return this.containerPath ? this.breadcrumbTitle : this.title;
        },
        currentPage() {
            if (this.pathSegments.length === 0) return '';
            return this.pathSegments[0];
        },
        canGoBack() {
            if (this.pathSegments.length <= 1) return false;
            
            // Don't allow going back if the parent path would be 'dashboard'
            const parentSegments = this.pathSegments.slice(0, -1);
            if (parentSegments.length === 1 && parentSegments[0] === 'dashboard') {
                return false;
            }
            
            return true;
        },
        parentPath() {
            if (this.pathSegments.length <= 1) return '';
            return this.pathSegments.slice(0, -1).join('/');
        }
    },
    methods: {
        /**
         * Get human-readable name for a segment, building it if not found
         */
        getSegmentName(segmentId) {
            if (this.localNavigationMap[segmentId]) {
                return this.localNavigationMap[segmentId];
            }
            
            // Try to get from NavigationRegistry first
            const registryName = NavigationRegistry.getDisplayName(segmentId);
            if (registryName !== 'Unknown') {
                this.addNavigationMapping(segmentId, registryName);
                return registryName;
            }
            
            // Auto-generate name if not found
            const generatedName = segmentId.charAt(0).toUpperCase() + segmentId.slice(1);
            this.addNavigationMapping(segmentId, generatedName);
            return generatedName;
        },
        /**
         * Add a new navigation mapping
         */
        addNavigationMapping(segmentId, displayName = null) {
            if (!displayName) {
                displayName = NavigationRegistry.getDisplayName(segmentId);
                if (displayName === 'Unknown') {
                    displayName = segmentId.charAt(0).toUpperCase() + segmentId.slice(1);
                }
            }
            this.localNavigationMap[segmentId] = displayName;
            
            // Emit event to parent to share this mapping
            this.$emit('navigation-mapping-added', {
                containerId: this.containerId,
                segmentId: segmentId,
                displayName: displayName
            });
        },
        /**
         * Update navigation mapping from external source
         */
        updateNavigationMapping(segmentId, displayName) {
            this.localNavigationMap[segmentId] = displayName;
        },
        navigateToBreadcrumb(index) {
            if (index < this.pathSegments.length - 1) {
                const targetPath = this.pathSegments.slice(0, index + 1).join('/');
                
                // Ensure all segments in target path have mappings
                this.pathSegments.slice(0, index + 1).forEach(segment => {
                    if (!this.localNavigationMap[segment]) {
                        this.addNavigationMapping(segment);
                    }
                });
                
                this.$emit('navigate-to-path', {
                    containerId: this.containerId,
                    targetPath: targetPath,
                    currentPath: this.containerPath,
                    navigationMap: this.localNavigationMap
                });
            }
        }
    },
    template: html`
        <div v-if="containerPath" class="breadcrumb-nav">
            <!-- Full breadcrumb path for non-card containers -->
            <div v-if="!cardStyle" class="breadcrumb-path">
                <template v-for="(segment, index) in pathSegmentsWithNames" :key="segment.id">
                    <span 
                        class="breadcrumb-segment"
                        :class="{ 
                            'active': index === pathSegmentsWithNames.length - 1,
                            'page-highlight': index === 0 
                        }"
                        @click="navigateToBreadcrumb(index)">
                        {{ segment.name }}
                    </span>
                    <span v-if="index < pathSegmentsWithNames.length - 1" class="breadcrumb-separator">/</span>
                </template>
            </div>
            <!-- Current location only for dashboard cards -->
            <h2 v-else class="breadcrumb-current">{{ displayTitle }}</h2>
        </div>
        <!-- Traditional Title (fallback) -->
        <h2 v-else-if="title">{{ displayTitle }}</h2>
    `
};

// =============================================================================
// NAVIGATION CONFIG - Legacy compatibility and main navigation logic
// =============================================================================

/**
 * Centralized navigation configuration and utilities
 * Updated to use NavigationRegistry for unified path management
 */
export const NavigationConfig = {
    // Use NavigationRegistry for primary navigation
    get navigationItems() {
        return NavigationRegistry.navigationItems;
    },

    // Use NavigationRegistry for primary navigation data
    get primaryNavigation() {
        return NavigationRegistry.primaryNavigation;
    },

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
     * Get display name for a path (delegate to NavigationRegistry)
     * @param {string} path - The path to get display name for
     * @returns {string} Display name
     */
    getDisplayNameForPath(path) {
        return NavigationRegistry.getDisplayName(path);
    },

    /**
     * Get all paths that can be added to dashboard (delegate to NavigationRegistry)
     * @returns {Array} Array of available paths
     */
    getAvailablePaths() {
        // Filter to only include non-main-section paths for dashboard
        return NavigationRegistry.getAllPaths().filter(path => path.includes('/'));
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
