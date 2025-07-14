import { html } from '../../utils/template-helpers.js';

// Dashboard Management Component (fully reactive)
const DashboardManagementComponent = {
    props: {
        getAllPathsWithStatus: Function,
        addToDashboard: Function,
        removeDashboardContainer: Function
    },
    data() {
        return {
            availablePaths: []
        };
    },
    mounted() {
        this.updateAvailablePaths();
        // Poll for changes to ensure reactivity
        this.interval = setInterval(() => {
            this.updateAvailablePaths();
        }, 100);
    },
    beforeUnmount() {
        if (this.interval) {
            clearInterval(this.interval);
        }
    },
    methods: {
        updateAvailablePaths() {
            const newPaths = this.getAllPathsWithStatus?.() || [];
            // Only update if actually changed to avoid unnecessary re-renders
            if (JSON.stringify(newPaths) !== JSON.stringify(this.availablePaths)) {
                this.availablePaths = newPaths;
            }
        },
        handleAddPath(path, title) {
            this.addToDashboard?.(path, title);
            // Force immediate update
            this.$nextTick(() => {
                this.updateAvailablePaths();
            });
        },
        handleRemovePath(path) {
            this.removeDashboardContainer?.(path);
            // Force immediate update
            this.$nextTick(() => {
                this.updateAvailablePaths();
            });
        }
    },
    template: html`
        <div style="text-align: left;">
            <h4>Dashboard Management</h4>
            <p><strong>Available Paths:</strong></p>
            <div v-for="{ path, isAdded, displayName } in availablePaths" :key="path">
                <button 
                    @click="isAdded ? handleRemovePath(path) : handleAddPath(path, displayName)"
                    :style="{
                        margin: '5px',
                        padding: '5px 10px',
                        background: isAdded ? '#f44336' : '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer'
                    }">
                    {{ isAdded ? 'Remove' : 'Add' }} {{ displayName }}
                </button>
                <br>
            </div>
        </div>
    `
};

export const DashboardOverview = {
    components: {
        DashboardManagementComponent
    },
    props: {
        currentUser: Object,
        getAllPathsWithStatus: Function,
        addToDashboard: Function,
        removeDashboardContainer: Function
    },
    mounted() {
        console.log('DashboardOverview mounted, emitting hamburger component');
        this.emitHamburgerComponent();
    },
    methods: {
        emitHamburgerComponent() {
            this.$emit('custom-hamburger-component', {
                component: DashboardManagementComponent,
                props: {
                    getAllPathsWithStatus: this.getAllPathsWithStatus,
                    addToDashboard: this.addToDashboard,
                    removeDashboardContainer: this.removeDashboardContainer
                }
            });
        }
    },
    template: html `
        <div class="overview-content">
            <p>Welcome to your overview, {{ currentUser?.name || 'User' }}!</p>
            <p>System Status: <span style="color: green;">Online</span></p>
            <p>Last Login: Today, 9:30 AM</p>
            <p>Active Sessions: 3</p>
        </div>
    `
};