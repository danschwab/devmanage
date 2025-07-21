import { html, TableComponent } from '../../index.js';

const packlistTableStore = Vue.reactive({}); // global reactive store

export const PacklistTable = {
    components: { TableComponent },
    props: {
        content: { type: Object, required: true }, // { crates, headers }
        tabName: { type: String, default: '' },
        sheetId: { type: String, default: '' },
        isLoading: { type: Boolean, default: false }
        // Removed reactiveTableData, setReactiveTableData, getReactiveTableData
    },
    data() {
        return {
            dirty: false,
            moved: false,
            isSaving: false,
            isPrinting: false,
            mainTableData: null,
            originalData: [],
            saveDisabled: true,
            internalLoading: this.isLoading,
            dirtyCrateRows: {} // Track dirty state for each crate row (items table)
        };
    },
    watch: {
        isLoading(val) {
            this.internalLoading = val;
        }
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
            const mainHeaders = this.content.headers?.main || [];
            const itemHeaders = this.content.headers?.items || [];
            return (this.content.crates || []).map((crate, crateIdx) => {
                const infoObj = {};
                mainHeaders.forEach((label, i) => {
                    infoObj[label] = crate.info[i];
                });
                if (mainHeaders.includes('Piece #')) {
                    infoObj['Piece #'] = crateIdx + 1;
                }
                const items = (crate.items || []).map(itemArr => {
                    const itemObj = {};
                    itemHeaders.forEach((label, i) => {
                        itemObj[label] = itemArr[i];
                    });
                    return itemObj;
                });
                return {
                    ...infoObj,
                    Items: items
                };
            });
        },
        getReactiveTableData() {
            return packlistTableStore[this.tabName];
        },
        setReactiveTableData(data) {
            packlistTableStore[this.tabName] = data;
        },
        handleCellEdit(rowIdx, colIdx, value, type = 'main') {
            this.dirty = true;
            this.saveDisabled = false;
            if (type === 'main') {
                const colKey = this.mainColumns[colIdx]?.key;
                if (colKey) {
                    this.mainTableData[rowIdx][colKey] = value;
                }
            }
            // No need for localStorage, changes are reactive in the global store
        },
        handleRowMove(dragIndex, dropIndex, newData, type = 'main', crateIdx = null) {
            this.moved = true;
            this.saveDisabled = false;
            if (type === 'main') {
                // Reorder crates
                if (Array.isArray(newData)) {
                    this.mainTableData.splice(0, this.mainTableData.length, ...newData);
                }
                // Refresh editable cells after crate row move
                Vue.nextTick(() => {
                    if (this.$refs.mainTableComponent && this.$refs.mainTableComponent.refreshEditableCells) {
                        this.$refs.mainTableComponent.refreshEditableCells();
                    }
                });
            } else if (type === 'item' && crateIdx !== null) {
                // Reorder items in the correct crate
                if (Array.isArray(newData) && this.mainTableData[crateIdx] && Array.isArray(this.mainTableData[crateIdx].Items)) {
                    this.mainTableData[crateIdx].Items.splice(0, this.mainTableData[crateIdx].Items.length, ...newData);
                }
                // Refresh editable cells after item row move
                Vue.nextTick(() => {
                    // Find the correct TableComponent for the item table using crateIdx
                    const itemTableRef = this.$refs.mainTableComponent?.$refs?.[`tableComponent-items-${crateIdx}`];
                    if (itemTableRef && itemTableRef.refreshEditableCells) {
                        itemTableRef.refreshEditableCells();
                    }
                });
            }
        },
        handleAddCrate() {
            // Add a new crate row
            const mainHeaders = this.content.headers?.main || [];
            const infoObj = {};
            mainHeaders.forEach(label => {
                infoObj[label] = '';
            });
            infoObj['Piece #'] = this.mainTableData.length + 1;
            this.mainTableData.push({
                ...infoObj,
                Items: []
            });
            this.dirty = true;
            this.saveDisabled = false;
        },
        handleAddItem(crateIdx) {
            const itemHeaders = this.content.headers?.items || [];
            const itemObj = {};
            itemHeaders.forEach(label => {
                itemObj[label] = '';
            });
            if (Array.isArray(this.mainTableData[crateIdx].Items)) {
                this.mainTableData[crateIdx].Items.push(itemObj);
            }
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
            this.dirtyCrateRows = {}; // Reset dirty crate rows after save
            this.isSaving = false;
        },
        async handlePrint() {
            this.isPrinting = true;
            // Implement print logic (open sheet, etc.)
            // ...existing code...
            this.isPrinting = false;
        },
        handleInnerTableDirty(isDirty, rowIndex) {
            // Bubble up dirty state from nested TableComponent (items table)
            if (typeof rowIndex === 'number') {
                if (isDirty) {
                    this.dirtyCrateRows[rowIndex] = true;
                } else {
                    delete this.dirtyCrateRows[rowIndex];
                }
            }
            // If any crate row is dirty, set parent dirty/save state
            const anyDirty = Object.keys(this.dirtyCrateRows).length > 0;
            if (anyDirty) {
                this.dirty = true;
                this.saveDisabled = false;
            }
            // Run checkDirtyCells on the outer table to ensure state is updated
            if (this.$refs.mainTableComponent && this.$refs.mainTableComponent.checkDirtyCells) {
                this.$refs.mainTableComponent.checkDirtyCells();
            }
        }
    },
    template: html`
        <div class="packlist-table">
            <TableComponent
                ref="mainTableComponent"
                :data="mainTableData"
                :originalData="originalData"
                :columns="mainColumns"
                :title="tabName"
                :showRefresh="false"
                :emptyMessage="'No crates'"
                :draggable="true"
                :newRow="true"
                :isLoading="internalLoading"
                :drag-id="'packlist-crates'"
                @cell-edit="handleCellEdit"
                @row-move="(dragIndex, dropIndex, newData) => handleRowMove(dragIndex, dropIndex, newData, 'main')"
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
                            :originalData="originalData && originalData[rowIndex] ? originalData[rowIndex].Items : []"
                            :columns="content.headers.items.map(label => ({ key: label, label, editable: ['Description','Packing/shop notes'].includes(label) }))"
                            :hide-columns="['Pack','Check']"
                            :showRefresh="false"
                            :emptyMessage="'No items'"
                            :draggable="true"
                            :newRow="true"
                            :showFooter="false"
                            :showHeader="true"
                            :isLoading="internalLoading"
                            :drag-id="'packlist-items'"
                            @cell-edit="(itemRowIdx, itemColIdx, value) => { row.Items[itemRowIdx][content.headers.items[itemColIdx]] = value; dirty = true; saveDisabled = false; }"
                            @row-move="(dragIndex, dropIndex, newData) => handleRowMove(dragIndex, dropIndex, newData, 'item', rowIndex)"
                            @new-row="() => handleAddItem(rowIndex)"
                            @inner-table-dirty="(isDirty) => handleInnerTableDirty(isDirty, rowIndex)"
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