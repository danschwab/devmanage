import { html } from '../../utils/template-helpers.js';

// Dashboard Management Component (fully reactive)
const DashboardManagementComponent = {
    props: {
        getAllContainerTypesWithStatus: Function,
        addToDashboard: Function,
        removeDashboardContainer: Function
    },
    data() {
        return {
            containerTypes: []
        };
    },
    mounted() {
        this.updateContainerTypes();
        // Poll for changes to ensure reactivity
        this.interval = setInterval(() => {
            this.updateContainerTypes();
        }, 100);
    },
    beforeUnmount() {
        if (this.interval) {
            clearInterval(this.interval);
        }
    },
    methods: {
        updateContainerTypes() {
            const newTypes = this.getAllContainerTypesWithStatus?.() || [];
            // Only update if actually changed to avoid unnecessary re-renders
            if (JSON.stringify(newTypes) !== JSON.stringify(this.containerTypes)) {
                this.containerTypes = newTypes;
            }
        },
        handleAddContainer(type) {
            this.addToDashboard?.(type);
            // Force immediate update
            this.$nextTick(() => {
                this.updateContainerTypes();
            });
        },
        handleRemoveContainer(type) {
            this.removeDashboardContainer?.(type);
            // Force immediate update
            this.$nextTick(() => {
                this.updateContainerTypes();
            });
        }
    },
    template: html`
        <div style="text-align: left;">
            <h4>Dashboard Management</h4>
            <p><strong>Container Types:</strong></p>
            <div v-for="{ type, isAdded, displayName } in containerTypes" :key="type">
                <button 
                    @click="isAdded ? handleRemoveContainer(type) : handleAddContainer(type)"
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
        getAllContainerTypesWithStatus: Function,
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
                    getAllContainerTypesWithStatus: this.getAllContainerTypesWithStatus,
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

// Also export as OverviewContent for the new naming convention
export const OverviewContent = DashboardOverview;