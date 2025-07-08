import { GoogleSheetsAuth } from '../../google_sheets_services/GoogleSheetsAuth.js';
import { NotificationManager, NOTIFICATIONS } from '../../utils/notifications.js';

/**
 * Simplified authentication utility class that wraps GoogleSheetsAuth
 */
export class Auth {
    // Authentication state
    static _isAuthenticated = false;
    static _isAuthenticating = false;
    static _authListeners = [];
    
    /**
     * Initialize the authentication system
     * @returns {Promise<void>}
     */
    static async init() {
        try {
            // Use initialize() instead of loadGapiClient()
            await GoogleSheetsAuth.initialize();
            // Use isAuthenticated() instead of isSignedIn()
            this._isAuthenticated = await GoogleSheetsAuth.isAuthenticated();
            if (this._isAuthenticated) {
                this._notifyListeners('init_success');
                // Also use the new notification system
                NotificationManager.publish(NOTIFICATIONS.AUTH_INITIALIZED, { 
                    success: true,
                    isAuthenticated: true
                });
            } else {
                NotificationManager.publish(NOTIFICATIONS.AUTH_INITIALIZED, { 
                    success: true,
                    isAuthenticated: false
                });
            }
        } catch (error) {
            console.error('Auth initialization error:', error);
            this._notifyListeners('init_error', error);
            // Also use the new notification system
            NotificationManager.publish(NOTIFICATIONS.AUTH_INITIALIZED, { 
                success: false,
                error: error.message
            });
        }
    }
    
    /**
     * Sign in the user
     * @param {boolean} [silentMode=false] - Whether to use silent mode for sign-in
     * @returns {Promise<boolean>} Authentication result
     */
    static async signIn(silentMode = false) {
        if (this._isAuthenticating) {
            return false;
        }
        
        this._isAuthenticating = true;
        this._notifyListeners('auth_start');
        // Also use the new notification system
        NotificationManager.publish(NOTIFICATIONS.AUTH_STARTED, { silentMode });
        
        try {
            await GoogleSheetsAuth.authenticate(silentMode);
            this._isAuthenticated = true;
            this._notifyListeners('auth_success');
            
            // Get user info for notification
            const userInfo = this.getCurrentUser();
            
            // Also use the new notification system
            NotificationManager.publish(NOTIFICATIONS.AUTH_SUCCESS, { userInfo });
            
            return true;
        } catch (error) {
            console.error('Authentication error:', error);
            this._notifyListeners('auth_error', error);
            // Also use the new notification system
            NotificationManager.publish(NOTIFICATIONS.AUTH_ERROR, { error: error.message });
            return false;
        } finally {
            this._isAuthenticating = false;
        }
    }
    
    /**
     * Sign out the user
     * @returns {Promise<void>}
     */
    static async signOut() {
        try {
            // Use logout() instead of signOut()
            await GoogleSheetsAuth.logout();
            this._isAuthenticated = false;
            this._notifyListeners('signout');
            // Also use the new notification system
            NotificationManager.publish(NOTIFICATIONS.AUTH_SIGNOUT);
        } catch (error) {
            console.error('Sign out error:', error);
            this._notifyListeners('signout_error', error);
            // Also use the new notification system
            NotificationManager.publish(NOTIFICATIONS.AUTH_ERROR, { 
                action: 'signout',
                error: error.message 
            });
        }
    }
    
    /**
     * Check if the user is signed in
     * @returns {boolean} Authentication status
     */
    static isSignedIn() {
        return this._isAuthenticated;
    }
    
    /**
     * Check if authentication is in progress
     * @returns {boolean} Authentication in progress status
     */
    static isAuthenticating() {
        return this._isAuthenticating;
    }
    
    /**
     * Get current user information
     * @returns {Object|null} User info object or null if not signed in
     */
    static getCurrentUser() {
        if (!this._isAuthenticated) return null;
        
        try {
            // If we can get the email from GoogleSheetsAuth, use that
            const email = GoogleSheetsAuth.userEmail;
            
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
        } catch (error) {
            console.error('Error getting user info:', error);
            return null;
        }
    }
    
    /**
     * Add authentication state change listener
     * @param {function(string, Object=)} callback - Callback function
     * @returns {number} Listener ID for removal
     */
    static addAuthListener(callback) {
        this._authListeners.push(callback);
        return this._authListeners.length - 1;
    }
    
    /**
     * Remove authentication state change listener
     * @param {number} id - Listener ID returned from addAuthListener
     */
    static removeAuthListener(id) {
        if (id >= 0 && id < this._authListeners.length) {
            this._authListeners[id] = null;
        }
    }
    
    /**
     * Notify all listeners of auth state change
     * @param {string} event - Event name
     * @param {Object} [data] - Optional event data
     * @private
     */
    static _notifyListeners(event, data) {
        this._authListeners.forEach(listener => {
            if (listener) {
                try {
                    listener(event, data);
                } catch (e) {
                    console.error('Error in auth listener:', e);
                }
            }
        });
    }
}
