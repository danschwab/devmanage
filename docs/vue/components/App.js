// Main App component - converted from html/templates/app.html
const { ref, computed, onMounted } = Vue;
const { useRouter, useRoute } = VueRouter;

import ModalContainer from './ModalContainer.js';
import { useModal } from '../stores/modal.js';

export default {
    name: 'App',
    components: {
        ModalContainer
    },
    setup() {
        const router = useRouter();
        const route = useRoute();
        const { showLoadingIndicator } = useModal();
        
        const authStore = ref(null);
        const isNavigationLoading = ref(false);
        const navigationItems = ref([]);
        let authLoadingModal = null;
        
        // Initialize the app
        onMounted(async () => {
            // Show loading modal for authentication check
            authLoadingModal = showLoadingIndicator('Checking authentication...');
            
            try {
                // Import and initialize the auth store
                const { useAuthStore } = await import('../stores/auth.js');
                const store = useAuthStore();
                authStore.value = store;
                
                console.log('Auth store created:', store);
                console.log('Initial auth state:', store.isAuthenticated);
                
                await store.init();
                
                console.log('After init - auth state:', store.isAuthenticated);
                console.log('User:', store.user);
                
                // Import navigation config
                const { navigationConfig } = await import('../config/navigation.js');
                navigationItems.value = navigationConfig;
                
                console.log('Navigation items loaded:', navigationItems.value);
                
            } catch (error) {
                console.error('App initialization error:', error);
            } finally {
                // Hide the loading modal
                if (authLoadingModal) {
                    authLoadingModal.hide();
                }
            }
        });
        
        const handleLogin = async () => {
            if (authStore.value) {
                await authStore.value.signIn();
            }
        };
        
        const handleLogout = async () => {
            if (authStore.value) {
                await authStore.value.signOut();
                router.push('/dashboard');
            }
        };
        
        const navigateToPage = async (path) => {
            isNavigationLoading.value = true;
            try {
                await router.push(path);
            } finally {
                // Small delay to show loading state
                setTimeout(() => {
                    isNavigationLoading.value = false;
                }, 100);
            }
        };
        
        const toggleMobileMenu = (event) => {
            const nav = event.target.closest('nav');
            nav.classList.toggle('open');
        };
        
        return {
            authStore,
            isNavigationLoading,
            navigationItems,
            route,
            handleLogin,
            handleLogout,
            navigateToPage,
            toggleMobileMenu
        };
    },
    template: `
        <header>
            <nav>
                <a href="#"><img src="images/logo.png" alt="Top Shelf Exhibits" /></a>
                
                <!-- Debug info -->
                <div style="position: fixed; bottom: 10px; right: 10px; background: rgba(0,0,0,0.8); color: white; padding: 10px; font-size: 12px; z-index: 9999;">
                    AuthStore: {{ authStore ? 'exists' : 'null' }}<br>
                    IsAuth: {{ authStore?.isAuthenticated }}<br>
                    NavItems: {{ navigationItems?.length || 0 }}
                </div>
                
                <!-- Navigation items when authenticated -->
                <span v-if="authStore?.isAuthenticated" id="navbar">
                    <!-- Loading indicator for navigation -->
                    <div v-if="isNavigationLoading" class="nav-loading">Loading...</div>
                    
                    <template v-else>
                        <a 
                            v-for="item in navigationItems" 
                            :key="item.path"
                            href="#" 
                            :class="{ active: route.path === item.path }"
                            @click.prevent="navigateToPage(item.path)"
                        >
                            {{ item.title }}
                        </a>
                        <button class="login-out-button" @click="handleLogout">
                            Log out
                        </button>
                    </template>
                </span>
                
                <!-- Login button when not authenticated -->
                <span v-else id="navbar">
                    <button class="login-out-button" @click="handleLogin">
                        Log in
                    </button>
                </span>
                
                <button class="hamburger-menu" @click="toggleMobileMenu">≡</button>
            </nav>
        </header>
        <!-- Main app layout - based on app.html template -->
        <div id="app-content" class="main-content">
            <!-- Show login prompt if not authenticated -->
            <div v-if="!authStore?.isAuthenticated" class="login-prompt">
                <h2>Please log in to continue</h2>
                <p>You need to authenticate with Google to access the inventory system.</p>
                <button class="login-out-button" @click="handleLogin">
                    Log in with Google
                </button>
            </div>
            
            <!-- Show page content if authenticated -->
            <router-view v-else />
            <footer>
                <p>
                    &copy; 2024 Top Shelf Exhibits
                    <br>
                    <a href="https://topshelfexhibits.com">www.topshelfexhibits.com</a>
                </p>
            </footer>
        </div>
        
        <!-- Modal Container for all modals -->
        <ModalContainer />
        `
};
