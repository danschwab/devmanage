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
     * @param {string} path - The base path (may include existing query parameters)
     * @param {Object} parameters - Parameters to add/replace in query string
     * @returns {string} Full path with merged parameters
     */
    buildPath(path, parameters = {}) {
        // Split path and existing query string
        const [cleanPath, existingQuery] = path.split('?');
        
        // Start with existing parameters
        const queryString = new URLSearchParams(existingQuery || '');
        
        // Add/replace with new parameters
        Object.entries(parameters).forEach(([key, value]) => {
            queryString.set(key, String(value));
        });
        
        // Return path without query string if no parameters
        if (queryString.toString() === '') {
            return cleanPath;
        }
        
        return `${cleanPath}?${queryString.toString()}`;
    },

    /**
     * Get navigation parameters from a path (parses query string)
     * @param {string} path - The path with potential parameters
     * @returns {Object} The parameters object
     */
    getNavigationParameters(path) {
        const pathInfo = this.parsePath(path);
        return pathInfo.parameters;
    },

    /**
     * Get display name for a path
     * @param {string} path - The path to get display name for
     * @param {boolean} [preferDashboardTitle=false] - If true, prefer dashboardTitle over displayName
     * @returns {string} Display name or dashboard title
     */
    getDisplayName(path, preferDashboardTitle = false) {
        // Strip query parameters before processing
        const cleanPath = path.split('?')[0];
        const route = this.getRoute(cleanPath);
        if (route) {
            if (preferDashboardTitle && route.dashboardTitle) {
                return route.dashboardTitle;
            }
            return route.displayName;
        }
        
        // Fallback: generate from last segment
        const segments = cleanPath.split('/').filter(segment => segment.length > 0);
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
     * Get container type from path - consolidated logic
     * @param {string} path - The container path
     * @returns {string} Container type
     */
    getTypeFromPath(path) {
        // Strip query parameters before processing
        const cleanPath = path.split('?')[0];
        const segments = cleanPath.split('/').filter(segment => segment.length > 0);
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
        
        // Parse the target path to get the clean path
        const pathInfo = this.parsePath(targetPath);
        const currentPathInfo = this.parsePath(appContext.currentPath || '');
        
        // Check if we're navigating to the same base path (just parameter change)
        const isSameBasePath = pathInfo.path === currentPathInfo.path;
        
        // Check authentication before allowing navigation
        const isAuthenticated = await Auth.checkAuthWithPrompt({
            context: 'navigation',
            message: 'Your session has expired. Would you like to re-authenticate to continue navigating?'
        });
        
        if (!isAuthenticated) {
            console.log('[NavigationRegistry] Navigation blocked - authentication failed');
            return { action: 'navigation_blocked', reason: 'authentication_failed' };
        }
        
        console.log('[NavigationRegistry] Navigation to:', pathInfo.fullPath, isSameBasePath ? '(parameter change)' : '(new location)');
        
        // Update app state
        appContext.currentPath = pathInfo.fullPath;
        
        // Only close menu if navigating to a different base path
        if (!isSameBasePath) {
            appContext.isMenuOpen = false;
        }
        
        // Update URL if not browser navigation
        if (!isBrowserNavigation && this.urlRouter) {
            this.urlRouter.updateURL(pathInfo.fullPath);
        }
        
        return { 
            action: isSameBasePath ? 'parameter_change' : 'navigate', 
            path: pathInfo.fullPath, 
            parameters: pathInfo.parameters 
        };
    },

};