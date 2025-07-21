import { html, TableComponent, Requests } from '../../index.js';

const packlistTableStore = Vue.reactive({}); // global reactive store

export const PacklistTable = {
    components: { TableComponent },
    props: {
        content: { type: Object, required: false, default: () => ({}) },
        tabName: { type: String, default: '' },
        sheetId: { type: String, default: '' },
        isLoading: { type: Boolean, default: false }
    },
    data() {
        // Load table data from store if available
        const storeData = packlistTableStore[this.tabName];
        return {
            dirty: false,
            moved: false,
            isSaving: false,
            isPrinting: false,
            mainTableData: storeData ? storeData.mainTableData : null,
            originalData: storeData ? storeData.originalData : [],
            saveDisabled: true,
            internalLoading: this.isLoading,
            dirtyCrateRows: storeData ? storeData.dirtyCrateRows || {} : {},
            loadedContent: storeData ? storeData.loadedContent || (this.content || {}) : (this.content || {}),
            error: storeData ? storeData.error : null
        };
    },
    watch: {
        isLoading(val) {
            this.internalLoading = val;
        }
    },
    computed: {
        mainHeaders() {
            return [...(this.loadedContent.headers?.main || []), 'Items'];
        },
        mainColumns() {
            return this.mainHeaders.map((label, idx) => {
                if (label === 'Piece #') {
                    return { key: label, label, editable: false, isIndex: true };
                }
                return { key: label, label, editable: ['Type','L','W','H','Weight','Notes'].includes(label), hidden: []};
            });
        }
    },
    mounted() {
        // If table data is already in store, use it and ensure loading is false
        if (packlistTableStore[this.tabName] && packlistTableStore[this.tabName].mainTableData) {
            this.mainTableData = packlistTableStore[this.tabName].mainTableData;
            this.originalData = packlistTableStore[this.tabName].originalData;
            this.loadedContent = packlistTableStore[this.tabName].loadedContent;
            this.dirtyCrateRows = packlistTableStore[this.tabName].dirtyCrateRows || {};
            this.error = packlistTableStore[this.tabName].error;
            this.internalLoading = false;
            this.$nextTick(() => {
                if (this.$refs.mainTableComponent && this.$refs.mainTableComponent.refreshEditableCells) {
                    this.$refs.mainTableComponent.refreshEditableCells();
                }
            });
            // Always fetch originalData from API for dirty checking
            this.loadOriginalDataFromApi();
            return;
        }
        // Otherwise, fetch from API if needed
        if ((!this.content || Object.keys(this.content).length === 0) && this.tabName) {
            this.internalLoading = true;
            Requests.getPackList(this.tabName)
                .then(content => {
                    this.loadedContent = content;
                    this.error = null;
                    this.internalLoading = false;
                    this.initializeTableData();
                    // Always fetch originalData from API for dirty checking
                    this.loadOriginalDataFromApi();
                })
                .catch(err => {
                    this.error = err.message || 'Failed to load packlist';
                    this.internalLoading = false;
                    this.initializeTableData();
                    this.loadOriginalDataFromApi();
                });
        } else {
            this.loadedContent = this.content;
            this.internalLoading = false;
            this.initializeTableData();
            this.loadOriginalDataFromApi();
        }
    },
    methods: {
        async loadOriginalDataFromApi() {
            try {
                const content = await Requests.getPackList(this.tabName);
                // Build originalData from API content
                if (content && content.crates) {
                    const mainHeaders = content.headers?.main || [];
                    const itemHeaders = content.headers?.items || [];
                    const originalData = (content.crates || []).map((crate, crateIdx) => {
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
                    this.originalData = JSON.parse(JSON.stringify(originalData));
                    this.saveTableState();
                    this.$nextTick(() => {
                        if (this.$refs.mainTableComponent && this.$refs.mainTableComponent.compareAllCellsDirty) {
                            this.$refs.mainTableComponent.compareAllCellsDirty();
                        }
                    });
                }
            } catch (error) {
                // Only set error for originalData fetch, do not clear mainTableData
                console.error('Error loading original packlist data:', error);
            }
        },
        initializeTableData() {
            if (!this.loadedContent || !this.loadedContent.crates) {
                this.mainTableData = [];
                this.originalData = [];
                this.saveTableState();
                this.$nextTick(() => {
                    if (this.$refs.mainTableComponent && this.$refs.mainTableComponent.refreshEditableCells) {
                        this.$refs.mainTableComponent.refreshEditableCells();
                    }
                });
                return;
            }
            this.mainTableData = this.buildMainTableData();
            // Do not set originalData here, always fetch from API
            this.saveTableState();
            this.$nextTick(() => {
                if (this.$refs.mainTableComponent && this.$refs.mainTableComponent.refreshEditableCells) {
                    this.$refs.mainTableComponent.refreshEditableCells();
                }
            });
        },
        saveTableState() {
            packlistTableStore[this.tabName] = {
                mainTableData: this.mainTableData,
                originalData: this.originalData,
                dirtyCrateRows: this.dirtyCrateRows,
                loadedContent: this.loadedContent,
                error: this.error
            };
        },
        buildItemTable(crate, crateIdx) {
            return {
                columns: (this.loadedContent.headers?.items || []).map(label => ({
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
        buildMainTableData() {
            const mainHeaders = this.loadedContent.headers?.main || [];
            const itemHeaders = this.loadedContent.headers?.items || [];
            return (this.loadedContent.crates || []).map((crate, crateIdx) => {
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
            this.saveTableState();
        },
        handleRowMove(dragIndex, dropIndex, newData, type = 'main', crateIdx = null) {
            this.moved = true;
            this.saveDisabled = false;
            if (type === 'main') {
                if (Array.isArray(newData)) {
                    this.mainTableData.splice(0, this.mainTableData.length, ...newData);
                }
                this.saveTableState();
                Vue.nextTick(() => {
                    if (this.$refs.mainTableComponent && this.$refs.mainTableComponent.refreshEditableCells) {
                        this.$refs.mainTableComponent.refreshEditableCells();
                    }
                });
            } else if (type === 'item' && crateIdx !== null) {
                if (Array.isArray(newData) && this.mainTableData[crateIdx] && Array.isArray(this.mainTableData[crateIdx].Items)) {
                    this.mainTableData[crateIdx].Items.splice(0, this.mainTableData[crateIdx].Items.length, ...newData);
                }
                this.saveTableState();
                Vue.nextTick(() => {
                    const itemTableRef = this.$refs.mainTableComponent?.$refs?.[`tableComponent-items-${crateIdx}`];
                    if (itemTableRef && itemTableRef.refreshEditableCells) {
                        itemTableRef.refreshEditableCells();
                    }
                });
            }
        },
        handleAddCrate() {
            const mainHeaders = this.loadedContent.headers?.main || [];
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
            this.saveTableState();
        },
        handleAddItem(crateIdx) {
            const itemHeaders = this.loadedContent.headers?.items || [];
            const itemObj = {};
            itemHeaders.forEach(label => {
                itemObj[label] = '';
            });
            if (Array.isArray(this.mainTableData[crateIdx].Items)) {
                this.mainTableData[crateIdx].Items.push(itemObj);
            }
            this.dirty = true;
            this.saveDisabled = false;
            this.saveTableState();
        },
        async handleSave() {
            this.isSaving = true;
            // Implement save logic (call GoogleSheetsService.setSheetData, etc.)
            // ...existing code...
            this.dirty = false;
            this.moved = false;
            this.saveDisabled = true;
            this.dirtyCrateRows = {};
            this.isSaving = false;
            this.saveTableState();
        },
        async handlePrint() {
            this.isPrinting = true;
            // Implement print logic (open sheet, etc.)
            // ...existing code...
            this.isPrinting = false;
        },
        handleInnerTableDirty(isDirty, rowIndex) {
            if (typeof rowIndex === 'number') {
                if (isDirty) {
                    this.dirtyCrateRows[rowIndex] = true;
                } else {
                    delete this.dirtyCrateRows[rowIndex];
                }
            }
            const anyDirty = Object.keys(this.dirtyCrateRows).length > 0;
            if (anyDirty) {
                this.dirty = true;
                this.saveDisabled = false;
            }
            if (this.$refs.mainTableComponent && this.$refs.mainTableComponent.checkDirtyCells) {
                this.$refs.mainTableComponent.checkDirtyCells();
            }
            this.saveTableState();
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
                            :columns="loadedContent.headers.items.map(label => ({ key: label, label, editable: ['Description','Packing/shop notes'].includes(label) }))"
                            :hide-columns="['Pack','Check']"
                            :showRefresh="false"
                            :emptyMessage="'No items'"
                            :draggable="true"
                            :newRow="true"
                            :showFooter="false"
                            :showHeader="true"
                            :isLoading="internalLoading"
                            :drag-id="'packlist-items'"
                            @cell-edit="(itemRowIdx, itemColIdx, value) => { row.Items[itemRowIdx][loadedContent.headers.items[itemColIdx]] = value; dirty = true; saveDisabled = false; saveTableState(); }"
                            @row-move="(dragIndex, dropIndex, newData) => handleRowMove(dragIndex, dropIndex, newData, 'item', rowIndex)"
                            @new-row="() => { handleAddItem(rowIndex); saveTableState(); }"
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