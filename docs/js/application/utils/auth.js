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
    return {
        // Reactive state
        authState,
        
        // Methods
        login: () => Auth.login(),
        logout: () => Auth.logout(),
        checkAuth: () => Auth.checkAuth(),
        initialize: () => Auth.initialize()
    };
}