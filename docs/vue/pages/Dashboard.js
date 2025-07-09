// Dashboard page component
import Container from '../components/Container.js';
import { useModalService } from '../composables/useModalService.js';

export default {
    name: 'Dashboard',
    components: {
        Container
    },
    setup() {
        const { ref, onMounted } = Vue;
        const modalService = useModalService();
        
        const dashboardData = ref({
            totalInventory: 0,
            activePackLists: 0,
            lowStockItems: 0
        });
        
        onMounted(async () => {
            // Load dashboard data
            // This would integrate with your existing data management
            console.log('Dashboard mounted');
        });
        
        const handleNewPackList = async () => {
            const confirmed = await modalService.confirm('Do you want to create a new pack list?');
            if (confirmed) {
                const loadingModal = await modalService.showLoadingIndicator('Creating pack list...');
                
                // Simulate async operation
                setTimeout(() => {
                    loadingModal.hide();
                    modalService.notify('Pack list created successfully!');
                }, 2000);
            }
        };
        
        const handleAddInventory = async () => {
            await modalService.alert('This feature will be implemented soon!');
        };
        
        return {
            dashboardData,
            handleNewPackList,
            handleAddInventory
        };
    },
    template: `
        <Container header-content="<h1>Dashboard</h1>">
            <div class="dashboard-grid">
                <div class="dashboard-card">
                    <h3>Total Inventory Items</h3>
                    <div class="metric">{{ dashboardData.totalInventory }}</div>
                </div>
                
                <div class="dashboard-card">
                    <h3>Active Pack Lists</h3>
                    <div class="metric">{{ dashboardData.activePackLists }}</div>
                </div>
                
                <div class="dashboard-card">
                    <h3>Low Stock Items</h3>
                    <div class="metric">{{ dashboardData.lowStockItems }}</div>
                </div>
                
                <div class="dashboard-card">
                    <h3>Quick Actions</h3>
                    <div class="action-buttons">
                        <button class="btn-primary" @click="handleNewPackList">New Pack List</button>
                        <button class="btn-secondary" @click="handleAddInventory">Add Inventory</button>
                        <button class="btn-secondary">Generate Report</button>
                    </div>
                </div>
            </div>
            
            <template #footer>
                <p><small>Dashboard last updated: {{ new Date().toLocaleString() }}</small></p>
            </template>
        </Container>
    `
};
