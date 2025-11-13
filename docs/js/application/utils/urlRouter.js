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
     * Handle browser back/forward buttons
     */
    async handlePopState(event) {
        console.log('[URLRouter] Handling popstate:', event.state);
        const path = this.getCurrentURLPath();
        if (path) {
            // Set flag to prevent URL updates during browser navigation
            this.isHandlingBrowserNavigation = true;
            
            // Let NavigationSystem handle the actual navigation, mark as browser navigation
            await this.navigationRegistry.handleNavigateToPath({ 
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
     * Get current path from app context
     */
    getCurrentPath() {
        return this.appContext.currentPath || this.appContext.currentPage || 'dashboard';
    }

    /**
     * Get current navigation parameters from NavigationRegistry
     */
    getCurrentParameters() {
        const currentPath = this.getCurrentPath();
        return this.navigationRegistry.getNavigationParameters(currentPath);
    }
}
