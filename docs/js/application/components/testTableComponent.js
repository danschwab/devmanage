// Test component that simulates API data loading and table display
export const TestTableComponent = {
    data() {
        return {
            isLoading: false,
            tableData: [],
            error: null,
            columns: [
                { key: 'id', label: 'ID' },
                { key: 'name', label: 'Item Name' },
                { key: 'category', label: 'Category' },
                { key: 'quantity', label: 'Quantity' },
                { key: 'price', label: 'Price' },
                { key: 'status', label: 'Status' },
                { key: 'lastUpdated', label: 'Last Updated' }
            ]
        };
    },
    mounted() {
        // Auto-load data when component mounts
        this.loadTestData();
    },
    methods: {
        async loadTestData() {
            this.isLoading = true;
            this.error = null;
            
            try {
                // Simulate API delay
                await this.delay(1500);
                
                // Simulate API response
                const simulatedData = this.generateSimulatedData();
                
                // Simulate potential API error (10% chance)
                if (Math.random() < 0.1) {
                    throw new Error('Simulated API error');
                }
                
                this.tableData = simulatedData;
            } catch (error) {
                this.error = error.message;
                console.error('Error loading test data:', error);
            } finally {
                this.isLoading = false;
            }
        },
        
        generateSimulatedData() {
            const categories = ['Electronics', 'Furniture', 'Clothing', 'Books', 'Tools', 'Sports'];
            const statuses = ['In Stock', 'Low Stock', 'Out of Stock', 'Discontinued'];
            const itemNames = [
                'Wireless Headphones', 'Office Chair', 'Cotton T-Shirt', 'Programming Guide',
                'Screwdriver Set', 'Basketball', 'Laptop Stand', 'Desk Lamp',
                'Running Shoes', 'Coffee Mug', 'Phone Case', 'Notebook',
                'Keyboard', 'Mouse Pad', 'Water Bottle', 'Backpack'
            ];
            
            const data = [];
            for (let i = 1; i <= 15; i++) {
                data.push({
                    id: i,
                    name: itemNames[Math.floor(Math.random() * itemNames.length)],
                    category: categories[Math.floor(Math.random() * categories.length)],
                    quantity: Math.floor(Math.random() * 100) + 1,
                    price: (Math.random() * 299.99 + 0.01).toFixed(2),
                    status: statuses[Math.floor(Math.random() * statuses.length)],
                    lastUpdated: this.randomDate()
                });
            }
            return data;
        },
        
        randomDate() {
            const start = new Date(2024, 0, 1);
            const end = new Date();
            const randomTime = start.getTime() + Math.random() * (end.getTime() - start.getTime());
            return new Date(randomTime).toLocaleDateString();
        },
        
        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },
        
        refreshData() {
            this.loadTestData();
        },
        
        getStatusClass(status) {
            switch (status) {
                case 'In Stock': return 'green';
                case 'Low Stock': return 'yellow';
                case 'Out of Stock': return 'red';
                case 'Discontinued': return 'orange';
                default: return '';
            }
        }
    },
    template: `
        <div class="test-table-component">
            <div class="container-header">
                <h3>Inventory Data Test</h3>
                <button @click="refreshData" :disabled="isLoading" class="refresh-button">
                    {{ isLoading ? 'Loading...' : 'Refresh Data' }}
                </button>
            </div>
            
            <!-- Loading State -->
            <div v-if="isLoading" class="loading-message">
                <p>Loading data from API...</p>
            </div>
            
            <!-- Error State -->
            <div v-else-if="error" class="error-message">
                <p>Error loading data: {{ error }}</p>
                <button @click="refreshData">Try Again</button>
            </div>
            
            <!-- Data Table -->
            <div v-else class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th v-for="column in columns" :key="column.key">
                                {{ column.label }}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in tableData" :key="row.id">
                            <td>{{ row.id }}</td>
                            <td>{{ row.name }}</td>
                            <td>{{ row.category }}</td>
                            <td>{{ row.quantity }}</td>
                            <td>\${{ row.price }}</td>
                            <td>
                                <div class="table-cell-card" :class="getStatusClass(row.status)">
                                    {{ row.status }}
                                </div>
                            </td>
                            <td>{{ row.lastUpdated }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <!-- Data Summary -->
            <div v-if="tableData.length > 0" class="data-summary">
                <p>Loaded {{ tableData.length }} items from simulated API</p>
            </div>
        </div>
    `
};

// Export for use in other components
export default TestTableComponent;
