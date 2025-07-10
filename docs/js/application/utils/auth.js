import { GoogleSheetsAuth } from '../../google_sheets_services/GoogleSheetsAuth.js';

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
            await GoogleSheetsAuth.logout();
            authState.isAuthenticated = false;
            authState.user = null;
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

    static get state() {
        return authState;
    }
}

/**
 * Vue composable for authentication
 */
export function useAuth() {
    const login = async () => {
        return await Auth.login();
    };

    const logout = async () => {
        await Auth.logout();
    };

    const checkAuth = async () => {
        return await Auth.checkAuth();
    };

    const initialize = async () => {
        await Auth.initialize();
    };

    return {
        // Reactive state
        authState,
        isAuthenticated: Vue.ref(() => authState.isAuthenticated),
        isLoading: Vue.ref(() => authState.isLoading),
        user: Vue.ref(() => authState.user),
        error: Vue.ref(() => authState.error),
        isInitialized: Vue.ref(() => authState.isInitialized),
        
        // Methods
        login,
        logout,
        checkAuth,
        initialize
    };
}