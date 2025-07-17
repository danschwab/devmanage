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
        },
        mainColumns() {
            // "Piece #" is always the first column if present
            return this.mainHeaders.map((label, idx) => {
                if (label === 'Piece #') {
                    return { key: label, label, editable: false, isIndex: true };
                }
                return { key: label, label, editable: ['Type','L','W','H','Weight','Notes'].includes(label), hidden: []};
            });
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
                emptyMessage: 'No items',
                hideColumns: ['Pack', 'Check']
            };
        },
        // Build main table data with Piece # as sequential numbers
        buildMainTableData() {
            return (this.content.crates || []).map((crate, crateIdx) => {
                const info = { ...crate.info };
                if (this.content.headers?.main?.includes('Piece #')) {
                    info['Piece #'] = crateIdx + 1;
                }
                return {
                    ...info,
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
                info: { 'Piece #': '', Type: '', L: '', W: '', H: '', Weight: '', Notes: '' },
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
            </div>
            <TableComponent
                :data="mainTableData"
                :columns="mainColumns"
                :title="tabName"
                :showRefresh="false"
                :emptyMessage="'No crates'"
                :draggable="true"
                :newRow="true"
                @cell-edit="handleCellEdit"
                @row-move="handleRowMove"
                @new-row="handleAddCrate"
            >
                <template #default="{ row, rowIndex, column }">
                    <template v-if="column && column.isIndex">
                        {{ rowIndex + 1 }}
                    </template>
                    <template v-else-if="column && column.key === 'Items'">
                        <TableComponent
                            v-if="row.Items"
                            :data="row.Items"
                            :columns="content.headers.items.map(label => ({ key: label, label, editable: ['Description','Packing/shop notes'].includes(label) }))"
                            :hide-columns="['Pack','Check']"
                            :showRefresh="false"
                            :emptyMessage="'No items'"
                            :draggable="true"
                            :newRow="true"
                            :showFooter="false"
                            :showHeader="false"
                            @cell-edit="() => handleCellEdit(rowIndex, null, null, 'item')"
                            @new-row="() => handleAddItem(rowIndex)"
                        />
                    </template>
                    <template v-else>
                        {{ row[column.key] }}
                    </template>
                </template>
            </TableComponent>
        </div>
    `
};

export default PacklistTable;