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
            mainTableData: null, // local reactive table data
            originalData: [], // <-- add this
            saveDisabled: true,
            internalLoading: this.isLoading // local loading state
        };
    },
    watch: {
        content: {
            handler(newVal) {
                console.log('[PacklistTable] content changed:', newVal);
                this.loadTableData();
                this.loadOriginalDataFromApi();
                Vue.nextTick(() => {
                    this.$forceUpdate && this.$forceUpdate();
                });
            },
            deep: true,
            immediate: true
        },
        'content.crates': {
            handler(newVal) {
                // Watch specifically for crates array changes (async population)
                if (Array.isArray(newVal) && newVal.length > 0) {
                    this.loadTableData();
                    Vue.nextTick(() => {
                        this.$forceUpdate && this.$forceUpdate();
                    });
                }
            },
            deep: true
        },
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
        async loadOriginalDataFromApi() {
            // Simulate API call: replace with your actual API fetch logic
            if (!this.content || !this.content.headers || !Array.isArray(this.content.crates)) {
                this.originalData = [];
                return;
            }
            if (this.content.crates.length === 0) {
                this.originalData = [];
                return;
            }
            // Build originalData from API payload (simulate with buildMainTableData)
            // Replace with actual API call if available
            const built = this.buildMainTableData();
            this.originalData = JSON.parse(JSON.stringify(built));
            // Recalculate dirty state after originalData is updated
            this.$nextTick(() => {
                if (this.$refs.mainTableComponent && this.$refs.mainTableComponent.checkDirtyCells) {
                    this.$refs.mainTableComponent.checkDirtyCells();
                }
            });
        },
        loadTableData() {
            if (!this.content || !this.content.headers || !Array.isArray(this.content.crates)) {
                this.internalLoading = true;
                this.mainTableData = null;
                return;
            }
            if (this.content.crates.length === 0) {
                this.internalLoading = true;
                this.mainTableData = null;
                return;
            }
            this.internalLoading = false;
            let saved = this.getReactiveTableData();
            if (saved) {
                this.mainTableData = saved;
            } else {
                const built = this.buildMainTableData();
                this.mainTableData = Vue.reactive(built);
                this.setReactiveTableData(this.mainTableData);
            }
            Vue.nextTick(() => {
                if (this.$refs.mainTableComponent && this.$refs.mainTableComponent.refreshEditableCells) {
                    this.$refs.mainTableComponent.refreshEditableCells();
                }
            });
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
            this.isSaving = false;
        },
        async handlePrint() {
            this.isPrinting = true;
            // Implement print logic (open sheet, etc.)
            // ...existing code...
            this.isPrinting = false;
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
                            :showHeader="false"
                            :isLoading="internalLoading"
                            :drag-id="'packlist-items'"
                            @cell-edit="(itemRowIdx, itemColIdx, value) => { row.Items[itemRowIdx][content.headers.items[itemColIdx]] = value; dirty = true; saveDisabled = false; }"
                            @row-move="(dragIndex, dropIndex, newData) => handleRowMove(dragIndex, dropIndex, newData, 'item', rowIndex)"
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