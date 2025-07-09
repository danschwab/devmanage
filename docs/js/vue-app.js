import { ContainerComponent, containerManager } from './application/components/containerComponent.js';
import { TestTableComponent } from './application/components/testTableComponent.js';
import { ModalComponent, modalManager } from './application/components/modalComponent.js';

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
        'test-table': TestTableComponent,
        'app-modal': ModalComponent
    },
    data() {
        return {
            isMenuOpen: false,
            isAuthenticated: false,
            currentUser: null,
            navigationItems: [
                { title: 'Dashboard', file: 'dashboard' },
                { title: 'Pack Lists', file: 'packlist' },
                { title: 'Inventory', file: 'inventory' },
                { title: 'Test', file: 'interfaces' }
            ],
            currentPage: 'dashboard',
            containers: [],
            modals: []
        };
    },
    mounted() {
        // Create some example containers
        this.addTestContainers();
        
        // Add ESC key support for closing modals
        document.addEventListener('keydown', this.handleKeyDown);
    },
    beforeUnmount() {
        // Clean up event listener
        document.removeEventListener('keydown', this.handleKeyDown);
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
            // Load containers for the current page after authentication
            this.updateContainersForPage(this.currentPage);
        },
        logout() {
            // Placeholder for logout functionality
            console.log('Logout clicked');
            this.isAuthenticated = false;
            this.currentUser = null;
            // Update containers for current page (will show login prompt when not authenticated)
            this.updateContainersForPage(this.currentPage);
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
            
            // If not authenticated, show login prompt regardless of page
            if (!this.isAuthenticated) {
                this.addContainer('welcome', 'Welcome - Please Login');
                return;
            }
            
            // Add containers based on the current page when authenticated
            switch(pageFile) {
                case 'dashboard':
                    // Create dashboard cards
                    this.addContainer('dashboard-overview', 'Dashboard Overview', { cardStyle: true });
                    this.addContainer('dashboard-stats', 'Quick Stats', { cardStyle: true });
                    this.addContainer('dashboard-table', 'Recent Data', { cardStyle: true });
                    this.addContainer('dashboard-actions', 'Quick Actions', { cardStyle: true });
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
        },
        // Modal management methods
        addModal(title = '', content = '', options = {}) {
            const modal = modalManager.createModal(title, content, options);
            this.modals.push(modal);
            return modal;
        },
        showModal(modalId) {
            const modal = modalManager.showModal(modalId);
            if (modal) {
                // Update the modal in the reactive array
                const index = this.modals.findIndex(m => m.id === modalId);
                if (index !== -1) {
                    this.modals[index].isVisible = true;
                }
            }
            return modal;
        },
        hideModal(modalId) {
            const modal = modalManager.hideModal(modalId);
            if (modal) {
                // Update the modal in the reactive array
                const index = this.modals.findIndex(m => m.id === modalId);
                if (index !== -1) {
                    this.modals[index].isVisible = false;
                }
            }
            return modal;
        },
        removeModal(modalId) {
            this.modals = this.modals.filter(m => m.id !== modalId);
            modalManager.removeModal(modalId);
        },
        // Quick modal creation methods
        showAlert(message, title = 'Alert') {
            const modal = this.addModal(title, message);
            this.showModal(modal.id);
            return modal;
        },
        showConfirm(message, title = 'Confirm') {
            const modal = this.addModal(title, message);
            this.showModal(modal.id);
            return modal;
        }
    }
};

// Initialize the app with external template
async function initApp() {
    const template = await loadTemplate('vue-app');
    App.template = template;
    createApp(App).mount('body');
}

// Initialize the app when the page loads
initApp();
