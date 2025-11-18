// Dynamically select GoogleSheetsAuth based on environment
let GoogleSheetsAuth;
function isLocalhost() {
    return (
        typeof window !== 'undefined' &&
        (
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.protocol === 'file:'
        )
    );
}
if (isLocalhost()) {
    // eslint-disable-next-line no-undef
    ({ GoogleSheetsAuth } = await import('../../google_sheets_services/FakeGoogle.js'));
} else {
    // eslint-disable-next-line no-undef
    ({ GoogleSheetsAuth } = await import('../../google_sheets_services/index.js'));
}

/**
 * Reactive authentication state
 */
export const authState = Vue.reactive({
    isAuthenticated: false,
    isLoading: false,
    user: null,
    error: null,
    isInitialized: false
});

// Import DashboardRegistry for cleanup on logout
import { DashboardRegistry } from './DashboardRegistry.js';
import { clearAllReactiveStores } from './reactiveStores.js';

// Import modalManager for re-authentication prompts
let modalManager;
// Lazy load to avoid circular dependency
async function getModalManager() {
    if (!modalManager) {
        const module = await import('../components/interface/modalComponent.js');
        modalManager = module.modalManager;
    }
    return modalManager;
}

/**
 * Simplified authentication utility class that wraps GoogleSheetsAuth
 */
export class Auth {
    static async initialize() {
        authState.isLoading = true;
        authState.error = null;
        try {
            await GoogleSheetsAuth.initialize();
            // Check if user is already authenticated
            const isAuth = await GoogleSheetsAuth.checkAuth();
            if (isAuth) {
                const email = await GoogleSheetsAuth.getUserEmail();
                authState.user = { email, name: email?.split('@')[0] || 'User' };
                authState.isAuthenticated = true;
            }
            authState.isInitialized = true;
        } catch (error) {
            console.error('Auth initialization failed:', error);
            authState.error = error.message;
        } finally {
            authState.isLoading = false;
        }
    }

    static async login() {
        authState.isLoading = true;
        authState.error = null;
        
        try {
            await GoogleSheetsAuth.authenticate();
            
            const email = await GoogleSheetsAuth.getUserEmail();
            if (!email || email.length === 0) {
                throw new Error('Failed to retrieve user email');
            }

            authState.user = { email, name: email?.split('@')[0] || 'User' };
            authState.isAuthenticated = true;
            
            return true;
        } catch (error) {
            console.error('Login failed:', error);
            authState.error = error.message;
            authState.isAuthenticated = false;
            authState.user = null;
            return false;
        } finally {
            authState.isLoading = false;
        }
    }

    static async logout() {
        authState.isLoading = true;
        authState.error = null;

        try {
            // Clean up dashboard registry (save any pending changes and reset)
            await DashboardRegistry.saveNow();
            DashboardRegistry.cleanup();

            // Clear all reactive stores with proper cleanup sequence:
            // 1. Stop priority queue
            // 2. Auto-save all dirty stores
            // 3. Clear store registry
            await clearAllReactiveStores();

            await GoogleSheetsAuth.logout();
            
            // Flush everything in the reactive store
            authState.isAuthenticated = false;
            authState.user = null;
            authState.error = null;
            authState.isInitialized = false;
            // Remove any other keys if added in the future
            Object.keys(authState).forEach(key => {
                if (key !== 'isLoading') authState[key] = null;
            });
        } catch (error) {
            console.error('Logout failed:', error);
            authState.error = error.message;
        } finally {
            authState.isLoading = false;
        }
    }

    static async checkAuth() {
        if (!authState.isInitialized) {
            await this.initialize();
        }
        return GoogleSheetsAuth.checkAuth();
    }

    /**
     * Check authentication and prompt for re-authentication if needed
     * @param {Object} options - Configuration options
     * @param {string} options.context - Context description for the modal (e.g., "auto-save", "data operation")
     * @param {string} options.message - Custom message to show in the modal (optional)
     * @param {boolean} options.showModal - Whether to show re-authentication modal (default: true)
     * @returns {Promise<boolean>} True if authenticated, false otherwise
     */
    static async checkAuthWithPrompt(options = {}) {
        const {
            context = 'operation',
            message = null,
            showModal = true
        } = options;

        try {
            // Check current auth state
            const isAuthenticated = await this.checkAuth();
            
            if (!isAuthenticated && showModal) {
                console.warn(`[Auth] Authentication check failed for ${context}`);
                
                const manager = await getModalManager();
                
                // Show modal with re-authentication option
                return new Promise((resolve) => {
                    const defaultMessage = `Your session has expired. Would you like to maintain your current session? This will re-authenticate and continue your ${context}.`;
                    
                    manager.confirm(
                        message || defaultMessage,
                        async () => {
                            // User clicked "Maintain Current Session"
                            try {
                                console.log(`[Auth] Attempting re-authentication for ${context}...`);
                                await Auth.login();
                                
                                if (authState.isAuthenticated) {
                                    console.log(`[Auth] Re-authentication successful for ${context}`);
                                    resolve(true);
                                } else {
                                    console.error(`[Auth] Re-authentication failed for ${context}`);
                                    manager.error('Re-authentication failed. Please log in manually.', 'Authentication Failed');
                                    resolve(false);
                                }
                            } catch (error) {
                                console.error(`[Auth] Re-authentication error for ${context}:`, error);
                                manager.error('Re-authentication failed: ' + error.message, 'Authentication Error');
                                resolve(false);
                            }
                        },
                        () => {
                            // User cancelled
                            console.log(`[Auth] User declined re-authentication for ${context}`);
                            resolve(false);
                        },
                        'Session Expired',
                        'Maintain Session',
                        'Cancel'
                    );
                });
            }
            
            return isAuthenticated;
        } catch (error) {
            console.error(`[Auth] Auth check error for ${context}:`, error);
            return false;
        }
    }

    static get state() {
        return authState;
    }
}

