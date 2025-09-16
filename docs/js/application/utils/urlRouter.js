/**
 * URL Router - Synchronizes application navigation with browser URLs
 * Uses hash-based routing for compatibility with static hosting
 */
export class URLRouter {
    constructor(navigationRegistry, appContext) {
        this.navigationRegistry = navigationRegistry;
        this.appContext = appContext;
        this.isInitialized = false;
        this.isHandlingBrowserNavigation = false; // Flag to prevent URL updates during browser navigation
    }

    /**
     * Encode path for URL (replace spaces with +)
     */
    encodePath(path) {
        return path.replace(/ /g, '+');
    }

    /**
     * Decode path from URL (replace + with spaces)
     */
    decodePath(path) {
        return path.replace(/\+/g, ' ');
    }

    /**
     * Initialize URL routing system
     */
    initialize() {
        console.log('[URLRouter] Initializing URL routing system');
        
        // Listen for browser back/forward
        window.addEventListener('popstate', this.handlePopState.bind(this));
        
        this.isInitialized = true;
    }

    /**
     * Get current URL path (decoded)
     */
    getCurrentURLPath() {
        const hash = window.location.hash.slice(1); // Remove #
        return this.decodePath(hash);
    }

    /**
     * Get intended URL from session storage or current URL
     * Used by authentication flow to determine where to navigate after login
     */
    getIntendedURL() {
        // First check session storage (set when user was redirected to login)
        const storedUrl = sessionStorage.getItem('intended_url');
        if (storedUrl) {
            sessionStorage.removeItem('intended_url');
            return storedUrl;
        }
        
        // Otherwise use current URL if it's not login
        const currentUrl = this.getCurrentURLPath();
        if (currentUrl && currentUrl !== 'login') {
            return currentUrl;
        }
        
        return null;
    }

    /**
     * Store current URL for post-login navigation
     * Called when redirecting unauthenticated user to login
     */
    storeIntendedURL() {
        const currentUrl = this.getCurrentURLPath();
        if (currentUrl && currentUrl !== 'login') {
            console.log('[URLRouter] Storing intended URL for after login:', currentUrl);
            sessionStorage.setItem('intended_url', currentUrl);
        }
    }

    /**
     * Handle browser back/forward buttons
     */
    handlePopState(event) {
        console.log('[URLRouter] Handling popstate:', event.state);
        const path = this.getCurrentURLPath();
        if (path) {
            // Set flag to prevent URL updates during browser navigation
            this.isHandlingBrowserNavigation = true;
            
            // Let NavigationSystem handle the actual navigation, mark as browser navigation
            this.navigationRegistry.handleNavigateToPath({ 
                targetPath: path, 
                isBrowserNavigation: true 
            }, this.appContext);
            
            // Reset flag after a short delay to allow navigation to complete
            setTimeout(() => {
                this.isHandlingBrowserNavigation = false;
            }, 100);
        }
    }

    /**
     * Update URL from application navigation
     * If no parameters provided, automatically gets current state from app context
     */
    updateURL(path = null, parameters = null, pushToHistory = true) {
        if (!this.isInitialized || this.isHandlingBrowserNavigation) return;
        
        try {
            // Auto-get current state if not provided
            const currentPath = path || this.getCurrentPath();
            const currentParameters = parameters || this.getCurrentParameters();
            
            const fullPath = Object.keys(currentParameters).length > 0 
                ? this.navigationRegistry.buildPath(currentPath, currentParameters) 
                : currentPath;
            const encodedPath = this.encodePath(fullPath);
            const url = `#${encodedPath}`;
            
            console.log('[URLRouter] Updating URL:', fullPath, '-> encoded:', url, pushToHistory ? '(push)' : '(replace)');
            
            if (pushToHistory) {
                history.pushState({ path: fullPath }, '', url);
            } else {
                history.replaceState({ path: fullPath }, '', url);
            }
        } catch (error) {
            console.error('[URLRouter] Error updating URL:', error);
        }
    }

    /**
     * Get the active container that should drive URL state
     * Priority: container with navigationParameters > container with custom path > fallback to current page
     */
    getActiveContainer() {
        // First priority: container with navigation parameters (most specific)
        let activeContainer = this.appContext.containers.find(container => 
            container.navigationParameters && Object.keys(container.navigationParameters).length > 0
        );
        
        if (activeContainer) return activeContainer;
        
        // Second priority: container with custom path (different from containerType)
        activeContainer = this.appContext.containers.find(container => 
            container.containerPath && container.containerPath !== container.containerType
        );
        
        return activeContainer || null;
    }

    /**
     * Get current path from app context
     */
    getCurrentPath() {
        const activeContainer = this.getActiveContainer();
        return activeContainer?.containerPath || this.appContext.currentPage || 'dashboard';
    }

    /**
     * Get current navigation parameters from app context
     */
    getCurrentParameters() {
        const activeContainer = this.getActiveContainer();
        return activeContainer?.navigationParameters || {};
    }
}
