import { TestTableComponent } from '../testTableComponent.js';

export const InventoryContent = {
    components: {
        'test-table': TestTableComponent
    },
    props: {
        showAlert: Function
    },
    template: `
        <div class="inventory-page">
            <h3>Inventory Management</h3>
            <p>Manage and track all inventory items, conditions, and locations.</p>
            
            <div style="margin: 1rem 0; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button @click="showAlert('Add new item functionality coming soon!', 'Info')">Add New Item</button>
                <button @click="showAlert('QR code scanning functionality coming soon!', 'Info')">Scan QR Code</button>
                <button @click="showAlert('Bulk import functionality coming soon!', 'Info')">Bulk Import</button>
            </div>
            
            <div style="margin-top: 1.5rem;">
                <h4>Current Inventory</h4>
                <test-table></test-table>
            </div>
        </div>
    `
};
