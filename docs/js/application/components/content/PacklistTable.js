import { html, TableComponent } from '../../index.js';

export const PacklistTable = {
    components: { TableComponent },
    props: {
        content: { type: Object, required: true }, // { crates, headers }
        tabName: { type: String, default: '' },
        sheetId: { type: String, default: '' }
    },
    data() {
        return {
            dirty: false,
            moved: false,
            isSaving: false,
            isPrinting: false,
            mainTableData: [],
            itemTables: [],
            saveDisabled: true
        };
    },
    computed: {
        mainHeaders() {
            return [...(this.content.headers?.main || []), 'Items'];
        }
    },
    methods: {
        // Build item table for each crate
        buildItemTable(crate, crateIdx) {
            return {
                columns: (this.content.headers?.items || []).map(label => ({
                    key: label,
                    label,
                    editable: ['Description','Packing/shop notes'].includes(label)
                })),
                data: crate.items || [],
                showRefresh: false,
                emptyMessage: 'No items'
            };
        },
        // Build main table data
        buildMainTableData() {
            return (this.content.crates || []).map((crate, crateIdx) => {
                return {
                    ...crate.info,
                    Items: crate.items
                };
            });
        },
        handleCellEdit(rowIdx, colIdx, value, type = 'main') {
            this.dirty = true;
            this.saveDisabled = false;
        },
        handleRowMove() {
            this.moved = true;
            this.saveDisabled = false;
        },
        handleAddCrate() {
            // Add a new crate row
            this.content.crates.push({
                info: { Type: '', L: '', W: '', H: '', Weight: '', Notes: '' },
                items: []
            });
            this.dirty = true;
            this.saveDisabled = false;
        },
        handleAddItem(crateIdx) {
            this.content.crates[crateIdx].items.push({
                Description: '',
                'Packing/shop notes': ''
            });
            this.dirty = true;
            this.saveDisabled = false;
        },
        async handleSave() {
            this.isSaving = true;
            // Implement save logic (call GoogleSheetsService.setSheetData, etc.)
            // ...existing code...
            this.dirty = false;
            this.moved = false;
            this.saveDisabled = true;
            this.isSaving = false;
        },
        async handlePrint() {
            this.isPrinting = true;
            // Implement print logic (open sheet, etc.)
            // ...existing code...
            this.isPrinting = false;
        }
    },
    mounted() {
        this.mainTableData = this.buildMainTableData();
    },
    template: html`
        <div class="packlist-table">
            <div class="packlist-actions">
                <button @click="handlePrint" :disabled="isPrinting">Print</button>
                <button @click="handleSave" :disabled="saveDisabled || isSaving">Save</button>
                <button @click="handleAddCrate">Add Crate</button>
            </div>
            <TableComponent
                :data="mainTableData"
                :columns="mainHeaders.map(label => ({ key: label, label, editable: ['Type','L','W','H','Weight','Notes'].includes(label) }))"
                :title="tabName"
                :showRefresh="false"
                :emptyMessage="'No crates'"
                @cell-edit="handleCellEdit"
                @row-move="handleRowMove"
            >
                <template #default="{ row, rowIndex }">
                    <TableComponent
                        v-if="row.Items"
                        :data="row.Items"
                        :columns="content.headers.items.map(label => ({ key: label, label, editable: ['Description','Packing/shop notes'].includes(label) }))"
                        :showRefresh="false"
                        :emptyMessage="'No items'"
                        @cell-edit="() => handleCellEdit(rowIndex, null, null, 'item')"
                    />
                    <button @click="handleAddItem(rowIndex)">Add Item</button>
                </template>
            </TableComponent>
        </div>
    `
};

export default PacklistTable;