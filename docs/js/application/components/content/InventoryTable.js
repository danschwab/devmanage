import { html, Requests, TableComponent } from '../../index.js';

// Global reactive store for inventory tables
const inventoryTableStore = Vue.reactive({});

// Inventory component that loads real inventory data using the data management API
export const InventoryTableComponent = {
    components: {
        TableComponent
    },
    props: {
        isLoading: {
            type: Boolean,
            default: false
        },
        containerPath: {
            type: String,
            default: 'inventory'
        },
        tabName: {
            type: String,
            default: 'furniture'
        },
        tabTitle: {
            type: String,
            default: 'FURNITURE'
        }
    },
    data() {
        return {
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
                    label: 'Description',
                    editable: true
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
            ],
            internalLoading: false,
            loadingMessage: 'Loading data...' // <-- add loading message state
        };
    },
    mounted() {
        // Use global reactive store if present
        const saved = inventoryTableStore[this.containerPath];
        if (saved) {
            this.tableData = saved;
        } else {
            this.loadInventoryData();
        }
    },
    methods: {
        setLoading(loading, message = 'Loading data...') {
            this.internalLoading = loading;
            this.loadingMessage = message;
        },
        async loadInventoryData() {
            this.setLoading(true, 'Loading data...');
            this.$emit('update:isLoading', true);
            this.error = null;
            try {
                Requests.clearCache('INVENTORY', this.tabTitle);
                const rawData = await Requests.fetchData('INVENTORY', this.tabTitle);
                this.tableData = this.transformInventoryData(rawData);
                inventoryTableStore[this.containerPath] = this.tableData;
            } catch (error) {
                this.error = error.message;
                console.error('Error loading inventory data:', error);
            } finally {
                this.setLoading(false);
                this.$emit('update:isLoading', false);
                this.$nextTick(() => {
                    this.refreshEditableCells();
                });
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
            this.setLoading(true, 'Clearing Cache...');
            Requests.clearCache('INVENTORY', this.tabTitle);
            this.loadInventoryData();
        },
        handleCellEdit(rowIdx, colIdx, value) {
            // Update tableData and global store
            const colKey = this.columns[colIdx]?.key;
            if (colKey) {
                this.tableData[rowIdx][colKey] = value;
                inventoryTableStore[this.containerPath] = this.tableData;
            }
        },
        async handleSave() {
            this.setLoading(true, 'Saving data...');
            try {
                // Convert tableData to 2D array with headers for Google Sheets
                const headers = this.columns.map(col => col.label);
                const rows = this.tableData.map(row => [
                    row.itemNumber,
                    row.description,
                    row.quantity
                ]);
                const sheetData = [headers, ...rows];
                await Requests.saveData('INVENTORY', this.tabTitle, sheetData);
                await this.loadInventoryData();
            } catch (error) {
                this.error = error.message || 'Failed to save data';
                console.error('Error saving inventory data:', error);
            }
        },
        refreshEditableCells() {
            // Call refreshEditableCells on child TableComponent via ref
            if (this.$refs.tableComponent && this.$refs.tableComponent.refreshEditableCells) {
                this.$refs.tableComponent.refreshEditableCells();
            }
        }
    },
    template: html `
        <div class="inventory-table-component">
            <TableComponent
                ref="tableComponent"
                :data="tableData"
                :columns="columns"
                :isLoading="internalLoading || isLoading"
                :error="error"
                :showRefresh="true"
                emptyMessage="No inventory items found"
                :loading-message="loadingMessage"
                @refresh="handleRefresh"
                @cell-edit="handleCellEdit"
                @on-save="handleSave"
            />
        </div>
    `
};