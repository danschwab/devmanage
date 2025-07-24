import { html, TableComponent, Requests, getReactiveStore } from '../../index.js';

// Use getReactiveStore for packlist table data
export const PacklistTable = {
    components: { TableComponent },
    props: {
        content: { type: Object, required: false, default: () => ({}) },
        tabName: { type: String, default: '' },
        sheetId: { type: String, default: '' }
    },
    data() {
        return {
            packlistTableStore: null,
            saveDisabled: true,
            dirty: false,
            moved: false,
            isPrinting: false,
            dirtyCrateRows: {},
            error: null
        };
    },
    computed: {
        mainHeaders() {
            // Use headers from the first crate if available, else fallback to content
            const crates = this.mainTableData;
            if (crates.length > 0) {
                return [...Object.keys(crates[0]).filter(k => k !== 'Items'), 'Items'];
            }
            // fallback to content headers if present
            const headers = this.content && this.content.length > 0
                ? Object.keys(this.content[0]).filter(k => k !== 'Items')
                : [];
            return [...headers, 'Items'];
        },
        mainColumns() {
            return this.mainHeaders.map((label, idx) => {
                if (label === 'Piece #') {
                    return { key: label, label, editable: false, isIndex: true };
                }
                return { key: label, label, editable: ['Type','L','W','H','Weight','Notes'].includes(label), hidden: []};
            });
        },
        mainTableData() {
            // Use the reactive array directly from the store
            if (this.packlistTableStore && Array.isArray(this.packlistTableStore.data)) {
                return this.packlistTableStore.data;
            }
            return [];
        },
        originalData() {
            if (this.packlistTableStore && Array.isArray(this.packlistTableStore.originalData)) {
                return JSON.parse(JSON.stringify(this.packlistTableStore.originalData));
            }
            return [];
        },
        itemHeaders() {
            // Try to infer item headers from the first crate's Items array
            const crates = this.mainTableData;
            if (crates.length > 0 && Array.isArray(crates[0].Items) && crates[0].Items.length > 0) {
                return Object.keys(crates[0].Items[0]);
            }
            // fallback to content
            if (this.content && this.content.length > 0 && Array.isArray(this.content[0].Items) && this.content[0].Items.length > 0) {
                return Object.keys(this.content[0].Items[0]);
            }
            return [];
        },
        isLoading() {
            return this.packlistTableStore ? this.packlistTableStore.isLoading : false;
        },
        loadingMessage() {
            return this.packlistTableStore ? (this.packlistTableStore.loadingMessage || 'Loading data...') : 'Loading data...';
        }
    },
    async mounted() {
        // Pass Requests.savePackList as the save function
        this.packlistTableStore = getReactiveStore(
            Requests.getPackList,
            Requests.savePackList,
            [this.tabName]
        );
        this.error = this.packlistTableStore.error;
        // REMOVE: this.internalLoading = this.isLoading || this.packlistTableStore.isLoading;
    },
    methods: {
        async handleRefresh() {
            if (this.packlistTableStore) {
                await this.packlistTableStore.load('Reloading packlist...');
            }
        },
        handleCellEdit(rowIdx, colIdx, value, type = 'main') {
            this.dirty = true;
            this.saveDisabled = false;
            if (type === 'main') {
                const colKey = this.mainColumns[colIdx]?.key;
                if (colKey && this.mainTableData[rowIdx]) {
                    this.mainTableData[rowIdx][colKey] = value;
                }
            }
        },
        handleRowMove(dragIndex, dropIndex, newData, type = 'main', crateIdx = null) {
            this.moved = true;
            this.saveDisabled = false;
            if (type === 'main') {
                if (Array.isArray(newData)) {
                    this.mainTableData.splice(0, this.mainTableData.length, ...newData);
                }
            } else if (type === 'item' && crateIdx !== null) {
                if (Array.isArray(newData) && this.mainTableData[crateIdx] && Array.isArray(this.mainTableData[crateIdx].Items)) {
                    this.mainTableData[crateIdx].Items.splice(0, this.mainTableData[crateIdx].Items.length, ...newData);
                }
            }
        },
        handleAddCrate() {
            const headers = this.mainHeaders.filter(h => h !== 'Items');
            const infoObj = {};
            headers.forEach(label => {
                infoObj[label] = '';
            });
            infoObj['Piece #'] = this.mainTableData.length + 1;
            // Use the store's addRow to ensure reactivity and correct initialization
            if (this.packlistTableStore && typeof this.packlistTableStore.addRow === 'function') {
                this.packlistTableStore.addRow({
                    ...infoObj,
                    Items: []
                });
            }
            this.dirty = true;
            this.saveDisabled = false;
        },
        handleAddItem(crateIdx) {
            const itemHeaders = this.itemHeaders;
            const itemObj = {};
            itemHeaders.forEach(label => {
                itemObj[label] = '';
            });
            // Use the store's addNestedRow to ensure reactivity and correct initialization
            if (
                this.packlistTableStore &&
                typeof this.packlistTableStore.addNestedRow === 'function'
            ) {
                this.packlistTableStore.addNestedRow(crateIdx, 'Items', itemObj);
            }
            this.dirty = true;
            this.saveDisabled = false;
        },
        async handleSave() {
            // Only use the store's save method if this is called from the on-save event
            if (this.packlistTableStore) {
                await this.packlistTableStore.save('Saving packlist...');
            }
        },
        async handlePrint() {
            this.isPrinting = true;
            // ...existing code...
            this.isPrinting = false;
        },
        handleInnerTableDirty(isDirty, rowIndex) {
            if (this.$refs.mainTableComponent && this.$refs.mainTableComponent.checkDirtyCells) {
                this.$refs.mainTableComponent.checkDirtyCells();
            }
        }
    },
    template: html`
        <div class="packlist-table">
            <div v-if="error" class="error-message">
                <p>Error: {{ error }}</p>
            </div>
            <TableComponent
                ref="mainTableComponent"
                :data="mainTableData"
                :originalData="originalData"
                :columns="mainColumns"
                :title="tabName"
                :showRefresh="true"
                :emptyMessage="'No crates'"
                :draggable="true"
                :newRow="true"
                :isLoading="isLoading"
                :loading-message="loadingMessage"
                :drag-id="'packlist-crates'"
                @refresh="handleRefresh"
                @cell-edit="handleCellEdit"
                @row-move="(dragIndex, dropIndex, newData) => handleRowMove(dragIndex, dropIndex, newData, 'main')"
                @new-row="handleAddCrate"
                @on-save="handleSave"
            >
                <template #default="{ row, rowIndex, column, cellRowIndex, cellColIndex, onInnerTableDirty }">
                    <template v-if="column && column.isIndex">
                        <!-- Only count visible (not marked-for-deletion) rows for Piece # -->
                        {{
                            mainTableData
                                .filter(r => !r['marked-for-deletion'])
                                .findIndex(r => r === row) + 1
                        }}
                    </template>
                    <template v-else-if="column && column.key === 'Items'">
                        <TableComponent
                            v-if="row.Items"
                            :data="row.Items.length === 0 ? (() => { handleAddItem(rowIndex); return row.Items; })() : row.Items"
                            :originalData="originalData && originalData[rowIndex] ? originalData[rowIndex].Items : []"
                            :columns="itemHeaders.map(label => ({ key: label, label, editable: ['Description','Packing/shop notes'].includes(label) }))"
                            :hide-columns="['Pack','Check']"
                            :emptyMessage="'No items'"
                            :draggable="true"
                            :newRow="true"
                            :showFooter="false"
                            :showHeader="false"
                            :isLoading="isLoading"
                            :loading-message="loadingMessage"
                            :drag-id="'packlist-items'"
                            @cell-edit="(itemRowIdx, itemColIdx, value) => { row.Items[itemRowIdx][itemHeaders[itemColIdx]] = value; dirty = true; saveDisabled = false; }"
                            @row-move="(dragIndex, dropIndex, newData) => handleRowMove(dragIndex, dropIndex, newData, 'item', rowIndex)"
                            @new-row="() => { handleAddItem(rowIndex); }"
                            @inner-table-dirty="(isDirty) => { 
                                if (typeof onInnerTableDirty === 'function') {
                                    onInnerTableDirty(isDirty, rowIndex, column ? mainColumns.findIndex(c => c.key === column.key) : 0);
                                }
                                handleInnerTableDirty(isDirty, rowIndex);
                            }"
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