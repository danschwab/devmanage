import { URLRouter } from './urlRouter.js';

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

    // URL Router integration
    urlRouter: null,

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
     * Handle post-login URL navigation
     */
    handlePostLogin() {
        if (this.urlRouter) {
            const intendedUrl = this.urlRouter.getIntendedURL();
            if (intendedUrl) {
                console.log('[NavigationRegistry] Navigating to intended URL after login:', intendedUrl);
                
                const pathInfo = this.parsePath(intendedUrl);
                const basePage = pathInfo.path.split('/')[0];
                
                // Navigate to base page first
                this.navigateToPage(basePage, this.urlRouter.appContext, false);
                
                // If it's a sub-path, update container after base page loads
                if (pathInfo.path !== basePage) {
                    this.urlRouter.appContext.$nextTick(() => {
                        const container = this.urlRouter.appContext.containers.find(c => c.containerType === basePage);
                        if (container) {
                            container.containerPath = pathInfo.path;
                            container.fullPath = pathInfo.fullPath;
                            container.navigationParameters = pathInfo.parameters;
                            console.log('[NavigationRegistry] Updated container for initial navigation:', container.id, 'with path:', pathInfo.path);
                            
                            // Update URL with full path
                            if (this.urlRouter) {
                                this.urlRouter.updateURL();
                            }
                        } else {
                            console.warn('[NavigationRegistry] No container found for initial navigation to:', basePage);
                        }
                    });
                } else {
                    // For base page navigation, update URL immediately
                    if (this.urlRouter) {
                        this.urlRouter.updateURL(pathInfo.path, pathInfo.parameters);
                    }
                }
                return;
            }
        }
        
        // Default to dashboard if no intended URL
        console.log('[NavigationRegistry] No intended URL, defaulting to dashboard');
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
     * @param {string} pagePath - The page path to navigate to
     * @param {boolean} isAuthenticated - Whether user is authenticated
     * @returns {Object} Navigation result with containers
     */
    getNavigationResult(pagePath, isAuthenticated = true) {
        if (!isAuthenticated) {
            return { page: pagePath, containers: [] };
        }

        let containerConfigs;
        if (pagePath === 'dashboard') {
            // Dashboard containers are now handled by DashboardContent component
            containerConfigs = [];
        } else {
            containerConfigs = [{ 
                path: pagePath, 
                title: this.getDisplayName(pagePath),
                containerPath: pagePath,
                type: this.getTypeFromPath(pagePath)
            }];
        }
        
        return {
            page: pagePath,
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
    handleNavigateToPath(navigationData, appContext) {
        const { containerId, targetPath, navigationMap, isBrowserNavigation } = navigationData;
        
        const pathInfo = this.parsePath(targetPath);
        const basePage = pathInfo.path.split('/')[0];
        
        // Handle primary navigation (no container ID provided)
        if (!containerId) {
            console.log('[NavigationRegistry] Primary navigation to:', pathInfo.path);
            
            // For browser navigation, handle full path like initial navigation
            if (isBrowserNavigation && pathInfo.path !== basePage) {
                // Navigate to base page first without URL update
                this.navigateToPage(basePage, appContext, false);
                
                // Update container with full path after containers are created
                appContext.$nextTick(() => {
                    const container = appContext.containers.find(c => c.containerType === basePage);
                    if (container) {
                        container.containerPath = pathInfo.path;
                        container.fullPath = pathInfo.fullPath;
                        container.navigationParameters = pathInfo.parameters;
                        console.log('[NavigationRegistry] Updated container for browser navigation:', container.id, 'with path:', pathInfo.path);
                    } else {
                        console.warn('[NavigationRegistry] No container found for browser navigation to:', basePage);
                    }
                });
            } else {
                // Regular primary navigation - just navigate to base page
                this.navigateToPage(basePage, appContext);
            }
            
            return { action: 'navigate_to_page', targetPage: basePage, parameters: pathInfo.parameters };
        }
        
        const container = appContext.containers.find(c => c.id === containerId);
        
        if (!container) return { action: 'no_action' };
        
        // Update container with path and parameters
        container.containerPath = pathInfo.path;
        container.fullPath = pathInfo.fullPath;
        container.navigationParameters = pathInfo.parameters;
        
        // Update URL when path changes
        if (this.urlRouter) {
            this.urlRouter.updateURL();
        }
        
        if (navigationMap) {
            container.navigationMap = { ...container.navigationMap, ...navigationMap };
        }
        
        // Handle dashboard navigation
        if (pathInfo.path === 'dashboard') {
            this.navigateToPage('dashboard', appContext);
            return { action: 'navigate_to_dashboard', containerId, targetPage: 'dashboard', parameters: pathInfo.parameters };
        }
        
        // Handle cross-page navigation
        if (appContext.currentPage !== basePage) {
            // Don't update URL immediately - let container update handle it
            this.navigateToPage(basePage, appContext, false);
            
            appContext.$nextTick(() => {
                const expandedContainer = appContext.containers.find(c => 
                    c.containerPath === basePage || c.containerType === basePage
                );
                if (expandedContainer) {
                    expandedContainer.containerPath = pathInfo.path;
                    expandedContainer.fullPath = pathInfo.fullPath;
                    expandedContainer.navigationParameters = pathInfo.parameters;
                    
                    // Now update URL with the full path
                    if (this.urlRouter) {
                        this.urlRouter.updateURL();
                    }
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

    navigateToPage(pagePath, appContext, updateURL = true) {
        appContext.currentPage = pagePath;
        appContext.isMenuOpen = false;
        console.log(`Navigating to: ${pagePath}`);
        
        // Update URL when navigation occurs - only if explicitly requested
        if (updateURL && this.urlRouter) {
            console.log('[NavigationRegistry] Updating URL via URLRouter to:', pagePath);
            this.urlRouter.updateURL(pagePath, {});
        } else if (!this.urlRouter) {
            console.warn('[NavigationRegistry] URLRouter not initialized, cannot update URL');
        }
        
        this.updateContainersForPage(pagePath, appContext);
    },

    async updateContainersForPage(pagePath, appContext) {
        appContext.containers = [];
        const navigationResult = this.getNavigationResult(pagePath, appContext.isAuthenticated);
        
        for (const containerConfig of navigationResult.containers) {
            await appContext.addContainer(
                containerConfig.type,
                containerConfig.title,
                containerConfig.options
            );
        }
        
        if (appContext.isAuthenticated && appContext.containers.length === 0 && pagePath !== 'dashboard') {
            this.navigateToPage('dashboard', appContext);
        }
    },

    expandContainer(containerData, appContext) {
        const targetPath = containerData.containerPath || containerData.path;
        const targetPage = targetPath.split('/')[0];
        
        if (targetPage !== appContext.currentPage) {
            // Navigate to new page
            this.navigateToPage(targetPage, appContext);
            
            if (targetPath) {
                appContext.$nextTick(() => {
                    const expandedContainer = appContext.containers.find(c => 
                        c.containerType === targetPage || c.containerPath === targetPage
                    );
                    if (expandedContainer) {
                        expandedContainer.containerPath = targetPath;
                    }
                });
            }
        } else {
            // Already on the same page
            appContext.showAlert(`You are already viewing the ${containerData.title} page.`, 'Already Here');
        }
    }
};