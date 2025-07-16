import { html, InventoryTableComponent } from '../../index.js';

export const InterfacesContent = {
    components: {
        'inventory-table': InventoryTableComponent
    },
    template: html`
        <div class="interfaces-page">
            <h3>Interface Testing</h3>
            <p>Test various UI components and data interfaces.</p>
            <inventory-table></inventory-table>
        </div>
    `
};
