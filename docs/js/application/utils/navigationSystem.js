import { html } from '../index.js';
import { authState, Auth } from '../index.js';
import { URLRouter } from './urlRouter.js';
import { DashboardRegistry } from './DashboardRegistry.js';

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

    // Dashboard registry
    dashboardRegistry: DashboardRegistry,

    // URL Router integration
    urlRouter: null,

    // Central navigation parameters store (reactive)
    navigationParameters: Vue.reactive({}),

    /**
     * Initialize dashboard registry
     */
    async initializeDashboard() {
        await this.dashboardRegistry.initialize();
    },

    /**
     * Initialize URL routing system
     */
    initializeURLRouting(appContext) {
        if (!this.urlRouter) {
            this.urlRouter = new URLRouter(this, appContext);
            this.urlRouter.initialize();
            console.log('[NavigationRegistry] URL router initialized successfully');
        }
    },

    /**
     * Register navigation routes for a section
     * @param {string} section - Main section (e.g., 'inventory')
     * @param {Object} navigationConfig - Navigation configuration
     * @param {Object} navigationConfig.routes - Route definitions
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
     * @param {string} path - The path with potential parameters (e.g., 'inventory/categories?searchTerm=item&hideRowsOnSearch=false')
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
     * Set navigation parameters for a specific path
     * @param {string} path - The path to set parameters for
     * @param {Object} parameters - The parameters to set
     */
    setNavigationParameters(path, parameters) {
        this.navigationParameters[path] = { ...parameters };
    },

    /**
     * Get navigation parameters for a specific path
     * @param {string} path - The path to get parameters for
     * @returns {Object} The parameters object
     */
    getNavigationParameters(path) {
        return this.navigationParameters[path] || {};
    },

    /**
     * Get current navigation parameters based on app context
     * @param {Object} appContext - The app context object
     * @returns {Object} Current navigation parameters
     */
    getCurrentNavigationParameters(appContext) {
        const currentPath = appContext.currentPath || appContext.currentPage || 'dashboard';
        return this.getNavigationParameters(currentPath);
    },

    /**
     * Clear navigation parameters for a specific path
     * @param {string} path - The path to clear parameters for
     */
    clearNavigationParameters(path) {
        delete this.navigationParameters[path];
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
     * Navigation handlers - consolidated
     */
    async handleNavigateToPath(navigationData, appContext) {
        const { targetPath, isBrowserNavigation } = navigationData;
        
        // Check authentication before allowing navigation
        const isAuthenticated = await Auth.checkAuthWithPrompt({
            context: 'navigation',
            message: 'Your session has expired. Would you like to re-authenticate to continue navigating?'
        });
        
        if (!isAuthenticated) {
            console.log('[NavigationRegistry] Navigation blocked - authentication failed');
            return { action: 'navigation_blocked', reason: 'authentication_failed' };
        }
        
        const pathInfo = this.parsePath(targetPath);
        const basePage = pathInfo.path.split('/')[0];
        
        console.log('[NavigationRegistry] Navigation to:', pathInfo.path);
        
        // Handle dashboard navigation
        if (pathInfo.path === 'dashboard') {
            this.navigateToPage('dashboard', appContext);
            // Clear parameters for dashboard
            this.clearNavigationParameters('dashboard');
            return { action: 'navigate_to_dashboard', targetPage: 'dashboard', parameters: pathInfo.parameters };
        }
        
        // Navigate to base page WITHOUT updating URL to preserve the full path
        this.navigateToPage(basePage, appContext, false);
        
        // Set the full path for the container to use
        appContext.currentPath = pathInfo.path;
        
        // Store navigation parameters for the current path
        if (pathInfo.hasParameters) {
            this.setNavigationParameters(pathInfo.path, pathInfo.parameters);
            console.log('[NavigationRegistry] Set navigation parameters for', pathInfo.path, ':', pathInfo.parameters);
        } else {
            // Clear parameters if none provided
            this.clearNavigationParameters(pathInfo.path);
        }
        
        // Update URL with full path if not browser navigation
        if (!isBrowserNavigation && this.urlRouter) {
            this.urlRouter.updateURL(pathInfo.path, pathInfo.parameters);
        }
        
        return { action: 'navigate_to_page', targetPage: basePage, parameters: pathInfo.parameters };
    },

    navigateToPage(pagePath, appContext, updateURL = true) {
        appContext.currentPage = pagePath;
        appContext.currentPath = pagePath; // Set to same as page for base navigation
        appContext.isMenuOpen = false;
        console.log(`Navigating to: ${pagePath}`);
        
        // Update URL when navigation occurs - only if explicitly requested
        if (updateURL && this.urlRouter) {
            console.log('[NavigationRegistry] Updating URL via URLRouter to:', pagePath);
            this.urlRouter.updateURL(pagePath, {});
        } else if (!this.urlRouter) {
            console.warn('[NavigationRegistry] URLRouter not initialized, cannot update URL');
        }
    }
};