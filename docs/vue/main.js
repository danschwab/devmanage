// Vue 3 main entry point
const { createApp } = Vue;
const { createRouter, createWebHashHistory } = VueRouter;

// Import components
import App from './components/App.js';
import Dashboard from './pages/Dashboard.js';
import Home from './pages/Home.js';
import PackList from './pages/PackList.js';
import Inventory from './pages/Inventory.js';
import Interfaces from './pages/Interfaces.js';

// Import stores
import { useAuthStore } from './stores/auth.js';

// Define routes based on your existing navigationItems
const routes = [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', component: Dashboard, name: 'Dashboard' },
    { path: '/home', component: Home, name: 'Plan' },
    { path: '/packlist', component: PackList, name: 'Pack Lists' },
    { path: '/inventory', component: Inventory, name: 'Inventory' },
    { path: '/interfaces', component: Interfaces, name: 'Test' }
];

const router = createRouter({
    history: createWebHashHistory(),
    routes
});

// Navigation guard for authentication
router.beforeEach((to, from, next) => {
    // The App component will handle authentication checks
    // This allows the route but lets the App decide what to show
    next();
});

// Create and mount the Vue app
const app = createApp(App);
app.use(router);

// Make existing utilities available globally for gradual migration
app.config.globalProperties.$modal = {
    showLoadingIndicator: (message = 'Loading...') => {
        // You can implement a Vue modal here or use existing ModalManager
        console.log('Loading:', message);
        return { hide: () => console.log('Loading hidden') };
    },
    alert: (message) => {
        alert(message); // Temporary, replace with Vue modal component
    }
};

app.mount('#app');
