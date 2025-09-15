import { html } from '../index.js';
import { getReactiveStore } from './reactiveStores.js';
import { Requests } from '../index.js';
import { authState } from '../index.js';

export const NavigationRegistry = {
    /**
     * Main navigation structure - initialized with only main sections
     * Child routes are registered dynamically by components
     */
    routes: {
        // Dashboard section
        dashboard: {
            path: 'dashboard',
            displayName: 'Dashboard',
            icon: 'dashboard',
            isMainSection: true,
            children: {}
        },

        // Inventory section
        inventory: {
            path: 'inventory',
            displayName: 'Inventory',
            icon: 'inventory_2',
            isMainSection: true,
            children: {}
        },

        // Packlist section
        packlist: {
            path: 'packlist',
            displayName: 'Packlists',
            icon: 'list_alt',
            isMainSection: true,
            children: {}
        },

        // Schedule section
        schedule: {
            path: 'schedule',
            displayName: 'Schedule',
            icon: 'event',
            isMainSection: true,
            children: {}
        }
    },

    // Dashboard containers reactive store
    dashboardStore: null,
    dashboardLoading: false,

    /**
     * Initialize dashboard reactive store
     */
    async initializeDashboardStore() {
        if (!authState.isAuthenticated || !authState.user?.email) {
            return;
        }
        
        this.dashboardLoading = true;
        try {
            // Create reactive store for dashboard state
            this.dashboardStore = getReactiveStore(
                Requests.getUserData,
                Requests.storeUserData,
                [authState.user.email, 'dashboard_containers'],
                false // Don't auto-load
            );

            // Wait for initial load
            await this.dashboardStore.load('Loading dashboard...');

            // Use store data directly as dashboard containers
            if (!this.dashboardStore.data || this.dashboardStore.data.length === 0) {
                // Initialize with defaults if no saved data
                this.dashboardStore.setData([]);
                console.log('No saved dashboard state found, using defaults');
            } else {
                console.log('Dashboard state loaded from reactive store:', this.dashboardStore.data);
            }
        } catch (error) {
            console.error('Failed to initialize dashboard store:', error);
            // Initialize with empty data to allow functioning
            if (!this.dashboardStore) {
                this.dashboardStore = getReactiveStore(null, null, [], false);
            }
            this.dashboardStore.setData([]);
        }
        this.dashboardLoading = false;
    },

    /**
     * Register navigation routes for a section
     * @param {string} section - Main section (e.g., 'inventory')
     * @param {Object} navigationConfig - Navigation configuration
     * @param {Object} navigationConfig.routes - Route definitions
     * @param {Object} [navigationConfig.quickActions] - Quick action definitions
     */
    registerNavigation(section, navigationConfig) {
        if (!this.routes[section]) {
            console.warn(`NavigationRegistry: Cannot register routes for unknown section '${section}'`);
            return;
        }

        // Add routes to the section's children
        if (navigationConfig.routes) {
            Object.entries(navigationConfig.routes).forEach(([routeKey, routeConfig]) => {
                this.addDynamicRoute(section, routeKey, routeConfig);
            });
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
     * Parse path with parameters (supports query string parameters)
     * @param {string} path - The path with potential parameters (e.g., 'inventory/categories?search=item&hideRows=false')
     * @returns {Object} Object with path, parameters, and route information
     */
    parsePath(path) {
        // Split path from query parameters
        const [cleanPath, queryString] = path.split('?');
        const parameters = {};
        
        // Parse query string parameters
        if (queryString) {
            const searchParams = new URLSearchParams(queryString);
            for (const [key, value] of searchParams) {
                // Try to parse boolean and number values
                if (value === 'true') parameters[key] = true;
                else if (value === 'false') parameters[key] = false;
                else if (!isNaN(value) && !isNaN(parseFloat(value))) parameters[key] = parseFloat(value);
                else parameters[key] = value;
            }
        }
        
        const route = this.getRoute(cleanPath);
        
        return {
            path: cleanPath,
            fullPath: path,
            parameters,
            route,
            hasParameters: Object.keys(parameters).length > 0
        };
    },

    /**
     * Build path with parameters
     * @param {string} path - The base path
     * @param {Object} parameters - Parameters to append as query string
     * @returns {string} Full path with parameters
     */
    buildPath(path, parameters = {}) {
        if (!parameters || Object.keys(parameters).length === 0) {
            return path;
        }
        
        const queryString = new URLSearchParams();
        Object.entries(parameters).forEach(([key, value]) => {
            queryString.append(key, String(value));
        });
        
        return `${path}?${queryString.toString()}`;
    },

    /**
     * Get display name for a path
     * @param {string} path - The path to get display name for
     * @param {boolean} [preferDashboardTitle=false] - If true, prefer dashboardTitle over displayName
     * @returns {string} Display name or dashboard title
     */
    getDisplayName(path, preferDashboardTitle = false) {
        const route = this.getRoute(path);
        if (route) {
            if (preferDashboardTitle && route.dashboardTitle) {
                return route.dashboardTitle;
            }
            return route.displayName;
        }
        
        // Fallback: generate from last segment
        const segments = path.split('/').filter(segment => segment.length > 0);
        const lastSegment = segments[segments.length - 1];
        return lastSegment ? lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1) : 'Unknown';
    },

    /**
     * Get dashboard title for a path (custom title for dashboard display)
     * @param {string} path - The path to get dashboard title for
     * @returns {string} Dashboard title or fallback to display name
     */
    getDashboardTitle(path) {
        return this.getDisplayName(path, true);
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
     * @param {string} [routeConfig.displayName] - Display name for navigation
     * @param {string} [routeConfig.dashboardTitle] - Custom title for dashboard display
     * @param {string} [routeConfig.icon] - Icon for the route
     */
    addDynamicRoute(parentPath, routeKey, routeConfig) {
        const parentRoute = this.getRoute(parentPath);
        if (parentRoute) {
            if (!parentRoute.children) {
                parentRoute.children = {};
            }
            const routePath = `${parentPath}/${routeKey}`;
            if (parentRoute.children[routeKey]) {
                // Update existing route's information
                Object.assign(parentRoute.children[routeKey], {
                    path: routePath,
                    ...routeConfig
                });
            } else {
                // Add new route
                parentRoute.children[routeKey] = {
                    path: routePath,
                    ...routeConfig
                };
            }
        }
    },

    /**
     * Get all available paths (for dashboard container configuration)
     * @param {boolean} [subPathsOnly=false] - If true, only return paths with sub-sections (containing '/')
     * @returns {Array} Array of available paths
     */
    getAllPaths(subPathsOnly = false) {
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
        
        return subPathsOnly ? paths.filter(path => path.includes('/')) : paths;
    },

    /**
     * Get dashboard containers from reactive store
     */
    get allDashboardContainers() {
        if (!this.dashboardStore || !this.dashboardStore.data) {
            return [];
        }
        return this.dashboardStore.data;
    },

    /**
     * Save dashboard state using reactive store
     */
    async saveDashboardState() {
        if (!this.dashboardStore || !authState.isAuthenticated || !authState.user?.email) {
            return;
        }
        
        try {
            await this.dashboardStore.save('Saving dashboard...');
            console.log('Dashboard state saved successfully via reactive store');
        } catch (error) {
            console.warn('Failed to save dashboard state (continuing without saving):', error.message);
        }
    },

    /**
     * Dashboard container management
     */
    addDashboardContainer(containerPath, title = null) {
        if (!this.dashboardStore) return;
        
        const containers = this.dashboardStore.data;
        const exists = containers.some(container => container.path === containerPath);
        
        if (!exists) {
            const displayTitle = title || this.getDashboardTitle(containerPath);
            const newContainer = { path: containerPath, title: displayTitle };
            this.dashboardStore.addRow(newContainer);
        }
    },

    removeDashboardContainer(containerPath) {
        if (!this.dashboardStore) return;
        
        const containers = this.dashboardStore.data;
        const index = containers.findIndex(container => container.path === containerPath);
        
        if (index !== -1) {
            this.dashboardStore.markRowForDeletion(index, true);
            this.dashboardStore.removeMarkedRows();
        }
    },

    hasDashboardContainer(containerPath) {
        if (!this.dashboardStore || !this.dashboardStore.data) {
            return false;
        }
        return this.dashboardStore.data.some(container => container.path === containerPath);
    },

    getAddablePaths() {
        if (!this.dashboardStore || !this.dashboardStore.data) {
            return this.getAllPaths(true); // Get sub-paths only
        }
        const currentPaths = this.dashboardStore.data.map(container => container.path);
        return this.getAllPaths(true).filter(path => !currentPaths.includes(path));
    },

    /**
     * Get container type from path - consolidated logic
     * @param {string} path - The container path
     * @returns {string} Container type
     */
    getTypeFromPath(path) {
        const segments = path.split('/').filter(segment => segment.length > 0);
        const firstSegment = segments[0];
        if (this.routes[firstSegment] && this.routes[firstSegment].isMainSection) {
            return firstSegment;
        }
        return segments[segments.length - 1];
    },

    /**
     * Get navigation result for a page (containers configuration) - consolidated
     * @param {string} pageFile - The page to navigate to
     * @param {boolean} isAuthenticated - Whether user is authenticated
     * @returns {Object} Navigation result with containers
     */
    getNavigationResult(pageFile, isAuthenticated = true) {
        if (!isAuthenticated) {
            return { page: pageFile, containers: [] };
        }

        let containerConfigs;
        if (pageFile === 'dashboard') {
            const containers = this.dashboardStore?.data || [];
            containerConfigs = containers.map(container => ({
                path: container.path,
                title: container.title,
                containerPath: container.path,
                type: this.getTypeFromPath(container.path)
            }));
        } else {
            containerConfigs = [{ 
                path: pageFile, 
                title: this.getDisplayName(pageFile),
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
     * Navigation handlers - consolidated
     */
    handleContainerExpansion(containerData, currentPage) {
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

    handleNavigateBack(navigationData, appContext) {
        const { containerId, parentPath } = navigationData;
        const container = appContext.containers.find(c => c.id === containerId);
        
        if (container) {
            if (parentPath === 'dashboard' || !parentPath) {
                appContext.removeContainer(containerId);
                return { action: 'remove_container', containerId };
            } else {
                container.containerPath = parentPath;
                return { action: 'update_path', containerId, newPath: parentPath };
            }
        }
        
        return { action: 'no_action' };
    },

    handleNavigateToPath(navigationData, appContext) {
        const { containerId, targetPath, navigationMap } = navigationData;
        const container = appContext.containers.find(c => c.id === containerId);
        
        if (!container) return { action: 'no_action' };
        
        const pathInfo = this.parsePath(targetPath);
        const basePage = pathInfo.path.split('/')[0];
        
        // Update container with path and parameters
        container.containerPath = pathInfo.path;
        container.fullPath = pathInfo.fullPath;
        container.navigationParameters = pathInfo.parameters;
        
        if (navigationMap) {
            container.navigationMap = { ...container.navigationMap, ...navigationMap };
        }
        
        // Handle dashboard navigation
        if (pathInfo.path === 'dashboard') {
            this.navigateToPage('dashboard', appContext);
            return { action: 'navigate_to_dashboard', containerId, targetPage: 'dashboard', parameters: pathInfo.parameters };
        }
        
        // Handle cross-page navigation
        if (appContext.currentPage !== pathInfo.path) {
            this.navigateToPage(basePage, appContext);
            
            appContext.$nextTick(() => {
                const expandedContainer = appContext.containers.find(c => 
                    c.containerPath === basePage || c.containerType === basePage
                );
                if (expandedContainer) {
                    expandedContainer.containerPath = pathInfo.path;
                    expandedContainer.fullPath = pathInfo.fullPath;
                    expandedContainer.navigationParameters = pathInfo.parameters;
                }
            });
            
            return {
                action: 'navigate_to_new_page',
                containerId,
                targetPage: basePage,
                targetPath: pathInfo.path,
                fullPath: pathInfo.fullPath,
                parameters: pathInfo.parameters
            };
        }
        
        return {
            action: 'update_path',
            containerId,
            newPath: pathInfo.path,
            fullPath: pathInfo.fullPath,
            parameters: pathInfo.parameters,
            navigationMap
        };
    },

    /**
     * Application-level functions - consolidated
     */
    createNavigateToPathHandler(containerId, handleNavigateToPath) {
        return (path, parameters = null) => {
            const fullPath = parameters ? this.buildPath(path, parameters) : path;
            handleNavigateToPath({ containerId: containerId, targetPath: fullPath });
        };
    },

    navigateToPage(pageFile, appContext) {
        appContext.currentPage = pageFile;
        appContext.isMenuOpen = false;
        console.log(`Navigating to: ${pageFile}`);
        this.updateContainersForPage(pageFile, appContext);
    },

    async updateContainersForPage(pageFile, appContext) {
        appContext.containers = [];
        const navigationResult = this.getNavigationResult(pageFile, appContext.isAuthenticated);
        
        for (const containerConfig of navigationResult.containers) {
            await appContext.addContainer(
                containerConfig.type,
                containerConfig.title,
                containerConfig.options
            );
        }
        
        if (appContext.isAuthenticated && appContext.containers.length === 0 && pageFile !== 'dashboard') {
            this.navigateToPage('dashboard', appContext);
        }
    },

    expandContainer(containerData, appContext) {
        const expansionResult = this.handleContainerExpansion(containerData, appContext.currentPage);
        
        switch (expansionResult.action) {
            case 'navigate':
                this.navigateToPage(expansionResult.targetPage, appContext);
                
                if (expansionResult.containerPath) {
                    appContext.$nextTick(() => {
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

// Legacy export for backward compatibility
export const NavigationConfig = NavigationRegistry;