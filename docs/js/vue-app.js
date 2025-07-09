import { ContainerComponent, containerManager } from './application/components/containerComponent.js';
import { TestTableComponent } from './application/components/testTableComponent.js';

const { createApp } = Vue;

// Function to load template from external file
async function loadTemplate(templateName) {
    try {
        const response = await fetch(`html/templates/${templateName}.html`);
        if (!response.ok) {
            throw new Error(`Failed to load template: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error('Error loading template:', error);
        return '<div>Error loading template</div>';
    }
}

// Vue app that uses external template
const App = {
    components: {
        'app-container': ContainerComponent,
        'test-table': TestTableComponent
    },
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
            currentPage: 'home',
            containers: []
        };
    },
    mounted() {
        // Create some example containers
        this.addTestContainers();
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
            // Add more containers when authenticated
            this.addAuthenticatedContainers();
        },
        logout() {
            // Placeholder for logout functionality
            console.log('Logout clicked');
            this.isAuthenticated = false;
            this.currentUser = null;
            // Reset to basic containers
            this.resetToBasicContainers();
        },
        navigateToPage(pageFile) {
            this.currentPage = pageFile;
            console.log(`Navigating to: ${pageFile}`);
            // Update containers based on current page
            this.updateContainersForPage(pageFile);
        },
        addContainer(type = 'default', title = '', options = {}) {
            const container = containerManager.createContainer(type, title, options);
            this.containers.push(container);
            return container;
        },
        removeContainer(containerId) {
            this.containers = this.containers.filter(c => c.id !== containerId);
            containerManager.removeContainer(containerId);
        },
        addTestContainers() {
            this.containers = [];
            this.addContainer('welcome', 'Vue.js Integration Test');
        },
        addAuthenticatedContainers() {
            this.containers = [];
            this.addContainer('dashboard', 'Dashboard Overview');
            this.addContainer('actions', 'Quick Actions');
        },
        resetToBasicContainers() {
            this.containers = [];
            this.addContainer('welcome', 'Welcome - Please Login');
        },
        updateContainersForPage(pageFile) {
            // Clear existing containers
            this.containers = [];
            
            // Add containers based on the current page
            switch(pageFile) {
                case 'dashboard':
                    this.addContainer('dashboard', 'Dashboard');
                    this.addContainer('stats', 'Statistics');
                    break;
                case 'home':
                    this.addContainer('home', 'Planning');
                    break;
                case 'packlist':
                    this.addContainer('packlist', 'Pack Lists');
                    break;
                case 'inventory':
                    this.addContainer('inventory', 'Inventory Management');
                    break;
                case 'interfaces':
                    this.addContainer('test', 'Interface Testing');
                    break;
                default:
                    this.addContainer('default', `${pageFile} Page`);
            }
        }
    }
};

// Initialize the app with external template
async function initApp() {
    const template = await loadTemplate('vue-app');
    App.template = template;
    createApp(App).mount('#app');
}

// Initialize the app when the page loads
initApp();
