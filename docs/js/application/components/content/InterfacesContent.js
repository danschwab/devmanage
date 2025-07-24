import { html, TableComponent } from '../../index.js';

const dummyData = [
    { id: 1, name: 'Alpha', status: 'Active' },
    { id: 2, name: 'Beta', status: 'Inactive' },
    { id: 3, name: 'Gamma', status: 'Active' }
];

const columns = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'status', label: 'Status' }
];

export const InterfacesContent = {
    components: {
        TableComponent
    },
    data() {
        return {
            dummyData,
            columns
        };
    },
    template: html`
        <div class="interfaces-page">
            <h3>Interface Testing</h3>
            <p>Test various UI components and data interfaces.</p>
            <TableComponent
                :data="dummyData"
                :columns="columns"
                :show-refresh="true"
                :show-header="true"
                :show-footer="true"
                :is-loading="false"
                :error="null"
                empty-message="No data"
                :draggable="true"
            />
        </div>
    `
};
