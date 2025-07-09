// Auth store - wraps your existing GoogleSheetsAuth functionality
const { defineStore } = Pinia;
const { ref, computed } = Vue;

export const useAuthStore = defineStore('auth', () => {
    // State
    const isAuthenticated = ref(false);
    const isAuthenticating = ref(false);
    const user = ref(null);
    const error = ref(null);
    
    // Computed
    const userEmail = computed(() => user.value?.email || null);
    const userName = computed(() => user.value?.name || null);
    
    // Import your existing auth classes
    let GoogleSheetsAuth;
    
    // Actions
    async function init() {
        try {
            // Dynamically import your existing auth module
            const authModule = await import('../js/google_sheets_services/GoogleSheetsAuth.js');
            GoogleSheetsAuth = authModule.GoogleSheetsAuth;
            
            // Initialize the Google Sheets Auth
            await GoogleSheetsAuth.initialize();
            
            // Check if already authenticated
            isAuthenticated.value = GoogleSheetsAuth.isAuthenticated();
            
            if (isAuthenticated.value) {
                user.value = await getCurrentUserInfo();
            }
            
        } catch (err) {
            console.error('Auth initialization error:', err);
            error.value = err.message;
            throw err;
        }
    }
    
    async function signIn() {
        if (isAuthenticating.value) return false;
        
        isAuthenticating.value = true;
        error.value = null;
        
        try {
            await GoogleSheetsAuth.authenticate();
            isAuthenticated.value = true;
            user.value = await getCurrentUserInfo();
            return true;
        } catch (err) {
            console.error('Authentication error:', err);
            error.value = err.message;
            return false;
        } finally {
            isAuthenticating.value = false;
        }
    }
    
    async function signOut() {
        try {
            await GoogleSheetsAuth.logout();
            isAuthenticated.value = false;
            user.value = null;
            error.value = null;
        } catch (err) {
            console.error('Sign out error:', err);
            error.value = err.message;
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
    
    // Return the store API
    return {
        // State
        isAuthenticated,
        isAuthenticating,
        user,
        error,
        
        // Computed
        userEmail,
        userName,
        
        // Actions
        init,
        signIn,
        signOut,
        getCurrentUserInfo
    };
});
