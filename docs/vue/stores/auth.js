// Auth store - using Vue's built-in reactivity instead of Pinia
const { ref, computed, reactive } = Vue;

// Create a reactive auth store
const authState = reactive({
    isAuthenticated: false,
    isAuthenticating: false,
    user: null,
    error: null
});

let GoogleSheetsAuth;
let modalStore;

// Create a single instance of the auth store
let authStoreInstance = null;

export const useAuthStore = () => {
    // Return the same instance every time
    if (authStoreInstance) {
        return authStoreInstance;
    }
    
    // Computed properties
    const userEmail = computed(() => authState.user?.email || null);
    const userName = computed(() => authState.user?.name || null);
    
    // Actions
    async function init() {
        try {
            // Dynamically import your existing auth module
            const authModule = await import('../../js/google_sheets_services/GoogleSheetsAuth.js');
            GoogleSheetsAuth = authModule.GoogleSheetsAuth;
            
            // Initialize the Google Sheets Auth
            await GoogleSheetsAuth.initialize();
            
            // Check if already authenticated
            authState.isAuthenticated = GoogleSheetsAuth.isAuthenticated();
            
            if (authState.isAuthenticated) {
                authState.user = await getCurrentUserInfo();
            }
            
        } catch (err) {
            console.error('Auth initialization error:', err);
            authState.error = err.message;
            throw err;
        }
    }
    
    async function signIn() {
        if (authState.isAuthenticating) return false;
        
        authState.isAuthenticating = true;
        authState.error = null;
        
        // Import modal store if not already imported
        if (!modalStore) {
            const { useModal } = await import('./modal.js');
            modalStore = useModal();
        }
        
        const loadingModal = modalStore.showLoadingIndicator('Signing in...');
        
        try {
            await GoogleSheetsAuth.authenticate();
            authState.isAuthenticated = true;
            authState.user = await getCurrentUserInfo();
            
            // Show success notification
            modalStore.notify('Successfully signed in!', { timeout: 2000 });
            
            return true;
        } catch (err) {
            console.error('Authentication error:', err);
            authState.error = err.message;
            
            // Show error notification
            modalStore.notify(`Authentication failed: ${err.message}`, { 
                timeout: 5000, 
                showClose: true 
            });
            
            return false;
        } finally {
            authState.isAuthenticating = false;
            loadingModal.hide();
        }
    }
    
    async function signOut() {
        // Import modal store if not already imported
        if (!modalStore) {
            const { useModal } = await import('./modal.js');
            modalStore = useModal();
        }
        
        try {
            await GoogleSheetsAuth.logout();
            authState.isAuthenticated = false;
            authState.user = null;
            authState.error = null;
            
            // Show success notification
            modalStore.notify('Successfully signed out!', { timeout: 2000 });
            
        } catch (err) {
            console.error('Sign out error:', err);
            authState.error = err.message;
            
            // Show error notification
            modalStore.notify(`Sign out failed: ${err.message}`, { 
                timeout: 5000, 
                showClose: true 
            });
            
            throw err;
        }
    }
    
    async function getCurrentUserInfo() {
        try {
            if (!GoogleSheetsAuth) return null;
            
            const email = await GoogleSheetsAuth.getUserEmail();
            
            // Try to get more profile information if available
            try {
                const authInstance = gapi.auth2.getAuthInstance();
                if (authInstance) {
                    const user = authInstance.currentUser.get();
                    const profile = user.getBasicProfile();
                    
                    if (profile) {
                        return {
                            id: profile.getId(),
                            name: profile.getName(),
                            email: profile.getEmail() || email,
                            imageUrl: profile.getImageUrl()
                        };
                    }
                }
            } catch (e) {
                console.warn('Could not get detailed profile:', e);
            }
            
            // Fallback to just email
            if (email) {
                return {
                    id: 'unknown',
                    name: email.split('@')[0],
                    email: email,
                    imageUrl: null
                };
            }
            
            return null;
        } catch (err) {
            console.error('Error getting user info:', err);
            return null;
        }
    }
    
    // Create and cache the store instance
    authStoreInstance = reactive({
        // State properties
        get isAuthenticated() { return authState.isAuthenticated; },
        get isAuthenticating() { return authState.isAuthenticating; },
        get user() { return authState.user; },
        get error() { return authState.error; },
        
        // Computed
        userEmail,
        userName,
        
        // Actions
        init,
        signIn,
        signOut,
        getCurrentUserInfo
    });
    
    return authStoreInstance;
};
