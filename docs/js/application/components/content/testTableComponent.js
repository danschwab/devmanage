import { Requests } from '../../index.js';
import { html, TableComponent } from '../../index.js';

// Test component that loads real inventory data using the data management API
export const TestTableComponent = {
    components: {
        TableComponent
    },
    data() {
        return {
            isLoading: false,
            tableData: [],
            error: null,
            columns: [
                { 
                    key: 'itemNumber', 
                    label: 'ITEM#',
                    width: 120
                },
                { 
                    key: 'description', 
                    label: 'Description'
                },
                { 
                    key: 'quantity', 
                    label: 'QTY',
                    format: 'number',
                    width: 100,
                    cellClass: (value) => {
                        if (value === 0) return 'red';
                        if (value < 5) return 'yellow';
                        return 'green';
                    }
                }
            ]
        };
    },
    mounted() {
        this.loadTestData();
    },
    methods: {
        async loadTestData() {
            this.isLoading = true;
            this.error = null;
            
            try {
                const rawData = await Requests.fetchData('INVENTORY', 'Furniture');
                this.tableData = this.transformInventoryData(rawData);
            } catch (error) {
                this.error = error.message;
                console.error('Error loading inventory data:', error);
            } finally {
                this.isLoading = false;
            }
        },
        
        transformInventoryData(rawData) {
            if (!rawData || rawData.length < 2) return [];
            
            const headers = rawData[0];
            const rows = rawData.slice(1);
            const headerMap = this.createHeaderMap(headers);
            
            return rows.map((row, index) => ({
                itemNumber: row[headerMap.itemNumber] || '',
                description: row[headerMap.description] || '',
                quantity: parseInt(row[headerMap.quantity]) || 0
            })).filter(item => item.itemNumber && item.description);
        },
        
        createHeaderMap(headers) {
            const map = {};
            headers.forEach((header, index) => {
                const cleanHeader = header.trim();
                if (cleanHeader === 'ITEM#') {
                    map.itemNumber = index;
                } else if (cleanHeader === 'Description') {
                    map.description = index;
                } else if (cleanHeader === 'QTY') {
                    map.quantity = index;
                }
            });
            return map;
        },
        
        handleRefresh() {
            this.loadTestData();
        }
    },
    template: html `
        <div class="test-table-component">
            <TableComponent
                :data="tableData"
                :columns="columns"
                :isLoading="isLoading"
                :error="error"
                title="Inventory Data Test"
                :showRefresh="true"
                emptyMessage="No inventory items found"
                @refresh="handleRefresh"
            />
        </div>
    `
};