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
