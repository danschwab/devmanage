const { createApp } = Vue;

// Vue app that mimics the existing app.html template
const App = {
    data() {
        return {
            isMenuOpen: false,
            isAuthenticated: false,
            currentUser: null,
            navigationItems: [
                { title: 'Dashboard', file: 'dashboard' },
                { title: 'Plan', file: 'home' },
                { title: 'Pack Lists', file: 'packlist' },
                { title: 'Inventory', file: 'inventory' },
                { title: 'Test', file: 'interfaces' }
            ],
            currentPage: 'home'
        };
    },
    methods: {
        toggleMenu() {
            this.isMenuOpen = !this.isMenuOpen;
        },
        login() {
            // Placeholder for login functionality
            console.log('Login clicked');
            // For testing, simulate authentication
            this.isAuthenticated = true;
            this.currentUser = { name: 'Test User' };
        },
        logout() {
            // Placeholder for logout functionality
            console.log('Logout clicked');
            this.isAuthenticated = false;
            this.currentUser = null;
        },
        navigateToPage(pageFile) {
            this.currentPage = pageFile;
            console.log(`Navigating to: ${pageFile}`);
        }
    },
    template: `
        <header>
            <nav :class="{ 'open': isMenuOpen }">
                <a href="#"><img src="images/logo.png" alt="Top Shelf Exhibits" /></a>
                
                <span id="navbar">
                    <!-- Navigation items when authenticated -->
                    <template v-if="isAuthenticated">
                        <a v-for="item in navigationItems" 
                            :key="item.file"
                            :class="{ 'active': currentPage === item.file }"
                            @click="navigateToPage(item.file)"
                            href="#">
                            {{ item.title }}
                        </a>
                    </template>
                    
                    <!-- Login/Logout button -->
                    <button v-if="!isAuthenticated" 
                            @click="login" 
                            class="login-out-button">
                        Login
                    </button>
                    <button v-else 
                            @click="logout" 
                            class="login-out-button">
                        Logout ({{ currentUser?.name }})
                    </button>
                </span>
                
                <button class="hamburger-menu" @click="toggleMenu">≡</button>
            </nav>
        </header>
        
        <div id="app-content">
            <!-- Main content area -->
            <div class="container">
                <h1>Vue.js Test Page</h1>
                <p>Current page: {{ currentPage }}</p>
                <p>Authentication status: {{ isAuthenticated ? 'Authenticated' : 'Not authenticated' }}</p>
                <p>Menu status: {{ isMenuOpen ? 'Open' : 'Closed' }}</p>
                
                <div v-if="isAuthenticated">
                    <h2>Navigation Test</h2>
                    <p>Click on navigation items above to test page switching.</p>
                </div>
                <div v-else>
                    <h2>Please Login</h2>
                    <p>Click the Login button to see the navigation.</p>
                </div>
            </div>
            
            <footer>
                <p>
                    &copy; 2024 Top Shelf Exhibits
                    <br>
                    <a href="https://topshelfexhibits.com">www.topshelfexhibits.com</a>
                </p>
            </footer>
        </div>
    `
};

// Create and mount the Vue app
createApp(App).mount('#app');
