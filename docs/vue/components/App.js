// Main App component - converted from html/templates/app.html
const { ref, computed, onMounted } = Vue;
const { useRouter, useRoute } = VueRouter;

export default {
    name: 'App',
    setup() {
        const router = useRouter();
        const route = useRoute();
        
        const isLoading = ref(true);
        const authStore = ref(null);
        
        // Initialize the app
        onMounted(async () => {
            try {
                // Import and initialize the auth store
                const { useAuthStore } = await import('../stores/auth.js');
                authStore.value = useAuthStore();
                await authStore.value.init();
            } catch (error) {
                console.error('App initialization error:', error);
            } finally {
                isLoading.value = false;
            }
        });
        
        const navigationItems = [
            { title: 'Dashboard', file: 'dashboard', path: '/dashboard' },
            { title: 'Plan', file: 'home', path: '/home' },
            { title: 'Pack Lists', file: 'packlist', path: '/packlist' },
            { title: 'Inventory', file: 'inventory', path: '/inventory' },
            { title: 'Test', file: 'interfaces', path: '/interfaces' }
        ];
        
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
        
        const navigateToPage = (path) => {
            router.push(path);
        };
        
        return {
            authStore,
            isLoading,
            navigationItems,
            route,
            handleLogin,
            handleLogout,
            navigateToPage
        };
    },
    template: `
        <div id="app-container">
            <!-- Loading indicator -->
            <div v-if="isLoading" class="loading-overlay">
                <div class="loading-message">Checking authentication...</div>
            </div>
            
            <!-- Main app layout - based on app.html template -->
            <div v-else>
                <header>
                    <nav>
                        <a href="#"><img src="images/logo.png" alt="Top Shelf Exhibits" /></a>
                        
                        <!-- Navigation items when authenticated -->
                        <div v-if="authStore?.isAuthenticated" id="navbar" class="nav-links">
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
                        </div>
                        
                        <!-- Login button when not authenticated -->
                        <div v-else id="navbar">
                            <button class="login-out-button" @click="handleLogin">
                                Log in
                            </button>
                        </div>
                        
                        <button class="hamburger-menu" @click="toggleMobileMenu">≡</button>
                    </nav>
                </header>
                
                <!-- Main content area -->
                <div id="app-content" class="main-content">
                    <!-- Show login prompt if not authenticated -->
                    <div v-if="!authStore?.isAuthenticated" class="login-prompt">
                        <h2>Please log in to continue</h2>
                        <p>You need to authenticate with Google to access the inventory system.</p>
                        <button class="login-out-button large" @click="handleLogin">
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
            </div>
        </div>
    `
};
