import { html, parseDate, toUSDateString, LoadingBarComponent, ViewChangeComponent, NavigationRegistry, undoRegistry, setTableRowSelectionState, modalManager, getAutoColorClass } from '../../index.js';
import { useSearch } from '../../utils/useSearch.js';
import { useStickyHeader } from '../../utils/useStickyHeader.js';

// Component for the external clipboard paste modal.
// Shows row count, optional table selector, and Paste/Cancel buttons.
const ExternalPasteComponent = {
    props: {
        rowCount: Number,
        onConfirm: Function,
        onCancel: Function
    },
    methods: {
        select(dragId) { this.onConfirm?.(dragId); this.$emit('close-modal'); }
    },
    template: html`
        <div>
            <p>Select target for {{ rowCount }} copied row(s):</p>
            <div class="button-bar" style="flex-wrap: wrap;">
                <button v-for="opt in dragIdOptions" :key="opt.dragId"
                    class="blue"
                    @click="select(opt.dragId)">{{ opt.label }}</button>
            </div>
        </div>
    `
};

function normalizeItemSortWords(value) {
    return String(value)
        .toLowerCase()
        .split(/[\s\-_,./\\:;|]+/)
        .filter(Boolean);
}

function compareItemLikeValues(aValue, bValue) {
    const aWords = normalizeItemSortWords(aValue);
    const bWords = normalizeItemSortWords(bValue);
    const maxWords = Math.max(aWords.length, bWords.length);

    for (let i = 0; i < maxWords; i++) {
        const aWord = aWords[i];
        const bWord = bWords[i];

        if (aWord === undefined) return -1;
        if (bWord === undefined) return 1;

        const wordComparison = aWord.localeCompare(bWord, undefined, { numeric: true, sensitivity: 'base' });
        if (wordComparison !== 0) {
            return wordComparison;
        }
    }

    return String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: 'base' });
}

// Global table row selection state - single source of truth for all selections
export const tableRowSelectionState = Vue.reactive({
    // Selection map with unique keys to handle multiple tables
    selections: new Map(), // Map of selectionKey -> { rowIndex: number, sourceArray: arrayRef, dragId: dragId }
    
    // Version counter to trigger reactivity when selections change
    _version: 0,
    
    // Configuration options
    allowMultiSourceDrag: true, // Allow dragging selections from different data sources
    
    // Drag state
    findingDropTargets: false,
    dragSourceArray: null,
    dragTargetArray: null,
    dragId: null, // The dragId of the table group participating in drag operations
    currentDropTarget: null, // Current registered drop target from tables
    
    // Undo/redo support - track current route for undo captures
    currentRouteKey: null,
    
    // Multiselect timing - track when multiselect last finished to prevent immediate deselection
    lastMultiSelectEndTime: null,
    
    // Drag timing - track when drag last finished to prevent immediate deselection
    lastDragEndTime: null,

    // Snapshot selections at drag start so drag gating stays stable during a drag session
    dragSelectionSnapshot: null,

    // Global mouse position for drag follower UI
    mouseX: null,
    mouseY: null,

    // Clipboard mode state
    clipboardMode: null,           // null | 'copy' | 'cut'
    clipboardItems: [],            // Array of { clone, original } where original is null for 'copy'
    clipboardSourceDragId: null,   // dragId to gate which tables show drop targets
    clipboardSourceRoute: null,    // route key at the time Ctrl+C/X was pressed
    _clipboardCommitting: false,   // internal guard: true while completeClipboard mutates state
    _handleClipboardKeydown: null, // bound reference to the global keydown listener

    // External clipboard interop
    activeTables: new Map(),              // dragId -> [instance, ...] of mounted draggable tables
    _appClipboardContent: null,           // last TSV string written to OS clipboard by this app
    _lastSeenExternalContent: null,       // last external clipboard string shown to the user
    externalPasteActive: false,           // mutex: only one table handles a given external paste event
    clipboardReadPermission: null,        // null | 'granted' | 'prompt' | 'denied' — clipboard-read permission state
    clipboardPromptDismissed: false,      // true after the user clicks X on the permission banner this session

    // Cache parsed row metadata by row reference and raw MetaData string
    _metaParseCache: new WeakMap(),
    
    // Set active route for undo tracking
    setActiveRoute(routeKey) {
        this.currentRouteKey = routeKey;
    },

    // Check clipboard-read permission state without triggering a browser prompt.
    // Subscribes to future permission changes via onchange.
    async checkClipboardPermission() {
        try {
            const perm = await navigator.permissions.query({ name: 'clipboard-read' });
            this.clipboardReadPermission = perm.state;
            perm.onchange = () => { this.clipboardReadPermission = perm.state; };
        } catch (_e) {
            this.clipboardReadPermission = 'denied';
        }
    },

    // Request clipboard-read permission via a real readText() call.
    // MUST be called from a user-gesture handler (click, keypress, etc.).
    // Returns the clipboard text if granted, or null if denied.
    async requestClipboardPermission() {
        try {
            const text = await navigator.clipboard.readText();
            this.clipboardReadPermission = 'granted';
            return text;
        } catch (_e) {
            try {
                const perm = await navigator.permissions.query({ name: 'clipboard-read' });
                this.clipboardReadPermission = perm.state;
            } catch (_e2) {
                this.clipboardReadPermission = 'denied';
            }
            return null;
        }
    },

    // --- Clipboard helpers ---

    // Deep-clone a row for clipboard use, stripping runtime/deletion state.
    // Grouping is preserved so structure survives paste; group IDs are remapped by _remapCloneGroupIds.
    // JSON round-trip produces a fully plain, deep copy free of Vue proxy references
    // and shared nested-object references. AppData is excluded before serialization.
    _cloneRow(row) {
        const { AppData, ...withoutAppData } = row;
        let raw;
        try {
            raw = JSON.parse(JSON.stringify(withoutAppData));
        } catch (e) {
            raw = { ...withoutAppData };
        }
        if (raw.MetaData) {
            try {
                const meta = JSON.parse(raw.MetaData);
                delete meta.deletion;
                raw.MetaData = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
            } catch (e) {
                raw.MetaData = '';
            }
        }
        return raw;
    },

    // After deep-cloning a set of rows for a COPY operation, replace every group ID
    // that appears in the clones with a fresh unique ID so the pasted groups are
    // structurally identical to the originals but do not share the same groupId.
    _remapCloneGroupIds(clones) {
        const idMap = new Map(); // oldGroupId -> newGroupId
        clones.forEach(clone => {
            if (!clone.MetaData) return;
            let meta;
            try { meta = JSON.parse(clone.MetaData); } catch (e) { return; }
            const gid = meta?.grouping?.groupId;
            if (gid && !idMap.has(gid)) {
                idMap.set(gid, `G${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
            }
        });
        if (idMap.size === 0) return;
        clones.forEach(clone => {
            if (!clone.MetaData) return;
            let meta;
            try { meta = JSON.parse(clone.MetaData); } catch (e) { return; }
            const gid = meta?.grouping?.groupId;
            if (gid && idMap.has(gid)) {
                meta.grouping = { ...meta.grouping, groupId: idMap.get(gid) };
                clone.MetaData = JSON.stringify(meta);
            }
        });
    },

    // Enter clipboard mode: snapshot all selected rows across all tables and activate drop-target scanning
    startClipboard(mode, dragId, routeKey) {
        const allSelected = this.getAllSelectedRows()
            .sort((a, b) => a.index - b.index);
        if (allSelected.length === 0) return false;

        this.clipboardItems = allSelected.map(({ row }) => ({
            clone: this._cloneRow(row),
            original: mode === 'cut' ? row : null
        }));

        // For copy: remap group IDs in the clones to new unique values so that the
        // pasted group structure is independent of the originals in the source table.
        if (mode === 'copy') {
            this._remapCloneGroupIds(this.clipboardItems.map(item => item.clone));
        }

        this.clipboardMode = mode;
        this.clipboardSourceDragId = dragId;
        this.clipboardSourceRoute = routeKey;

        // Reuse findingDropTargets so all matching tables show drop target indicators
        this.findingDropTargets = true;
        this.dragId = dragId;
        this.dragTargetArray = null;
        this.currentDropTarget = null;
        this._version++;

        this._handleClipboardKeydown = this._onClipboardKeydown.bind(this);
        document.addEventListener('keydown', this._handleClipboardKeydown);
        return true;
    },

    // Global keydown handler active while clipboard mode is on
    _onClipboardKeydown(event) {
        if (event.key === 'Escape') {
            this.cancelClipboard();
            event.preventDefault();
            return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
            if (this.dragTargetArray && this.currentDropTarget && this.currentDropTarget.type) {
                this.completeClipboard(this.currentDropTarget);
            }
            event.preventDefault();
        }
    },

    // Exit clipboard mode and clear all clipboard state
    cancelClipboard() {
        this.clipboardMode = null;
        this.clipboardItems = [];
        this.clipboardSourceDragId = null;
        this.clipboardSourceRoute = null;
        this.findingDropTargets = false;
        this.dragId = null;
        this.dragTargetArray = null;
        this.currentDropTarget = null;
        this.mouseX = null;
        this.mouseY = null;
        this._version++;

        if (this._handleClipboardKeydown) {
            document.removeEventListener('keydown', this._handleClipboardKeydown);
            this._handleClipboardKeydown = null;
        }
    },

    // Complete a clipboard paste at the registered drop target
    completeClipboard(dropTarget) {
        if (!this.clipboardMode || !this.clipboardItems.length || !this.dragTargetArray) {
            this.cancelClipboard();
            return false;
        }

        const isCut = this.clipboardMode === 'cut';
        // Same-route cut behaves like drag-drop: move originals without marking for deletion
        const shouldMove = isCut && this.clipboardSourceRoute === this.currentRouteKey;

        // Capture state before any mutation for undo.
        // For cross-route cut: capture the paste-side and cut-side arrays independently
        // so each route's undo stack only contains its own mutations.
        if (this.currentRouteKey) {
            if (isCut && !shouldMove) {
                const formatRoute = r => r ? r.replace(/\b\w/g, c => c.toUpperCase()) : 'another page';
                const sourceName = formatRoute(this.clipboardSourceRoute);
                const destName = formatRoute(this.currentRouteKey);
                const count = this.clipboardItems.length;

                // Paste route: only the target array. Undoing here will remove the pasted clones
                // but cannot undo the deletion-marking on the source route.
                undoRegistry.capture([this.dragTargetArray], this.currentRouteKey, {
                    type: 'drag',
                    selectionState: tableRowSelectionState,
                    undoAlert: `The removal of ${count} item(s) on ${sourceName} must be undone or redone separately.`
                });
                // Cut route: snapshot source arrays so deletion-marking can be independently undone.
                if (this.clipboardSourceRoute) {
                    const sourceArrays = [];
                    for (const selection of this.selections.values()) {
                        if (!sourceArrays.includes(selection.sourceArray)) {
                            sourceArrays.push(selection.sourceArray);
                        }
                    }
                    if (sourceArrays.length > 0) {
                        undoRegistry.capture(sourceArrays, this.clipboardSourceRoute, {
                            type: 'drag',
                            undoAlert: `The addition of ${count} item(s) on ${destName} must be undone or redone separately.`
                        });
                    }
                }
            } else {
                // Same-route cut or copy: capture all involved arrays together under this route.
                const arraysToCapture = new Set([this.dragTargetArray]);
                for (const selection of this.selections.values()) {
                    arraysToCapture.add(selection.sourceArray);
                }
                undoRegistry.capture(Array.from(arraysToCapture), this.currentRouteKey, {
                    type: 'drag',
                    selectionState: tableRowSelectionState
                });
            }
        }

        // For same-route cut: build a map from sourceArray → [{row, index}] using the
        // original object references still in this.selections.
        let clipboardBySource = null;
        if (shouldMove) {
            const sourceArraysSet = new Set();
            for (const selection of this.selections.values()) {
                sourceArraysSet.add(selection.sourceArray);
            }
            clipboardBySource = new Map();
            for (const item of this.clipboardItems) {
                if (!item.original) continue;
                for (const arr of sourceArraysSet) {
                    const idx = arr.indexOf(item.original);
                    if (idx !== -1) {
                        if (!clipboardBySource.has(arr)) clipboardBySource.set(arr, []);
                        clipboardBySource.get(arr).push({ row: item.original, index: idx });
                        break;
                    }
                }
            }
        }

        // Handle 'onto' drop: group rows under the target row
        if (dropTarget.type === 'onto') {
            const targetIndex = dropTarget.targetIndex;
            const targetItem = this.dragTargetArray[targetIndex];
            if (!targetItem) {
                this.cancelClipboard();
                return false;
            }

            const existingGrouping = this._getRowGrouping(targetIndex, this.dragTargetArray);
            const groupId = existingGrouping?.groupId || `G${Date.now()}`;

            if (!existingGrouping?.isGroupMaster) {
                let meta = {};
                try { meta = JSON.parse(targetItem.MetaData || '{}'); } catch (e) {}
                meta.grouping = { groupId, isGroupMaster: true };
                targetItem.MetaData = JSON.stringify(meta);
            }

            let rowsToInsert;
            if (shouldMove) {
                // Remove originals from their source arrays, then insert
                rowsToInsert = [];
                for (const [sourceArray, entries] of clipboardBySource) {
                    const sortedAsc = entries.sort((a, b) => a.index - b.index);
                    const sortedDesc = [...sortedAsc].reverse();
                    sortedAsc.forEach(e => { delete e.row.AppData; rowsToInsert.push(e.row); });
                    sortedDesc.forEach(e => {
                        if (e.index < sourceArray.length) sourceArray.splice(e.index, 1);
                    });
                }
            } else {
                // Cross-route cut or copy: use clones; mark originals for deletion if cut
                rowsToInsert = this.clipboardItems.map(item => item.clone);
                if (isCut) {
                    for (const item of this.clipboardItems) {
                        if (item.original) {
                            let meta = {};
                            try { meta = JSON.parse(item.original.MetaData || '{}'); } catch (e) {}
                            meta.deletion = { marked: true };
                            item.original.MetaData = JSON.stringify(meta);
                        }
                    }
                }
            }

            rowsToInsert.forEach(row => {
                let meta = {};
                try { meta = JSON.parse(row.MetaData || '{}'); } catch (e) {}
                meta.grouping = { groupId, isGroupMaster: false };
                row.MetaData = JSON.stringify(meta);
            });

            // Re-find target index after possible removals (same-array removal shifts indices)
            const newTargetIndex = this.dragTargetArray.indexOf(targetItem);
            this.dragTargetArray.splice(newTargetIndex + 1, 0, ...rowsToInsert);

            const targetDragId = this.clipboardSourceDragId;
            this._clipboardCommitting = true;
            this.clearAll();
            rowsToInsert.forEach(row => {
                const idx = this.dragTargetArray.indexOf(row);
                if (idx !== -1) this.addRow(idx, this.dragTargetArray, targetDragId);
            });
            this._clipboardCommitting = false;

            this.lastDragEndTime = Date.now();
            this.cancelClipboard();
            return true;
        }

        // Determine insertion position for between/header/footer drops
        let insertPosition;
        if (dropTarget.type === 'header') {
            insertPosition = 0;
        } else if (dropTarget.type === 'between') {
            insertPosition = dropTarget.targetIndex;
        } else {
            this.cancelClipboard();
            return false;
        }

        let finalRows;
        if (shouldMove) {
            // Same-route cut: move originals exactly like completeDrag
            finalRows = [];
            let totalRowsInserted = 0;

            for (const [sourceArray, entries] of clipboardBySource) {
                const sortedAsc = entries.sort((a, b) => a.index - b.index);
                const sortedDesc = [...sortedAsc].reverse();
                const rowsData = sortedAsc.map(e => e.row);

                rowsData.forEach(row => { delete row.AppData; });
                finalRows.push(...rowsData);

                if (sourceArray === this.dragTargetArray) {
                    // Same array: reorder (mirrors completeDrag same-array branch)
                    let adjustedInsertPosition = insertPosition + totalRowsInserted;
                    sortedDesc.forEach(e => {
                        if (e.index < sourceArray.length) {
                            sourceArray.splice(e.index, 1);
                            if (e.index < adjustedInsertPosition) adjustedInsertPosition--;
                        }
                    });
                    if (adjustedInsertPosition >= 0 && adjustedInsertPosition <= sourceArray.length) {
                        sourceArray.splice(adjustedInsertPosition, 0, ...rowsData);
                    }
                } else {
                    // Different array on same route: remove from source, insert into target
                    sortedDesc.forEach(e => {
                        if (e.index < sourceArray.length) sourceArray.splice(e.index, 1);
                    });
                    const adjustedInsertPosition = insertPosition + totalRowsInserted;
                    if (adjustedInsertPosition >= 0 && adjustedInsertPosition <= this.dragTargetArray.length) {
                        this.dragTargetArray.splice(adjustedInsertPosition, 0, ...rowsData);
                    }
                    totalRowsInserted += rowsData.length;
                }
            }
        } else {
            // Copy or cross-route cut: insert clones
            finalRows = this.clipboardItems.map(item => item.clone);
            this.dragTargetArray.splice(insertPosition, 0, ...finalRows);
            if (isCut) {
                for (const item of this.clipboardItems) {
                    if (item.original) {
                        let meta = {};
                        try { meta = JSON.parse(item.original.MetaData || '{}'); } catch (e) {}
                        meta.deletion = { marked: true };
                        item.original.MetaData = JSON.stringify(meta);
                    }
                }
            }
        }

        const targetDragId = this.clipboardSourceDragId;
        this._clipboardCommitting = true;
        this.clearAll();
        finalRows.forEach(row => {
            const idx = this.dragTargetArray.indexOf(row);
            if (idx !== -1) this.addRow(idx, this.dragTargetArray, targetDragId);
        });
        this._clipboardCommitting = false;

        this.lastDragEndTime = Date.now();
        this.cancelClipboard();
        return true;
    },

    // --- End clipboard helpers ---
    
    // Generate unique selection key for a row in a specific table
    _getSelectionKey(rowIndex, sourceArray) {
        // Use the array reference memory address as a unique identifier combined with row index
        // This approach ensures different table instances get different keys even if they have similar content
        if (!sourceArray._tableId) {
            // Generate a unique ID for this table if it doesn't have one
            sourceArray._tableId = 'table_' + Math.random().toString(36).substr(2, 9);
        }
        return `${sourceArray._tableId}_${rowIndex}`;
    },

    // Read and cache parsed metadata for a row
    _getRowMetadata(row) {
        if (!row || row.MetaData == null || row.MetaData === '') return null;

        if (typeof row.MetaData === 'object') {
            return row.MetaData;
        }

        const cached = this._metaParseCache.get(row);
        if (cached && cached.raw === row.MetaData) {
            return cached.parsed;
        }

        let parsed = null;
        try {
            parsed = JSON.parse(row.MetaData);
        } catch (e) {
            parsed = null;
        }

        this._metaParseCache.set(row, { raw: row.MetaData, parsed });
        return parsed;
    },
    
    // Helper to get all children indices of a group master
    _getGroupChildren(rowIndex, sourceArray) {
        const row = sourceArray[rowIndex];
        if (!row) return [];

        const metadata = this._getRowMetadata(row);
        if (!metadata) return [];
        
        const grouping = metadata?.grouping;
        
        // Only proceed if this row is a group master
        if (!grouping || !grouping.isGroupMaster) return [];
        
        const groupId = grouping.groupId;
        const children = [];
        
        // Find all rows with matching groupId that are NOT masters
        for (let i = 0; i < sourceArray.length; i++) {
            if (i === rowIndex) continue; // Skip the master itself
            
            const childRow = sourceArray[i];
            if (!childRow) continue;

            const childMetadata = this._getRowMetadata(childRow);
            if (!childMetadata) continue;
            
            const childGrouping = childMetadata?.grouping;
            
            if (childGrouping && childGrouping.groupId === groupId && !childGrouping.isGroupMaster) {
                children.push(i);
            }
        }
        
        return children;
    },
    
    // Shared helper to get grouping edithistory from a row
    _getRowGrouping(rowIndex, sourceArray) {
        const row = sourceArray[rowIndex];
        if (!row) return null;

        const metadata = this._getRowMetadata(row);
        return metadata?.grouping || null;
    },

    // Find the index of the group master for a given groupId by scanning the array
    _findGroupMasterIndex(groupId, sourceArray) {
        for (let i = 0; i < sourceArray.length; i++) {
            const grouping = this._getRowGrouping(i, sourceArray);
            if (grouping && grouping.groupId === groupId && grouping.isGroupMaster) {
                return i;
            }
        }
        return -1;
    },

    // Add a row to global selection
    addRow(rowIndex, sourceArray, dragId = null) {
        // Only clear if switching between different drag groups (both must have values and be different)
        if (dragId && this.dragId && dragId !== this.dragId) {
            this.clearAll();
        }

        const selectionKey = this._getSelectionKey(rowIndex, sourceArray);
        this.selections.set(selectionKey, {
            rowIndex: rowIndex,
            sourceArray: sourceArray,
            dragId: dragId
        });
        // Update global dragId if one is provided
        if (dragId) {
            this.dragId = dragId;
        }
        
        // Auto-select all children if this is a group master
        const children = this._getGroupChildren(rowIndex, sourceArray);
        children.forEach(childIndex => {
            const childKey = this._getSelectionKey(childIndex, sourceArray);
            this.selections.set(childKey, {
                rowIndex: childIndex,
                sourceArray: sourceArray,
                dragId: dragId
            });
        });
        
        // Increment version to trigger reactivity
        this._version++;
    },
    
    // Remove a row from global selection
    removeRow(rowIndex, sourceArray) {
        // Check if this row is a group child
        const grouping = this._getRowGrouping(rowIndex, sourceArray);
        if (grouping && !grouping.isGroupMaster) {
            // This is a group child - check if its master is selected
            const masterIndex = this._findGroupMasterIndex(grouping.groupId, sourceArray);
            if (masterIndex !== -1 && this.hasRow(sourceArray, masterIndex)) {
                // Master is selected, don't allow child to be unselected independently
                //console.log(`Cannot unselect row ${rowIndex} - its group master is selected`);
                return;
            }
        }
        
        const selectionKey = this._getSelectionKey(rowIndex, sourceArray);
        this.selections.delete(selectionKey);
        
        // Auto-deselect all children if this is a group master
        const children = this._getGroupChildren(rowIndex, sourceArray);
        children.forEach(childIndex => {
            const childKey = this._getSelectionKey(childIndex, sourceArray);
            this.selections.delete(childKey);
        });
        
        // Increment version to trigger reactivity
        this._version++;
    },
    
    // Toggle row selection
    toggleRow(rowIndex, sourceArray, dragId = null) {
        if (this.clipboardMode && !this._clipboardCommitting) {
            this.cancelClipboard();
            return;
        }
        if (this.hasRow(sourceArray, rowIndex)) {
            this.removeRow(rowIndex, sourceArray); // removeRow handles children
        } else {
            this.addRow(rowIndex, sourceArray, dragId); // addRow handles children
        }
    },
    
    // Check if a row is selected (by checking if any selection has this index in its source array)
    hasRow(sourceArray, rowIndex) {
        const selectionKey = this._getSelectionKey(rowIndex, sourceArray);
        return this.selections.has(selectionKey);
    },
    
    // Clear all selections
    clearAll() {
        if (this.clipboardMode && !this._clipboardCommitting) {
            this.cancelClipboard();
        }
        this.selections.clear();
        this._version++;
    },
    
    // Clear selections from a specific array
    clearArray(sourceArray) {
        for (const [selectionKey, selection] of this.selections) {
            if (selection.sourceArray === sourceArray) {
                this.selections.delete(selectionKey);
            }
        }
        this._version++;
    },
    
    // Get selection count for a specific array
    getArraySelectionCount(sourceArray) {
        let count = 0;
        for (const selection of this.selections.values()) {
            if (selection.sourceArray === sourceArray) {
                count++;
            }
        }
        return count;
    },
    
    // Get total selection count
    getTotalSelectionCount() {
        return this.selections.size;
    },
    
    // Get all selected row indices for a specific array
    getSelectedRowIndices(sourceArray) {
        const indices = [];
        for (const [selectionKey, selection] of this.selections) {
            if (selection.sourceArray === sourceArray) {
                indices.push(selection.rowIndex);
            }
        }
        return indices;
    },
    
    // Get all selected row data for a specific array
    getSelectedRowData(sourceArray) {
        const data = [];
        for (const [selectionKey, selection] of this.selections) {
            if (selection.sourceArray === sourceArray) {
                data.push(sourceArray[selection.rowIndex]);
            }
        }
        return data;
    },
    
    // Get all selected rows (index + data) for a specific array
    getSelectedRows(sourceArray) {
        const rows = [];
        for (const [selectionKey, selection] of this.selections) {
            if (selection.sourceArray === sourceArray) {
                rows.push({
                    index: selection.rowIndex,
                    data: sourceArray[selection.rowIndex]
                });
            }
        }
        return rows;
    },
    
    // Get all selected rows across all tables
    getAllSelectedRows() {
        const rows = [];
        for (const [selectionKey, selection] of this.selections) {
            rows.push({
                index: selection.rowIndex,
                row: selection.sourceArray[selection.rowIndex],
                sourceArray: selection.sourceArray
            });
        }
        return rows;
    },
    
    // Check if any selected row is a group master
    hasAnyGroupMaster() {
        for (const selection of this.selections.values()) {
            const grouping = this._getRowGrouping(selection.rowIndex, selection.sourceArray);
            if (grouping && grouping.isGroupMaster === true) {
                return true;
            }
        }
        return false;
    },

    // Use drag-start snapshot when available so gating is scoped to the current drag session.
    hasGroupMasterInDragSnapshot() {
        if (Array.isArray(this.dragSelectionSnapshot) && this.dragSelectionSnapshot.length > 0) {
            for (const selection of this.dragSelectionSnapshot) {
                const grouping = this._getRowGrouping(selection.rowIndex, selection.sourceArray);
                if (grouping && grouping.isGroupMaster === true) {
                    return true;
                }
            }
            return false;
        }

        return this.hasAnyGroupMaster();
    },
    
    // Check if a specific row is in a group (is a child, not a master)
    isRowInGroup(rowIndex, sourceArray) {
        const grouping = this._getRowGrouping(rowIndex, sourceArray);
        return grouping && !grouping.isGroupMaster;
    },
    
    // Check if a specific row is a group master
    isRowGroupMaster(rowIndex, sourceArray) {
        const grouping = this._getRowGrouping(rowIndex, sourceArray);
        return grouping && grouping.isGroupMaster === true;
    },
    
    // Check if inserting at a position would split a group
    wouldSplitGroup(insertIndex, sourceArray) {
        if (!sourceArray || sourceArray.length === 0) return false;
        
        // Get the rows immediately before and after the insertion point
        const rowBefore = insertIndex > 0 ? sourceArray[insertIndex - 1] : null;
        const rowAfter = insertIndex < sourceArray.length ? sourceArray[insertIndex] : null;
        
        if (!rowBefore && !rowAfter) return false;
        
        // Get grouping edithistory for both rows
        const beforeGrouping = rowBefore ? this._getRowGrouping(insertIndex - 1, sourceArray) : null;
        const afterGrouping = rowAfter ? this._getRowGrouping(insertIndex, sourceArray) : null;
        
        // If neither row is in a group, no split possible
        if (!beforeGrouping && !afterGrouping) return false;
        
        // Check if both rows belong to the same group
        if (beforeGrouping && afterGrouping && beforeGrouping.groupId === afterGrouping.groupId) {
            return true; // Would split the group
        }
        
        return false;
    },
    
    // Clean up group masters that have no children
    _cleanupOrphanedGroupMasters(sourceArray) {
        if (!sourceArray || sourceArray.length === 0) return;
        
        for (let i = 0; i < sourceArray.length; i++) {
            const grouping = this._getRowGrouping(i, sourceArray);
            
            // Only check rows that are group masters
            if (grouping && grouping.isGroupMaster) {
                const children = this._getGroupChildren(i, sourceArray);
                
                // If master has no children, remove its grouping data
                if (children.length === 0) {
                    const item = sourceArray[i];
                    if (item) {
                        // Parse existing metadata and remove only grouping
                        let metadata = {};
                        try {
                            metadata = JSON.parse(item.MetaData || '{}');
                        } catch (e) {
                            metadata = {};
                        }
                        delete metadata.grouping;
                        item.MetaData = Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : '';
                        //console.log(`Removed orphaned group master at index ${i} (no children found)`);
                    }
                }
            }
        }
    },
    
    // Group selected items under a target row (similar to markSelectedForDeletion)
    groupSelectedItemsUnder(targetIndex, targetArray) {
        if (this.selections.size === 0) {
            //console.log('No selections to group');
            return null;
        }
        
        const targetItem = targetArray[targetIndex];
        if (!targetItem) {
            console.warn('Invalid target item for grouping');
            return null;
        }
        
        // Get ALL selected items regardless of source array (for cross-table grouping)
        const allSelectedRows = [];
        const sourceArraysToProcess = new Map(); // Track which arrays we need to remove from
        
        for (const [selectionKey, selection] of this.selections) {
            const { rowIndex, sourceArray } = selection;
            const item = sourceArray[rowIndex];
            if (item) {
                allSelectedRows.push({ index: rowIndex, data: item, sourceArray });
                
                // Track items to remove from each source array
                if (!sourceArraysToProcess.has(sourceArray)) {
                    sourceArraysToProcess.set(sourceArray, []);
                }
                sourceArraysToProcess.get(sourceArray).push(rowIndex);
            }
        }
        
        const droppedItems = allSelectedRows.map(r => r.data);
        
        if (droppedItems.length === 0) {
            //console.log('No selected items found');
            return null;
        }
        
        // Check if target is already a group master
        const targetGrouping = this._getRowGrouping(targetIndex, targetArray);
        
        // Use existing groupId or generate new one
        const groupId = targetGrouping?.groupId || `G${Date.now()}`;
        
        // Update target item to be group master (if not already)
        if (!targetGrouping?.isGroupMaster) {
            // Parse existing metadata and add/update grouping
            let metadata = {};
            try {
                metadata = JSON.parse(targetItem.MetaData || '{}');
            } catch (e) {
                metadata = {};
            }
            metadata.grouping = {
                groupId: groupId,
                isGroupMaster: true
            };
            targetItem.MetaData = JSON.stringify(metadata);
            //console.log('Set target as group master:', groupId, 'index:', targetIndex);
        }
        
        // Remove dropped items from their source arrays (in reverse order to maintain indices)
        for (const [sourceArray, indices] of sourceArraysToProcess) {
            const sortedIndices = indices.sort((a, b) => b - a); // Descending order
            sortedIndices.forEach(idx => {
                if (idx < sourceArray.length) {
                    sourceArray.splice(idx, 1);
                }
            });
        }
        
        // Find new target index after removals (may have shifted if items were removed from same array)
        const newTargetIndex = targetArray.indexOf(targetItem);
        
        // Insert dropped items right after the target
        const insertPosition = newTargetIndex + 1;
        targetArray.splice(insertPosition, 0, ...droppedItems);
        
        // Update dropped items MetaData with grouping info
        droppedItems.forEach(droppedItem => {
            // Parse existing metadata and add/update grouping
            let metadata = {};
            try {
                metadata = JSON.parse(droppedItem.MetaData || '{}');
            } catch (e) {
                metadata = {};
            }
            metadata.grouping = {
                groupId: groupId,
                isGroupMaster: false
            };
            droppedItem.MetaData = JSON.stringify(metadata);
            //console.log('Grouped item with master:', groupId);
        });
        
        //console.log(`Grouped ${droppedItems.length} items under target with groupId: ${groupId}`);
        
        // Return grouping info for potential UI feedback
        return {
            groupId,
            targetItem,
            droppedItems,
            targetIndex: newTargetIndex
        };
    },
    
    // Get all unique source arrays that have selections
    getSelectedDataSources() {
        const sources = new Set();
        for (const selection of this.selections.values()) {
            sources.add(selection.sourceArray);
        }
        return Array.from(sources);
    },
    
    // Get selection summary grouped by data source
    getSelectionSummary() {
        const summary = new Map();
        for (const [selectionKey, selection] of this.selections) {
            if (!summary.has(selection.sourceArray)) {
                summary.set(selection.sourceArray, {
                    sourceArray: selection.sourceArray,
                    dragId: selection.dragId,
                    rowIndices: [],
                    count: 0
                });
            }
            const sourceSummary = summary.get(selection.sourceArray);
            sourceSummary.rowIndices.push(selection.rowIndex);
            sourceSummary.count++;
        }
        return summary;
    },
    
    // Check if selections are all from the same data source
    areSelectionsFromSameSource() {
        if (this.selections.size <= 1) return true;
        
        let firstSource = null;
        for (const selection of this.selections.values()) {
            if (firstSource === null) {
                firstSource = selection.sourceArray;
            } else if (firstSource !== selection.sourceArray) {
                return false;
            }
        }
        return true;
    },
    
    // Validate if the current selection can be dragged
    canStartDrag() {
        if (this.selections.size === 0) return false;
        
        // If multi-source drag is disabled, only allow same-source selections
        if (!this.allowMultiSourceDrag && !this.areSelectionsFromSameSource()) {
            return false;
        }
        
        return true;
    },
    
    // Mark all selected rows for deletion (used by Delete key)
    markSelectedForDeletion(Value = true) {
        // Mark all selected rows for deletion (used by Delete key)
        if (this.selections.size === 0) {
            //console.log('No selections to mark for deletion');
            return;
        }
        
        // Capture state for undo before marking for deletion
        if (Value && this.currentRouteKey) {
            const arraysToCapture = new Set();
            for (const selection of this.selections.values()) {
                arraysToCapture.add(selection.sourceArray);
            }
            undoRegistry.capture(Array.from(arraysToCapture), this.currentRouteKey, { type: 'deletion' });
        }
        
        let deletedCount = 0;
        for (const [selectionKey, selection] of this.selections) {
            const { rowIndex, sourceArray } = selection;
            if (sourceArray[rowIndex]) {
                const row = sourceArray[rowIndex];
                
                // Parse existing MetaData
                let metadata = {};
                if (row.MetaData) {
                    try {
                        metadata = typeof row.MetaData === 'string' ? JSON.parse(row.MetaData) : row.MetaData;
                    } catch (e) {
                        console.warn('Failed to parse MetaData:', e);
                    }
                }
                
                // Set or remove deletion flag
                if (Value) {
                    metadata.deletion = { marked: true };
                } else {
                    delete metadata.deletion;
                }
                
                // Save back to MetaData
                row.MetaData = Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null;
                
                deletedCount++;
            }
        }
        
        //console.log(`Marked ${deletedCount} selected rows for deletion = ${Value}`);
    },
    
    // Drag management methods
    startDrag(dataSourceArray, dragId) {
        // Validate if drag can be started
        if (!this.canStartDrag()) return false;
        
        // Check if we can drag with multiple data sources
        const selectionSummary = this.getSelectionSummary();
        const dataSources = this.getSelectedDataSources();
        this.findingDropTargets = true;
        this.dragSelectionSnapshot = Array.from(this.selections.values()).map(selection => ({
            rowIndex: selection.rowIndex,
            sourceArray: selection.sourceArray,
            dragId: selection.dragId
        }));
        
        // For compatibility, we'll use the first selection's info for dragSourceArray and dragId
        // but the actual drag logic will handle all sources
        this.dragSourceArray = dataSourceArray;
        this.dragId = dragId;
        this.currentDropTarget = null;
        
        // Increment version to trigger reactivity for drag state change
        this._version++;
        
        // Set up global mouse up and touch end listeners with proper binding
        this.handleGlobalMouseUp = this.handleGlobalMouseUp.bind(this);
        this.handleGlobalTouchEnd = this.handleGlobalTouchEnd.bind(this);
        document.addEventListener('mouseup', this.handleGlobalMouseUp);
        document.addEventListener('touchend', this.handleGlobalTouchEnd);
        document.addEventListener('touchcancel', this.handleGlobalTouchEnd);
        return true;
    },
    
    // Register drop target from a table
    registerDropTarget(tableData, dropTarget) {
        if (this.findingDropTargets) {
            this.currentDropTarget = dropTarget;
            this.dragTargetArray = tableData;
        }
    },
    
    // Clear drop target registration
    clearDropTargetRegistration(tableData) {
        if (this.dragTargetArray === tableData) {
            this.currentDropTarget = null;
        }
    },
    
    
    // Global mouse up handler for drag operations
    handleGlobalMouseUp(event) {
        if (!this.findingDropTargets) return;
        
        
        // Check if we have a valid drop target
        if (this.dragTargetArray && this.currentDropTarget && this.currentDropTarget.type) {
            const result = this.completeDrag(this.currentDropTarget);
        } else {
            // No valid drop target, cancel the drag
            this.stopDrag();
        }
    },
    
    // Global touch end handler for drag operations
    handleGlobalTouchEnd(event) {
        if (!this.findingDropTargets) return;
        
        // Check if we have a valid drop target
        if (this.dragTargetArray && this.currentDropTarget && this.currentDropTarget.type) {
            const result = this.completeDrag(this.currentDropTarget);
        } else {
            // No valid drop target, cancel the drag
            this.stopDrag();
        }
    },
    
    completeDrag(dropTarget) {
        //console.log('completeDrag called with:', dropTarget, 'findingDropTargets:', this.findingDropTargets, 'selections:', this.selections.size, 'dragTargetArray:', this.dragTargetArray);
        if (!this.findingDropTargets || this.selections.size === 0 || !this.dragTargetArray) {
            //console.log('completeDrag early exit - conditions not met');
            this.stopDrag();
            return false;
        }
        
        // Capture state before drag mutation for undo
        // Need to capture ALL arrays involved: both source arrays and target array
        if (this.currentRouteKey) {
            const arraysToCapture = new Set();
            
            // Add target array
            arraysToCapture.add(this.dragTargetArray);
            
            // Add all source arrays from selections
            for (const selection of this.selections.values()) {
                arraysToCapture.add(selection.sourceArray);
            }
            
            undoRegistry.capture(Array.from(arraysToCapture), this.currentRouteKey, { 
                type: 'drag',
                selectionState: tableRowSelectionState // Capture selection state with drag
            });
        }
        
        // Handle "onto" drop type - call groupSelectedItemsUnder directly
        if (dropTarget.type === 'onto') {
            //console.log('DROP ONTO detected! Calling groupSelectedItemsUnder...');
            const result = this.groupSelectedItemsUnder(
                dropTarget.targetIndex,
                this.dragTargetArray
            );
            
            if (result) {
                //console.log(`Grouped ${result.droppedItems.length} items under target with groupId: ${result.groupId}`);
                
                // Re-select the grouped items at their new positions
                this.clearAll(); // Clear old selections first
                
                // Grouped items are inserted right after the master (targetIndex + 1)
                const startIndex = result.targetIndex + 1;
                result.droppedItems.forEach((item, offset) => {
                    const newIndex = this.dragTargetArray.indexOf(item);
                    if (newIndex !== -1) {
                        this.addRow(newIndex, this.dragTargetArray, this.dragId);
                    }
                });
                
                //console.log(`Re-selected ${result.droppedItems.length} grouped items`);
            } else {
                console.warn('Grouping failed or no items to group');
                this.clearAll();
            }
            
            // Set timestamp to prevent outside click from clearing selection
            this.lastDragEndTime = Date.now();
            
            this.stopDrag();
            return true;
        }
        
        // If dropping between rows of the same group, capture the groupId to assign after moving.
        // The drop position is respected; group membership is updated after the move.
        let splitGroupId = null;
        if (dropTarget.type === 'between' && this.wouldSplitGroup(dropTarget.targetIndex, this.dragTargetArray)) {
            const rowBefore = dropTarget.targetIndex > 0 ? this.dragTargetArray[dropTarget.targetIndex - 1] : null;
            const rowAfter = dropTarget.targetIndex < this.dragTargetArray.length ? this.dragTargetArray[dropTarget.targetIndex] : null;
            const beforeGrouping = rowBefore ? this._getRowGrouping(dropTarget.targetIndex - 1, this.dragTargetArray) : null;
            const afterGrouping = rowAfter ? this._getRowGrouping(dropTarget.targetIndex, this.dragTargetArray) : null;
            splitGroupId = beforeGrouping?.groupId || afterGrouping?.groupId || null;
            // Fall through to normal move logic — drop position is preserved
        }
        
        // Check if "between" drop does NOT split a group - remove grouping from non-master rows
        if (dropTarget.type === 'between' && !this.wouldSplitGroup(dropTarget.targetIndex, this.dragTargetArray)) {
            //console.log('DROP BETWEEN does not split group - removing grouping from non-master rows...');
            
            // Remove grouping from all dragged rows that are NOT group masters
            for (const selection of this.selections.values()) {
                const { rowIndex, sourceArray } = selection;
                const grouping = this._getRowGrouping(rowIndex, sourceArray);
                
                // Only remove grouping if row is in a group but NOT a master
                if (grouping && !grouping.isGroupMaster) {
                    // Check if the master of this child is also in the selection
                    const masterIndex = this._findGroupMasterIndex(grouping.groupId, sourceArray);
                    const masterIsSelected = masterIndex !== -1 && this.hasRow(sourceArray, masterIndex);
                    
                    // Only ungroup if the master is NOT being dragged with the child
                    if (!masterIsSelected) {
                        const item = sourceArray[rowIndex];
                        if (item) {
                            // Parse existing metadata and remove only grouping
                            let metadata = {};
                            try {
                                metadata = JSON.parse(item.MetaData || '{}');
                            } catch (e) {
                                metadata = {};
                            }
                            delete metadata.grouping;
                            item.MetaData = Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : '';
                            //console.log(`Removed grouping from row ${rowIndex} (between drop, master not selected)`);
                        }
                    }
                }
            }
        }
        
        // Group selections by source array
        const selectionsBySource = this.getSelectionSummary();
        
        if (selectionsBySource.size === 0) {
            //console.log('No selections found');
            this.stopDrag();
            return false;
        }
        
        // Calculate insertion position
        let insertPosition;
        //console.log('dropTarget.type:', dropTarget.type);
        if (dropTarget.type === 'header') {
            insertPosition = 0;
        } else if (dropTarget.type === 'between') {
            insertPosition = dropTarget.targetIndex;
        } else {
            //console.log('Invalid dropTarget.type:', dropTarget.type);
            this.stopDrag();
            return false;
        }
        
        // Perform atomic move operation to prevent reactivity issues
        try {
            let totalRowsInserted = 0;
            const movedRows = []; // Track all moved row objects to re-select them after move
            
            // Process each source array
            for (const [sourceArray, sourceInfo] of selectionsBySource) {
                //console.log(`Processing source with ${sourceInfo.count} rows from ${sourceInfo.dragId || 'unknown'}`);
                
                // Sort row indices in ascending order to preserve original order
                const sortedIndicesAsc = sourceInfo.rowIndices.sort((a, b) => a - b);
                // Sort row indices in reverse order (highest first) for safe removal
                const sortedIndicesDesc = [...sortedIndicesAsc].reverse();
                
                // Extract row data BEFORE removal using ascending order to preserve original sequence
                const rowsData = sortedIndicesAsc.map(index => sourceArray[index]).filter(row => row !== undefined);
                
                // Track these rows for re-selection after move
                movedRows.push(...rowsData);
                
                // Clear AppData from all moved rows (drag operations reset analytics state)
                rowsData.forEach(row => {
                    if (row) {
                        delete row.AppData;
                    }
                });
                
                if (sourceArray === this.dragTargetArray) {
                    // Same array: reorder rows
                    //console.log('Same array reorder - insertPosition:', insertPosition + totalRowsInserted);
                    
                    let adjustedInsertPosition = insertPosition + totalRowsInserted;
                    
                    // Remove rows (in reverse order to maintain indices)
                    sortedIndicesDesc.forEach(index => {
                        if (index < sourceArray.length) {
                            sourceArray.splice(index, 1);
                            // Adjust insertion position if we removed rows before it
                            if (index < adjustedInsertPosition) {
                                adjustedInsertPosition--;
                            }
                        }
                    });
                    
                    // Insert at new position
                    if (adjustedInsertPosition >= 0 && adjustedInsertPosition <= sourceArray.length) {
                        sourceArray.splice(adjustedInsertPosition, 0, ...rowsData);
                    }
                    
                    //totalRowsInserted += rowsData.length;
                } else {
                    // Different arrays: move rows to target
                    //console.log('Different arrays move - from:', sourceArray.length, 'to:', this.dragTargetArray.length, 'insertPosition:', insertPosition + totalRowsInserted);
                    
                    // Remove from source array (in reverse order to maintain indices)
                    sortedIndicesDesc.forEach(index => {
                        if (index < sourceArray.length) {
                            sourceArray.splice(index, 1);
                        }
                    });
                    
                    // Insert into target array at adjusted position
                    const adjustedInsertPosition = insertPosition + totalRowsInserted;
                    if (adjustedInsertPosition >= 0 && adjustedInsertPosition <= this.dragTargetArray.length) {
                        this.dragTargetArray.splice(adjustedInsertPosition, 0, ...rowsData);
                    }
                    
                    totalRowsInserted += rowsData.length;
                    //console.log('After move - from:', sourceArray.length, 'to:', this.dragTargetArray.length);
                }
            }
            
            //console.log(`Total rows moved: ${totalRowsInserted}`);
            
            // Update selections to reflect new positions after move
            this.clearAll(); // Clear old selections first
            
            // Re-select moved rows at their new positions in the target array
            movedRows.forEach(movedRow => {
                const newIndex = this.dragTargetArray.indexOf(movedRow);
                if (newIndex !== -1) {
                    this.addRow(newIndex, this.dragTargetArray, this.dragId);
                }
            });
            
            //console.log(`Re-selected ${movedRows.length} moved rows at their new positions`);
            
            // If dropped into a group, assign moved rows to that group as children
            if (splitGroupId) {
                movedRows.forEach(row => {
                    let metadata = {};
                    try { metadata = JSON.parse(row.MetaData || '{}'); } catch(e) { metadata = {}; }
                    const grouping = metadata.grouping;
                    // Don't reassign if this row is already the master of the target group
                    if (grouping && grouping.isGroupMaster && grouping.groupId === splitGroupId) return;
                    // Don't reassign a master of a different group (preserve its children's group)
                    if (grouping && grouping.isGroupMaster && grouping.groupId !== splitGroupId) return;
                    // Assign as child if not already in this group
                    if (!grouping || grouping.groupId !== splitGroupId) {
                        metadata.grouping = { groupId: splitGroupId, isGroupMaster: false };
                        row.MetaData = JSON.stringify(metadata);
                    }
                });
            }
        } catch (error) {
            console.error('Error during drag operation:', error);
            this.stopDrag();
            return false;
        }
        
        // Clean up any group masters that no longer have children
        this._cleanupOrphanedGroupMasters(this.dragTargetArray);
        
        // Set timestamp to prevent outside click from clearing selection
        this.lastDragEndTime = Date.now();
        
        // Clear drag state (but keep selections intact now)
        this.stopDrag(true);
        return true;
    },
    
    // --- External clipboard interop helpers ---

    registerTable(dragId, instance) {
        if (!dragId) return;
        if (!this.activeTables.has(dragId)) this.activeTables.set(dragId, []);
        const arr = this.activeTables.get(dragId);
        if (!arr.includes(instance)) arr.push(instance);
    },

    unregisterTable(dragId, instance) {
        if (!dragId) return;
        const arr = this.activeTables.get(dragId);
        if (!arr) return;
        const idx = arr.indexOf(instance);
        if (idx !== -1) arr.splice(idx, 1);
        if (arr.length === 0) this.activeTables.delete(dragId);
    },

    // Load externally-parsed rows into internal clipboard mode so the user can
    // choose a drop target via the normal Ctrl+V / drop-target UI.
    loadExternalClipboard(items, dragId) {
        if (!items || items.length === 0) return false;

        this.clipboardItems = items; // each item is { clone: rowObject, original: null }
        this.clipboardMode = 'copy';
        this.clipboardSourceDragId = dragId;
        this.clipboardSourceRoute = null; // external — no source route to undo on
        this.findingDropTargets = true;
        this.dragId = dragId;
        this.dragTargetArray = null;
        this.currentDropTarget = null;
        this._version++;

        this._handleClipboardKeydown = this._onClipboardKeydown.bind(this);
        document.addEventListener('keydown', this._handleClipboardKeydown);
        return true;
    },

    stopDrag(preserveDeletionMarkings = false) {
        this.findingDropTargets = false;
        this.dragSourceArray = null;
        this.dragTargetArray = null;
        this.dragId = null;
        this.currentDropTarget = null;
        this.dragSelectionSnapshot = null;
        this.mouseX = null;
        this.mouseY = null;
        // Keep drag state registration managed by component lifecycle
        
        // Increment version to trigger reactivity for drag state change
        this._version++;
        
        // Remove global mouse up and touch end listeners
        document.removeEventListener('mouseup', this.handleGlobalMouseUp);
        document.removeEventListener('touchend', this.handleGlobalTouchEnd);
        document.removeEventListener('touchcancel', this.handleGlobalTouchEnd);
    }
});

// Register selection state with undo system
setTableRowSelectionState(tableRowSelectionState);

export const TableComponent = {
    name: 'TableComponent',
    components: { LoadingBarComponent, ViewChangeComponent },
    inject: ['appContext', '$modal'],
    props: {
        key: {
            type: String,
            default: 'defaultkey'
        },
        theme: {
            type: String,
            default: ''
        },
        data: {
            type: Array,
            default: () => []
        },
        columns: {
            type: Array,
            required: true
        },
        isLoading: {
            type: Boolean,
            default: false
        },
        isAnalyzing: {
            type: Boolean,
            default: false
        },
        loadingProgress: {
            type: Number,
            default: -1
        },
        error: {
            type: String,
            default: null
        },
        title: {
            type: String,
            default: 'Data Table'
        },
        showRefresh: {
            type: Boolean,
            default: true
        },
        showSearch: {
            type: Boolean,
            default: false
        },
        emptyMessage: {
            type: String,
            default: 'No data available'
        },
        draggable: {
            type: Boolean,
            default: false
        },
        newRow: {
            type: Boolean,
            default: false
        },
        showNewRowButton: {
            type: Boolean,
            default: false
        },
        showFooter: {
            type: Boolean,
            default: true
        },
        showHeader: {
            type: Boolean,
            default: true
        },
        dragId: {
            type: String,
            default: null
        },
        loadingMessage: {
            type: String,
            default: 'Loading data...'
        },
        originalData: {
            type: Array,
            required: true
        },
        rowKey: {
            type: String,
            default: null
        },
        hamburgerMenuComponent: {
            type: Object,
            default: null
        },
        hideColumns: {
            type: Array,
            default: () => []
        },
        // Global sortable prop - can be overridden per-column using column.sortable
        // Example column configuration:
        // { key: 'name', label: 'Name', sortable: true }   - Always sortable
        // { key: 'id', label: 'ID', sortable: false }      - Never sortable  
        // { key: 'date', label: 'Date' }                   - Uses table's sortable prop
        sortable: {
            type: Boolean,
            default: false
        },
        hideGroupMembers: {
            type: Boolean,
            default: false
        },
        groupVisibilityOverride: {
            // 'open' = expand all groups, 'closed' = collapse all groups, null = no override
            type: String,
            default: null
        },
        syncSearchWithUrl: {
            type: Boolean,
            default: true
        },
        containerPath: {
            type: String,
            default: ''
        },
        navigateToPath: {
            type: Function,
            default: null
        },
        viewModes: {
            type: Array,
            default: null
        },
        hideRowsOnSearch: {
            type: Boolean,
            default: true
        },
        allowDetails: {
            type: Boolean,
            default: false
        },
        forceDetails: {
            type: Boolean,
            default: false
        },
        rowDetailsVisible: {
            type: Function,
            default: null
        },
        parentSearchValue: {
            type: String,
            default: ''
        },
        allowDropOnto: {
            type: Boolean,
            default: false
        },
        showSelectionBubble: {
            type: Boolean,
            default: false
        },
        defaultSortColumn: {
            type: [String, Array],
            default: null
        },
        defaultSortDirection: {
            type: String,
            default: 'asc',
            validator: (value) => ['asc', 'desc'].includes(String(value || '').toLowerCase())
        },
        dragLabel: {
            type: String,
            default: null
        }
    },
    emits: ['refresh', 'cell-edit', 'new-row', 'inner-table-dirty', 'show-hamburger-menu', 'search'],
    setup(props, { emit }) {
        // Initialize search composable
        const search = useSearch({
            formatValue: null, // Will be provided via this.formatCellValue in methods
            syncWithUrl: props.syncSearchWithUrl,
            navigationRegistry: NavigationRegistry,
            containerPath: props.containerPath,
            appContext: Vue.inject('appContext')
        });

        // Return search properties and methods to be available in component
        return {
            search
        };
    },
    data() {
        return {
            dirtyCells: {},
            allowSaveEvent: false,
            nestedTableDirtyCells: {}, // Track dirty state for nested tables by [row][col]
            sortColumn: null, // Current sort column key
            sortDirection: 'asc', // Current sort direction: 'asc' or 'desc'
            isUsingDefaultSort: true,
            expandedRows: new Set(), // Track which rows are expanded for details
            overriddenGroups: new Set(), // Groups deviating from the current visibility default
            hasUndoCaptured: false, // Track if first edit has been captured for undo
            lastEditTimestamp: null, // Track last edit time for 5-second idle detection
            _undoIdleTimer: null, // Timer to discard no-op snapshot after idle period
            clickState: {
                isMouseDown: false,
                startRowIndex: null,
                startTime: null,
                startX: null,
                startY: null,
                longClickTimer: null,
                hasMoved: false,
                shiftKey: false, // Track shift key during mousedown for shift-select
                // Multi-selection state
                isMultiSelecting: false,
                lastHoveredRowIndex: null,
                // Shift-select anchor: the last row explicitly selected without shift
                lastAnchorRowIndex: null,
                // Touch-specific state for table tracking
                lastTouchTable: null // Track which table element finger was last over
            },
            dropTarget: {
                type: null, // 'between-rows', 'header', 'footer'
                position: null, // row index for between-rows, null for header/footer
                isAbove: false // for between-rows, whether drop is above the row
            },
            isMouseInTable: false,
            lastKnownMouseX: null,
            lastKnownMouseY: null,
            mouseMoveCounter: 0,
            hiddenColumns: [], // Reactive property for dynamically hiding columns (internal use only)
            showStickyHeader: false, // Controls visibility of sticky header clone
            stickyActive: false, // Controls fixed positioning of sticky wrapper
            stickyTop: 0,
            stickyLeft: 0,
            stickyWidth: 0,
            stickySpacerHeight: 0, // Measured height of wrapper before clone is added
            stickyColumnWidths: [], // Store actual column widths from original table
            hideRowsOnSearchLocal: this.hideRowsOnSearch, // Runtime toggle for hide-rows-on-search behavior
            theadActive: false // Mobile: tap-to-show column buttons toggle
        };
    },
    watch: {

        // Watch for changes to originalData prop and recompare dirty state
        originalData: {
            handler() {
                if (!this.hasEditableColumns) return;
                this.$nextTick(() => {
                    this.compareAllCellsDirty();
                });
            },
            deep: true
        },
        allowSaveEvent(val) {
            // Emit to parent if dirty state changes
            this.$emit('inner-table-dirty', val);
        },
        data: {
            handler() {
                if (!this.hasEditableColumns) return;
                this.$nextTick(() => {
                    this.updateAllEditableCells();
                    this.compareAllCellsDirty();
                });
            },
            deep: true,
            flush: 'post' // Ensure DOM updates happen after data changes
        },
        isLoading(val) {
            if (!this.hasEditableColumns) return;
            // When loading state changes, update cells and compare dirty
            this.$nextTick(() => {
                this.updateAllEditableCells();
                this.compareAllCellsDirty();
            });
        },
        visibleRows() {
            this.$nextTick(() => {
                this.updateAllEditableCells();
            });
        },
        draggable() {
            if (!this.hasEditableColumns) return;
            this.$nextTick(() => {
                this.updateAllEditableCells();
                this.compareAllCellsDirty();
            });
        },
        groupVisibilityOverride(val) {
            if (!val) return;
            const allGroupIds = this.data
                .map(row => tableRowSelectionState._getRowMetadata(row)?.grouping)
                .filter(g => g?.isGroupMaster)
                .map(g => g.groupId);
            if (val === 'open') {
                // Open all: in view mode, populate overrides (exceptions = open); in edit mode, clear them
                this.overriddenGroups = this.hideGroupMembers ? new Set(allGroupIds) : new Set();
            } else if (val === 'closed') {
                // Close all: in view mode, clear overrides; in edit mode, populate them
                this.overriddenGroups = this.hideGroupMembers ? new Set() : new Set(allGroupIds);
            }
        },
        hideGroupMembers() {
            // Reset per-group overrides when the default visibility mode changes
            this.overriddenGroups = new Set();
        },
        columns: {
            handler() {
                this.$nextTick(() => {
                    this.applyDefaultSortColumn();
                    this.updateAllEditableCells();
                });
            },
            deep: true
        },
        defaultSortColumn() {
            this.applyDefaultSortColumn({ force: true });
        },
        defaultSortDirection() {
            if (this.isUsingDefaultSort) {
                this.sortDirection = this.getNormalizedDefaultSortDirection();
            }
        },
        // Clear drop targets when drag ends (handles touch where mouseleave doesn't fire)
        isDraggingGlobally(isActive, wasActive) {
            if (wasActive && !isActive) {
                // Drag just ended, clear any lingering drop target highlights
                this.clearDropTarget();
            }
        }
    },
    computed: {
        // Watch for global drag state to clear drop targets when drag ends
        // Access this computed property in template or via watcher to trigger reactivity
        isDraggingGlobally() {
            // Access _version to ensure reactivity
            tableRowSelectionState._version;
            return tableRowSelectionState.findingDropTargets;
        },
        // True when this is the first-mounted draggable table and the user has not yet decided
        // whether to grant clipboard-read permission. Shows the in-app permission request prompt.
        showClipboardPermissionPrompt() {
            tableRowSelectionState._version;
            if (!this.draggable) return false;
            if (tableRowSelectionState.clipboardReadPermission !== 'prompt') return false;
            if (tableRowSelectionState.clipboardPromptDismissed) return false;
            // Show the prompt only on the first registered table across all drag groups.
            for (const instances of tableRowSelectionState.activeTables.values()) {
                return instances[0] === this;
            }
            return false;
        },
        selectedRowCount() {
            // Access _version to create reactive dependency
            tableRowSelectionState._version;
            return tableRowSelectionState.getTotalSelectionCount();
        },
        shouldShowSelectionBubble() {
            // Only show bubble if:
            // 1. showSelectionBubble prop is enabled
            // 2. There are selections globally
            // 3. This table owns the first global selection
            // 4. This table contains at least one selected row that is currently visible
            // 4. A drag is not currently happening
            // 5. The table has editable columns (edit mode is enabled)
            if (!this.showSelectionBubble || this.selectedRowCount === 0 || !this.hasEditableColumns) {
                return false;
            }
            
            // Check if an actual drag is happening (clipboard mode also sets findingDropTargets but should still show)
            if (tableRowSelectionState.findingDropTargets && !tableRowSelectionState.clipboardMode) {
                return false;
            }

            const firstSelection = tableRowSelectionState.selections.values().next().value;
            if (!firstSelection || firstSelection.sourceArray !== this.data) {
                return false;
            }

            return this.firstSelectedVisibleRowIndex !== -1;
        },
        isInClipboardMode() {
            tableRowSelectionState._version;
            return !!tableRowSelectionState.clipboardMode;
        },
        hasConsecutiveSelection() {
            // Check if selected rows in this table form a consecutive sequence
            const selectedRows = this.getSelectedRows();
            if (selectedRows.length === 0) return false;
            
            // Check if ALL selections globally are from this table's data array
            // If any selection is from a different array, return false
            for (const selection of tableRowSelectionState.selections.values()) {
                if (selection.sourceArray !== this.data) {
                    return false; // Selection exists in a different array
                }
            }
            
            // If only one row selected in this table, it's consecutive
            if (selectedRows.length === 1) return true;
            
            // Sort indices
            const indices = selectedRows.map(r => r.index).sort((a, b) => a - b);
            
            // Check for gaps in the sequence
            for (let i = 1; i < indices.length; i++) {
                if (indices[i] !== indices[i - 1] + 1) {
                    return false; // Gap found
                }
            }
            return true; // All consecutive
        },
        areAllSelectedMarkedForDeletion() {
            // Check if all selected rows across all tables are marked for deletion
            const allSelectedRows = tableRowSelectionState.getAllSelectedRows();
            if (allSelectedRows.length === 0) return false;
            
            return allSelectedRows.every(({ row }) => {
                if (!row) return false;
                const metadata = tableRowSelectionState._getRowMetadata(row);
                return metadata?.deletion?.marked === true;
            });
        },
        selectedGroupMasterIds() {
            // Collect unique group IDs for selected rows that are group masters in this table
            const groupIds = new Set();
            const selectedRows = this.getSelectedRows();

            selectedRows.forEach(({ data }) => {
                if (!data) return;
                const metadata = tableRowSelectionState._getRowMetadata(data);
                const grouping = metadata?.grouping;
                if (grouping?.isGroupMaster && grouping.groupId) {
                    groupIds.add(grouping.groupId);
                }
            });

            return Array.from(groupIds);
        },
        hasSelectedGroupMasters() {
            return this.selectedGroupMasterIds.length > 0;
        },
        anySelectedGroupCollapsed() {
            return this.selectedGroupMasterIds.some(groupId => this.isGroupMembersHiddenById(groupId));
        },
        shouldShowDragFollower() {
            tableRowSelectionState._version;
            return (tableRowSelectionState.findingDropTargets || tableRowSelectionState.clipboardMode) &&
                   tableRowSelectionState.mouseX !== null && 
                   tableRowSelectionState.mouseY !== null;
        },
        dragFollowerText() {
            tableRowSelectionState._version;
            const count = tableRowSelectionState.clipboardMode 
                ? tableRowSelectionState.clipboardItems.length
                : tableRowSelectionState.selections.size;
            return `${tableRowSelectionState.clipboardMode === "copy" ? 'add ' : 'move '} ${count} row${count !== 1 ? 's' : ''}`;
        },
        dragFollowerStyle() {
            tableRowSelectionState._version;
            if (!this.shouldShowDragFollower) return { display: 'none' };
            return {
                position: 'fixed',
                left: (tableRowSelectionState.mouseX) + 'px',
                top: (tableRowSelectionState.mouseY) + 'px'
            };
        },
        canCreateGroupFromSelection() {
            if (!this.newRow || this.firstSelectedVisibleRowIndex === -1) return false;

            const allSelectedRows = tableRowSelectionState.getAllSelectedRows();
            if (allSelectedRows.length === 0) return false;

            // Only allow grouping when every selected row is currently ungrouped.
            return allSelectedRows.every(({ row, index, sourceArray }) => {
                if (!row || !sourceArray) return false;
                return !tableRowSelectionState._getRowGrouping(index, sourceArray);
            });
        },
        groupToggleSymbol() {
            // If any selected group is collapsed, show expand-all action. Otherwise show collapse-all action.
            return this.anySelectedGroupCollapsed ? 'expand' : 'compress';
        },
        groupToggleTitle() {
            return this.anySelectedGroupCollapsed ? 'Show Selected Group(s)' : 'Hide Selected Group(s)';
        },
        firstSelectedVisibleRowIndex() {
            // Find the chronologically first selected row (from global selection state)
            // that belongs to this table and is currently visible.
            tableRowSelectionState._version;
            if (tableRowSelectionState.selections.size === 0 || this.visibleRows.length === 0) {
                return -1;
            }

            const visibleIndexByRowIndex = new Map();
            for (let i = 0; i < this.visibleRows.length; i++) {
                visibleIndexByRowIndex.set(this.visibleRows[i].idx, i);
            }

            for (const selection of tableRowSelectionState.selections.values()) {
                if (selection.sourceArray !== this.data) continue;

                const visibleIdx = visibleIndexByRowIndex.get(selection.rowIndex);
                if (visibleIdx !== undefined) {
                    return visibleIdx;
                }
            }

            return -1;
        },
        selectionBubbleStyle() {
            // Calculate position for the selection bubble based on the first selected row
            if (this.selectedRowCount === 0 || this.firstSelectedVisibleRowIndex === -1) {
                return { display: 'none' };
            }
            
            // Find the main data table (not the sticky header table)
            // Use .table-wrapper to ensure we get the main table, not the sticky header clone
            const table = this.$el?.querySelector('.table-wrapper table');
            if (!table) return { display: 'none' };
            
            const targetRow = table.querySelector(`tbody tr[data-visible-idx="${this.firstSelectedVisibleRowIndex}"]`);
            
            if (!targetRow) return { display: 'none' };
            
            // Get the row's position relative to the table container
            const tableRect = table.getBoundingClientRect();
            const rowRect = targetRow.getBoundingClientRect();
            
            return {
                display: 'flex',
                top: (rowRect.top - tableRect.top + rowRect.height / 2) + 'px'
            };
        },
        activeSearchValue() {
            // Use parentSearchValue if provided, otherwise use composable searchValue
            return this.parentSearchValue || this.search.searchValue.value;
        },
        showSaveButton() {
            // True if any editable cell or add row button is present
            const hasEditable = this.columns.some(col => col.editable);
            const hasAddRow = !!this.newRow;
            return hasEditable || hasAddRow;
        },
        hasEditableColumns() {
            // True if any column is editable
            return this.columns.some(col => col.editable);
        },
        hideSet() {
            // Hide columns from hideColumns prop, hiddenColumns reactive data, and always hide 'AppData', 'EditHistory', and 'MetaData'
            return new Set([...(this.hideColumns || []), 'AppData', 'EditHistory', 'MetaData', ...(this.hiddenColumns || [])]);
        },
        originalDataByKey() {
            if (!this.rowKey || !Array.isArray(this.originalData)) return null;
            const map = new Map();
            this.originalData.forEach(row => {
                const keyVal = this._getRowKeyValue(row);
                if (keyVal !== undefined && keyVal !== null && keyVal !== '') {
                    map.set(String(keyVal), row);
                }
            });
            return map;
        },
        mainTableColumns() {
            // find columns marked with a colspan property and eliminate the extra columns following them
            // e.g. if column 2 has colspan: 3, then columns 3 and 4 are removed
            // This allows for dynamic column spanning in the main table view
            const columnsClipped = [];
            let i = 0;
            while (i < this.columns.length) {
                const col = this.columns[i];
                columnsClipped.push(col);
                if (col.colspan) {
                    i += col.colspan;
                } else {
                    i++;
                }
            }

            // Filter out columns marked as details-only
            return columnsClipped.filter(column => !column.details);
        },
        visibleColumns() {
            // Get only columns not in hideSet
            return this.columns.filter(column => !this.hideSet.has(column.key) && !this.detailsColumns.includes(column));
        },
        // Columns to serialize when writing to the OS clipboard (visible, non-action columns)
        clipboardExportColumns() {
            return this.visibleColumns.filter(col => !col.key.startsWith('_'));
        },
        // Columns eligible to receive pasted data (visible, non-action, editable)
        pasteableColumns() {
            return this.visibleColumns.filter(col => !col.key.startsWith('_') && col.editable);
        },
        detailsColumns() {
            // Get only columns marked for details display
            return this.columns.filter(column => column.details);
        },
        visibleRows() {
            // Filter rows based on search value but keep all rows including marked for deletion
            if (!Array.isArray(this.data)) return [];
            
            let filteredData = this.data
                .map((row, idx) => ({ row, idx }))
                .filter(({ row }) => row); // Only filter out null/undefined rows

            // Hide group children when the default is closed or any group has been overridden
            if (this.hideGroupMembers || this.overriddenGroups.size > 0) {
                filteredData = filteredData.filter(({ row, idx }) => {
                    const metadata = tableRowSelectionState._getRowMetadata(row);
                    const grouping = metadata?.grouping;
                    if (!grouping || grouping.isGroupMaster) return true;
                    return !this.isGroupMembersHiddenById(grouping.groupId);
                });
            }

            // Apply search filter if activeSearchValue is provided and hideRowsOnSearch is enabled
            if (this.activeSearchValue && this.activeSearchValue.trim() && this.hideRowsOnSearchLocal) {
                const searchTerm = this.activeSearchValue.toLowerCase().trim();
                // Split search term into multiple words for partial matching
                const searchWords = searchTerm.split(/\s+/).filter(word => word.length > 0);
                
                filteredData = filteredData.filter(({ row }) => {
                    if (!row) return false;
                    // Only search visible columns (exclude hidden columns)
                    const visibleColumns = this.columns.filter(column => !this.hideSet.has(column.key));
                    
                    // All search words must match somewhere in the row (AND logic)
                    return searchWords.every(word => 
                        visibleColumns.some(column => {
                            const value = row[column.key];
                            // Skip null/undefined values to prevent matching "undefined" or "null" strings
                            return value != null && String(value).toLowerCase().includes(word);
                        })
                    );
                });
            }

            const sortCriteria = this.isUsingDefaultSort
                ? this.getDefaultSortCriteria()
                : this.getCurrentSortCriteria();

            if (sortCriteria.length > 0) {
                filteredData.sort((a, b) => {
                    for (const criterion of sortCriteria) {
                        const comparison = this.compareRowsByColumn(a.row, b.row, criterion.column, criterion.direction);
                        if (comparison !== 0) return comparison;
                    }
                    return 0;
                });
            }

            return filteredData;
        },
        
        canUndo() {
            if (!undoRegistry.currentRouteKey) return false;
            const stacks = undoRegistry.undoStacksByRoute.get(undoRegistry.currentRouteKey);
            return stacks && stacks.undoStack.length > 0;
        },
        
        canRedo() {
            if (!undoRegistry.currentRouteKey) return false;
            const stacks = undoRegistry.undoStacksByRoute.get(undoRegistry.currentRouteKey);
            return stacks && stacks.redoStack.length > 0;
        },
        
        // Helper to get current route key without query params
        currentRouteKey() {
            return this.appContext?.currentPath?.split('?')[0] || null;
        }
    },
    mounted() {
        this.applyDefaultSortColumn();

        // Register route with undo system and tableRowSelectionState
        // Only top-level tables (with showHeader=true) should set the active route
        // Nested tables should not override the global route key
        if (this.appContext?.currentPath && this.showHeader) {
            const routeKey = this.appContext.currentPath.split('?')[0]; // Remove query params
            undoRegistry.setActiveRoute(routeKey);
            tableRowSelectionState.setActiveRoute(routeKey);
        }
        
        // Initialize search from URL and setup watcher if syncSearchWithUrl is enabled
        this.search.initializeFromUrl();
        this.search.setupUrlWatcher();
        
        this.$nextTick(() => {
            this.updateAllEditableCells();
            this.compareAllCellsDirty();
        });
        
        // Listen for clicks outside details area to close expanded details
        document.addEventListener('click', this.handleOutsideClick);
        // Listen for keyboard shortcuts (Escape, Delete)
        document.addEventListener('keydown', this.handleEscapeKey);

        // Register draggable tables and set up external clipboard detection
        if (this.draggable) {
            tableRowSelectionState.registerTable(this.dragId, this);
            this._handleExternalPaste = this._handleExternalPaste.bind(this);
            this._handleVisibilityChange = this._handleVisibilityChange.bind(this);
            document.addEventListener('paste', this._handleExternalPaste);
            document.addEventListener('visibilitychange', this._handleVisibilityChange);
            window.addEventListener('focus', this._handleVisibilityChange);
            // Non-intrusively check clipboard-read permission on first draggable mount.
            if (tableRowSelectionState.clipboardReadPermission === null) {
                tableRowSelectionState.checkClipboardPermission();
            }
            // Check existing clipboard content on mount (e.g. user already copied from Excel)
            this.$nextTick(() => this._readAndProcessExternalClipboard());
        }
        
        // Set up sticky header positioning (only for tables with showHeader enabled)
        // Nested tables with showHeader=false don't need sticky headers
        if (this.showHeader) {
            this._stickyHeader = useStickyHeader({
                getStickyEl: () => this.$el?.querySelector('.sticky-header-wrapper'),
                // .sticky-header-spacer sits in-flow at exactly the top of the content-header div
                // and its position is invariant: when sticky is inactive the spacer is 0-height and
                // the wrapper follows it; when sticky is active the spacer grows to the wrapper's
                // former height, keeping spacer.top at the same viewport position in both states.
                getAnchorEl: () => this.$el?.querySelector('.sticky-header-spacer'),
                getContainerEl: () => [
                    this.$el?.querySelector('.table-wrapper'),
                    this.$el?.closest('.container'),
                ].filter(Boolean),
                getIsActive: () => this.stickyActive,
                canActivate: () => {
                    const tableWrapper = this.$el?.querySelector('.table-wrapper');
                    return !(tableWrapper && tableWrapper.scrollWidth > tableWrapper.clientWidth);
                },
                onActivate: (navBottom) => {
                    // Measure spacer height only on first activation (before thead clone is added)
                    if (!this.stickyActive) {
                        const wrapper = this.$el?.querySelector('.sticky-header-wrapper');
                        this.stickySpacerHeight = wrapper ? wrapper.offsetHeight : 0;
                    }
                    // Re-measure column widths on every tick (table may resize)
                    const thead = this.$el?.querySelector('.table-wrapper thead');
                    if (thead) {
                        this.stickyColumnWidths = Array.from(thead.querySelectorAll('th'))
                            .map(th => th.getBoundingClientRect().width);
                    }
                    // Update position
                    const tableWrapper = this.$el?.querySelector('.table-wrapper');
                    const rect = tableWrapper ? tableWrapper.getBoundingClientRect() : this.$el?.getBoundingClientRect();
                    this.stickyActive = true;
                    this.showStickyHeader = true;
                    this.stickyTop = navBottom;
                    this.stickyLeft = rect ? rect.left : 0;
                    this.stickyWidth = rect ? rect.width : 0;
                },
                onDeactivate: () => {
                    this.stickyActive = false;
                    this.showStickyHeader = false;
                },
            });
            this._stickyHeader.setup();
        }

        // Mobile: collapse thead column buttons on scroll
        this._theadActiveScrollEl = document.querySelector('#app-content');
        if (this._theadActiveScrollEl) {
            this._theadActiveScrollFn = () => { this.theadActive = false; };
            this._theadActiveScrollEl.addEventListener('scroll', this._theadActiveScrollFn, { passive: true });
        }
    },
    beforeUnmount() {
        document.removeEventListener('click', this.handleOutsideClick);
        document.removeEventListener('keydown', this.handleEscapeKey);

        // Deregister from external clipboard system
        if (this.draggable) {
            tableRowSelectionState.unregisterTable(this.dragId, this);
            if (this._handleExternalPaste) document.removeEventListener('paste', this._handleExternalPaste);
            if (this._handleVisibilityChange) {
                document.removeEventListener('visibilitychange', this._handleVisibilityChange);
                window.removeEventListener('focus', this._handleVisibilityChange);
            }
        }

        // Clean up any active click state
        this.resetClickState();
        
        // Clean up sticky header scroll/resize listeners
        this._stickyHeader?.teardown();

        // Clean up thead active scroll listener
        if (this._theadActiveScrollEl && this._theadActiveScrollFn) {
            this._theadActiveScrollEl.removeEventListener('scroll', this._theadActiveScrollFn);
        }
    },
    methods: {
        // Universal autoColor method
        getAutoColorClass(value) {
            return getAutoColorClass(value);
        },

        handleRefresh() {
            // Capture state before discarding changes (when allowSaveEvent is true)
            if (this.allowSaveEvent && undoRegistry.currentRouteKey) {
                undoRegistry.capture(this.data, undoRegistry.currentRouteKey, { type: 'discard' });
            }
            
            this.$emit('refresh');
            // Clear hidden columns on refresh
            this.hiddenColumns = [];
            // Also clear dirty state for nested tables on refresh
            this.nestedTableDirtyCells = {};
        },

        // Selection helper methods
        isRowSelected(rowIndex) {
            // Access _version to create reactive dependency
            tableRowSelectionState._version;
            return tableRowSelectionState.hasRow(this.data, rowIndex);
        },

        isRowDragging(rowIndex) {
            if (!tableRowSelectionState.findingDropTargets) return false;
            if (!tableRowSelectionState.hasRow(this.data, rowIndex)) return false;
            // During clipboard mode, any selected row is a clipboard source
            if (tableRowSelectionState.clipboardMode) return true;
            // Regular drag: only rows in the source array get the dragging style
            return tableRowSelectionState.dragSourceArray === this.data;
        },

        isRowAnalyzing(rowIndex) {
            // Check if this row is currently being analyzed
            const row = this.data[rowIndex];
            return row && row.AppData && row.AppData._analyzing === true;
        },

        isRowInGroup(rowIndex) {
            return tableRowSelectionState.isRowInGroup(rowIndex, this.data);
        },

        isRowGroupMaster(rowIndex) {
            return tableRowSelectionState.isRowGroupMaster(rowIndex, this.data);
        },

        isRowMarkedForDeletion(row) {
            if (!row) return false;
            const metadata = tableRowSelectionState._getRowMetadata(row);
            return metadata?.deletion?.marked === true;
        },

        getRowMetadataClass(row) {
            if (!row) return '';
            const metadata = tableRowSelectionState._getRowMetadata(row);
            return metadata?.highlight?.class || '';
        },

        wouldSplitGroup(insertIndex) {
            return tableRowSelectionState.wouldSplitGroup(insertIndex, this.data);
        },

        getSelectedRows() {
            return tableRowSelectionState.getSelectedRows(this.data);
        },

        getSelectedRowIndices() {
            return tableRowSelectionState.getSelectedRowIndices(this.data);
        },

        handleAddRowAbove() {
            const selectedRows = this.getSelectedRows();
            if (selectedRows.length === 0 || !this.hasConsecutiveSelection) return;
            
            // Get all selected indices, sort them, and use the first one
            const indices = selectedRows.map(r => r.index).sort((a, b) => a - b);
            const firstIndex = indices[0];
            
            // Emit new-row event with position info
            this.$emit('new-row', { position: 'above', targetIndex: firstIndex });
            
            // Clear selection state after adding row
            tableRowSelectionState.clearAll();
        },

        handleAddRowBelow() {
            const selectedRows = this.getSelectedRows();
            if (selectedRows.length === 0 || !this.hasConsecutiveSelection) return;
            
            // Get all selected indices, sort them, and use the last one
            const indices = selectedRows.map(r => r.index).sort((a, b) => a - b);
            const lastIndex = indices[indices.length - 1];
            
            // Emit new-row event with position info
            this.$emit('new-row', { position: 'below', targetIndex: lastIndex });
            
            // Clear selection state after adding row
            tableRowSelectionState.clearAll();
        },

        cancelClipboard() {
            tableRowSelectionState.cancelClipboard();
        },

        // Complete the clipboard paste at the currently registered drop target.
        // Used by click handlers on drop-target zones as an alternative to Ctrl+V.
        completeClipboardAtCurrentTarget() {
            if (!tableRowSelectionState.clipboardMode) return;
            if (!this.dropTarget?.type) return;
            tableRowSelectionState.completeClipboard(this.dropTarget);
        },

        // Click on the header area while in clipboard mode — paste at top of table.
        // Ignores clicks that originated from a button (sort / hide) inside the header.
        handleClipboardHeaderClick(event) {
            if (!tableRowSelectionState.clipboardMode) return;
            if (this.dropTarget?.type !== 'header') return;
            if (event.target.closest('button')) return;
            this.completeClipboardAtCurrentTarget();
        },

        // Mobile: tap on thead (not on a button) toggles column-button visibility
        handleTheadTap(event) {
            if (event.target.closest('button')) return;
            this.theadActive = !this.theadActive;
        },

        // Click on a row while in clipboard mode — paste if that row is showing a drop-target indicator.
        handleClipboardRowClick(idx, visibleIdx, event) {
            if (!tableRowSelectionState.clipboardMode) return;
            const dt = this.dropTarget;
            if (!dt?.type) return;
            const isBetween = dt.type === 'between' &&
                (dt.visualTargetIndex === visibleIdx || dt.visualTargetIndex === visibleIdx + 1);
            const isOnto = dt.type === 'onto' && dt.targetIndex === idx;
            if (isBetween || isOnto) this.completeClipboardAtCurrentTarget();
        },

        // Request clipboard-read permission via a user gesture. Must be bound to a click handler.
        // If the clipboard already contains usable data, process it immediately after grant.
        async requestClipboardPermission() {
            const text = await tableRowSelectionState.requestClipboardPermission();
            if (text) this._processExternalClipboardText(text);
        },

        dismissClipboardPermissionPrompt() {
            tableRowSelectionState.clipboardPromptDismissed = true;
            tableRowSelectionState._version++;
        },

        handleDeleteSelected() {
            // Toggle deletion state for all selected rows
            if (tableRowSelectionState.getTotalSelectionCount() > 0) {
                // If all selected rows are marked, unmark them; otherwise mark them
                const shouldMark = !this.areAllSelectedMarkedForDeletion;
                tableRowSelectionState.markSelectedForDeletion(shouldMark);
                tableRowSelectionState.clearAll();
            }
        },

        handleMoreOptions() {
            // Emit event with selected rows data to parent for custom menu options
            if (tableRowSelectionState.getTotalSelectionCount() > 0) {
                const selectedRows = tableRowSelectionState.getAllSelectedRows();
                this.$emit('row-options', selectedRows);
            }
        },

        handleToggleSelectedGroups() {
            if (!this.hasSelectedGroupMasters) return;

            // If any selected group is hidden, show all selected; otherwise hide all.
            const shouldHide = !this.anySelectedGroupCollapsed;
            this.selectedGroupMasterIds.forEach(groupId => {
                // shouldOverride = add to overriddenGroups; the meaning of overridden flips with mode.
                // view mode: overridden = open (exception to default-closed)
                // edit mode: overridden = closed (exception to default-open)
                const shouldOverride = shouldHide !== this.hideGroupMembers;
                if (shouldOverride) {
                    this.overriddenGroups.add(groupId);
                } else {
                    this.overriddenGroups.delete(groupId);
                }
            });
            this.overriddenGroups = new Set(this.overriddenGroups);
        },

        createEmptyGroupMasterRow(targetIndex) {
            const templateRow = this.data[targetIndex] || this.data[targetIndex - 1] || {};
            const emptyRow = {};

            // Preserve known row shape while forcing an empty payload row.
            Object.keys(templateRow).forEach(key => {
                if (key === 'MetaData') {
                    emptyRow[key] = '';
                } else if (key === 'AppData') {
                    emptyRow[key] = undefined;
                } else {
                    emptyRow[key] = '';
                }
            });

            // Ensure all declared columns exist on the row.
            this.columns.forEach(column => {
                if (!Object.prototype.hasOwnProperty.call(emptyRow, column.key)) {
                    emptyRow[column.key] = '';
                }
            });

            this.data.splice(targetIndex, 0, emptyRow);
            return emptyRow;
        },

        handleCreateGroupFromSelection() {
            if (!this.canCreateGroupFromSelection) return;

            const anchorVisibleIndex = this.firstSelectedVisibleRowIndex;
            const anchorEntry = this.visibleRows[anchorVisibleIndex];
            if (!anchorEntry) return;

            const targetIndex = anchorEntry.idx;
            if (typeof targetIndex !== 'number' || targetIndex < 0 || targetIndex > this.data.length) return;

            const selectedRowsSnapshot = tableRowSelectionState.getAllSelectedRows()
                .map(({ row, sourceArray, index }) => ({ row, sourceArray, index }))
                .filter(({ row, sourceArray }) => !!row && !!sourceArray);

            if (selectedRowsSnapshot.length === 0) return;

            if (tableRowSelectionState.currentRouteKey) {
                const arraysToCapture = new Set([this.data]);
                selectedRowsSnapshot.forEach(({ sourceArray }) => arraysToCapture.add(sourceArray));
                undoRegistry.capture(Array.from(arraysToCapture), tableRowSelectionState.currentRouteKey, {
                    type: 'group-create-from-selection',
                    selectionState: tableRowSelectionState
                });
            }

            const masterRow = this.createEmptyGroupMasterRow(targetIndex);

            // Row insertion shifts numeric indices; rebuild selection from object references.
            tableRowSelectionState.clearAll();
            selectedRowsSnapshot.forEach(({ row, sourceArray }) => {
                const updatedIndex = sourceArray.indexOf(row);
                if (updatedIndex !== -1) {
                    tableRowSelectionState.addRow(updatedIndex, sourceArray, this.dragId);
                }
            });

            const masterIndex = this.data.indexOf(masterRow);
            if (masterIndex === -1) return;

            const result = tableRowSelectionState.groupSelectedItemsUnder(masterIndex, this.data);
            if (!result) return;

            // Follow drag grouping behavior: keep selection on grouped children.
            tableRowSelectionState.clearAll();
            result.droppedItems.forEach(item => {
                const childIndex = this.data.indexOf(item);
                if (childIndex !== -1) {
                    tableRowSelectionState.addRow(childIndex, this.data, this.dragId);
                }
            });
        },

        handleSort(columnKey) {
            // Check if this specific column is sortable
            const column = this.columns.find(col => col.key === columnKey);
            if (!column || !this.isColumnSortable(column)) return;
            this.isUsingDefaultSort = false;
            
            if (this.sortColumn === columnKey) {
                // Toggle sort direction if same column
                this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                // New column, start with ascending
                this.sortColumn = columnKey;
                this.sortDirection = 'asc';
            }
        },

        getNormalizedDefaultSortDirection() {
            return String(this.defaultSortDirection || '').toLowerCase() === 'desc' ? 'desc' : 'asc';
        },

        normalizeDefaultSortColumnConfig() {
            const config = this.defaultSortColumn;
            if (Array.isArray(config)) return config;
            if (typeof config === 'string' && config.trim()) return [config.trim()];
            return [];
        },

        getDefaultSortCriteria() {
            const fallbackDirection = this.getNormalizedDefaultSortDirection();
            return this.normalizeDefaultSortColumnConfig()
                .map((entry) => {
                    if (typeof entry === 'string') {
                        return { key: entry.trim(), direction: fallbackDirection };
                    }

                    if (entry && typeof entry === 'object') {
                        const key = typeof entry.key === 'string' ? entry.key.trim() : '';
                        const direction = String(entry.direction || fallbackDirection).toLowerCase() === 'desc' ? 'desc' : 'asc';
                        return { key, direction };
                    }

                    return null;
                })
                .filter(item => item && item.key)
                .map(item => {
                    const column = this.columns.find(col => col.key === item.key);
                    return column && this.isColumnSortable(column)
                        ? { column, direction: item.direction }
                        : null;
                })
                .filter(Boolean);
        },

        getCurrentSortCriteria() {
            if (!this.sortColumn) return [];
            const column = this.columns.find(col => col.key === this.sortColumn);
            if (!column || !this.isColumnSortable(column)) return [];
            return [{ column, direction: this.sortDirection }];
        },

        compareRowsByColumn(aRow, bRow, column, direction) {
            const aValue = aRow[column.key];
            const bValue = bRow[column.key];

            if (aValue === null || aValue === undefined) return 1;
            if (bValue === null || bValue === undefined) return -1;

            const columnType = String(column.type || '').toLowerCase();
            if (columnType === 'item') {
                const comparison = compareItemLikeValues(aValue, bValue);
                return direction === 'desc' ? -comparison : comparison;
            }

            const aDate = parseDate(aValue);
            const bDate = parseDate(bValue);
            if (aDate && bDate) {
                const comparison = aDate.getTime() - bDate.getTime();
                return direction === 'desc' ? -comparison : comparison;
            }

            const aNum = parseFloat(aValue);
            const bNum = parseFloat(bValue);
            const isANum = !isNaN(aNum);
            const isBNum = !isNaN(bNum);

            let comparison = 0;
            if (isANum && isBNum) {
                comparison = aNum - bNum;
            } else {
                comparison = String(aValue).localeCompare(String(bValue));
            }

            return direction === 'desc' ? -comparison : comparison;
        },

        applyDefaultSortColumn(options = {}) {
            const { force = false } = options;
            const defaultSortCriteria = this.getDefaultSortCriteria();
            if (defaultSortCriteria.length === 0) return;

            const activeSortColumn = this.columns.find(col => col.key === this.sortColumn);
            const hasValidActiveSort = !!(this.sortColumn && activeSortColumn && this.isColumnSortable(activeSortColumn));

            if (!force && hasValidActiveSort) return;

            this.sortColumn = defaultSortCriteria[0].column.key;
            this.sortDirection = defaultSortCriteria[0].direction;
            this.isUsingDefaultSort = true;
        },
        
        isColumnSortable(column) {
            // Check if column has explicit sortable property, otherwise fall back to table-wide sortable
            return column.sortable !== undefined ? column.sortable : this.sortable;
        },

        getSortIcon(columnKey) {
            const column = this.columns.find(col => col.key === columnKey);
            if (!this.isColumnSortable(column) || this.sortColumn !== columnKey) return '';
            return this.sortDirection === 'asc' ? '⭡' : '⭣';
        },
        
        handleHideColumn(columnKey) {
            // Add column to hiddenColumns array to hide it
            if (!this.hiddenColumns.includes(columnKey)) {
                this.hiddenColumns.push(columnKey);
            }
        },
        
        formatCellValue(value, column) {
            if (value === null || value === undefined) return '';
            
            // Apply column-specific formatting
            if (column.format) {
                switch (column.format) {
                    case 'currency':
                        return `$${parseFloat(value).toFixed(2)}`;
                    case 'date': {
                        const parsedDate = parseDate(value);
                        return toUSDateString(parsedDate) ?? String(value);
                    }
                    case 'number':
                        return parseFloat(value).toLocaleString();
                    case 'percentage':
                        return `${parseFloat(value).toFixed(1)}%`;
                    default:
                        return value;
                }
            }
            
            return value;
        },

        // Wrapper method for search highlighting that uses the composable with proper formatting
        highlightSearchText(value, column) {
            // Create a temporary formatter that uses this component's formatCellValue
            const formatter = (val, col) => this.formatCellValue(val, col);
            
            // Call the composable's highlightText with the formatter
            const formattedValue = formatter(value, column);
            
            // If no search, return formatted value
            if (!this.activeSearchValue || !this.activeSearchValue.trim() || !formattedValue) {
                return formattedValue;
            }
            
            // Use the composable's escapeHtml and highlighting logic
            const stringValue = String(formattedValue);
            const words = this.search.splitSearchTerms(this.activeSearchValue);
            
            // Collect all match positions
            const matches = [];
            words.forEach(word => {
                const escapedSearchWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escapedSearchWord, 'gi');
                let match;
                while ((match = regex.exec(stringValue)) !== null) {
                    matches.push({
                        start: match.index,
                        end: match.index + match[0].length,
                        text: match[0]
                    });
                }
            });
            
            // Sort matches by start position
            matches.sort((a, b) => a.start - b.start);
            
            // Merge overlapping matches
            const merged = [];
            for (const match of matches) {
                if (merged.length === 0) {
                    merged.push(match);
                } else {
                    const last = merged[merged.length - 1];
                    if (match.start <= last.end) {
                        last.end = Math.max(last.end, match.end);
                        last.text = stringValue.substring(last.start, last.end);
                    } else {
                        merged.push(match);
                    }
                }
            }
            
            // Build HTML with highlights
            let result = '';
            let lastIndex = 0;
            
            for (const match of merged) {
                const beforeMatch = stringValue.substring(lastIndex, match.start);
                result += this.search.escapeHtml(beforeMatch);
                result += `<span class="search-match">${this.search.escapeHtml(match.text)}</span>`;
                lastIndex = match.end;
            }
            
            result += this.search.escapeHtml(stringValue.substring(lastIndex));
            return result;
        },

        // Wrapper method for search match detection
        hasSearchMatch(value, column) {
            if (!this.activeSearchValue || !this.activeSearchValue.trim()) {
                return false;
            }
            
            const formattedValue = this.formatCellValue(value, column);
            if (!formattedValue) return false;
            
            const formattedLower = String(formattedValue).toLowerCase();
            const words = this.search.splitSearchTerms(this.activeSearchValue);
            
            // Check if any search word matches (OR logic)
            return words.some(word => formattedLower.includes(word.toLowerCase()));
        },

        // Get color class for date values based on proximity to today
        getDateColorClass(dateValue) {
            if (!dateValue) return '';
            
            // Parse the date using the parseDate helper to handle all supported formats
            let date;
            if (dateValue instanceof Date) {
                date = dateValue;
            } else {
                date = parseDate(dateValue);
            }
            
            // Check if date is valid
            if (!date || isNaN(date.getTime())) {
                return '';
            }
            
            // Get today's date at midnight for comparison
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Set the target date to midnight for fair comparison
            const targetDate = new Date(date);
            targetDate.setHours(0, 0, 0, 0);
            
            // Calculate difference in days
            const diffTime = targetDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            // Don't color dates more than a week in the past
            if (diffDays < -7) {
                return '';  // No coloring for dates older than a week
            }
            
            // Apply color based on proximity
            if (diffDays <= 2) {
                return 'red';  // Within 2 days (including past dates up to a week ago)
            } else if (diffDays <= 7) {
                return 'orange';  // Within 7 days
            }
            
            return '';  // No special coloring for dates more than 7 days in the future
        },
        
        getCellClass(value, column, rowIndex, colIndex) {
            let baseClass = '';
            
            // Support function-based cell classes FIRST (before autoColor)
            // This allows custom columns to override autoColor behavior
            if (typeof column.cellClass === 'function') {
                // Pass the full row data if rowIndex is provided and valid
                if (typeof rowIndex === 'number' && this.data && this.data[rowIndex]) {
                    const customClass = column.cellClass(value, this.data[rowIndex]);
                    if (customClass) return customClass; // Return early if custom class provided
                } else {
                    const customClass = column.cellClass(value);
                    if (customClass) return customClass; // Return early if custom class provided
                }
            }
            
            // Support object-based cell classes
            if (typeof column.cellClass === 'object') {
                for (const [className, condition] of Object.entries(column.cellClass)) {
                    if (typeof condition === 'function' && condition(value)) {
                        return className;
                    }
                    if (value === condition) {
                        return className;
                    }
                }
            }
            
            // Centralized autoColor logic for number columns
            // Universal rule: < 0 → red, < 1 → yellow, >= 1 → no color
            if (column.autoColor && column.format === 'number') {
                const autoClass = this.getAutoColorClass(value);
                if (autoClass) baseClass = autoClass;
            }
            
            // Centralized autoColor logic for date columns
            if (column.autoColor && column.format === 'date') {
                const cellClass = this.getDateColorClass(value);
                if (cellClass) baseClass = cellClass;
            }
            
            // Add dirty class if cell is dirty
            if (this.dirtyCells[rowIndex] && this.dirtyCells[rowIndex][colIndex]) {
                baseClass = (baseClass ? baseClass + ' ' : '') + 'dirty';
            }
            // Add dirty class if nested table in this cell is dirty
            if (this.nestedTableDirtyCells[rowIndex] && this.nestedTableDirtyCells[rowIndex][colIndex]) {
                baseClass = (baseClass ? baseClass + ' ' : '') + 'dirty';
            }
            return baseClass;
        },
        
        getColumnWidth(column) {
            return column.width ? `${column.width}px` : 'auto';
        },
        getColumnFont(column) {
            return column.font ? 'font-' + column.font : '';
        },
        handleCellEdit(rowIndex, colIndex, value) {
            if (!this.hasEditableColumns) return;
            const now = Date.now();
            const timeSinceLastEdit = this.lastEditTimestamp ? now - this.lastEditTimestamp : Infinity;
            
            // Create new snapshot if:
            // 1. No snapshot captured yet (!hasUndoCaptured)
            // 2. More than 5 seconds since last edit (timeSinceLastEdit >= 5000)
            if ((!this.hasUndoCaptured || timeSinceLastEdit >= 5000) && this.appContext?.currentPath) {
                // Clear previous capture to force new snapshot
                undoRegistry.clearCurrentEditCapture();
                const routeKey = this.appContext.currentPath.split('?')[0];
                undoRegistry.capture(this.data, routeKey, {
                    type: 'cell-edit',
                    cellInfo: { rowIndex, colIndex },
                    preventDuplicates: true
                });
                this.hasUndoCaptured = true;
            }
            
            // Reset the idle timer — when it fires, discard the snapshot if state is unchanged
            if (this._undoIdleTimer) clearTimeout(this._undoIdleTimer);
            if (this.appContext?.currentPath) {
                const routeKey = this.appContext.currentPath.split('?')[0];
                this._undoIdleTimer = setTimeout(() => {
                    this._undoIdleTimer = null;
                    undoRegistry.discardLastSnapshotIfUnchanged(this.data, routeKey);
                }, 5000);
            }
            
            // Update last edit timestamp
            this.lastEditTimestamp = now;
            
            this.$emit('cell-edit', rowIndex, colIndex, value);
            // Dirty check for single cell
            if (!this.dirtyCells[rowIndex]) this.dirtyCells[rowIndex] = {};
            const originalValue = this.originalData[rowIndex]?.[this.columns[colIndex].key];
            if (value !== originalValue) {
                this.dirtyCells[rowIndex][colIndex] = true;
            } else {
                delete this.dirtyCells[rowIndex][colIndex];
            }
            this.checkDirtyCells();
        },
        _getRowKeyValue(row) {
            if (!this.rowKey || !row) return undefined;
            return this.rowKey.split('.').reduce((obj, key) => obj?.[key], row);
        },
        getOriginalDataForRow(row, idx) {
            if (this.rowKey && this.originalDataByKey) {
                const keyVal = this._getRowKeyValue(row);
                if (keyVal !== undefined && keyVal !== null && keyVal !== '') {
                    return this.originalDataByKey.get(String(keyVal));
                }
                return undefined;
            }
            return this.originalData?.[idx];
        },
        revertCellToOriginal(rowIndex, colIndex, event) {
            if (!this.hasEditableColumns) return;
            // Stop propagation to prevent cell focus
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }
            
            // Capture snapshot before reverting (so revert can be undone)
            if (this.appContext?.currentPath) {
                const routeKey = this.appContext.currentPath.split('?')[0];
                undoRegistry.capture(this.data, routeKey, {
                    type: 'cell-revert',
                    cellInfo: { rowIndex, colIndex }
                });
            }
            
            const column = this.columns[colIndex];
            const originalRow = this.getOriginalDataForRow(this.data[rowIndex], rowIndex);
            const originalValue = originalRow?.[column.key];
            
            // Update the data
            if (this.data[rowIndex]) {
                this.data[rowIndex][column.key] = originalValue;
            }
            
            // Update the DOM element if it exists
            if (column.format === 'number') {
                const refName = 'number_editable_' + rowIndex + '_' + colIndex;
                const ref = this.$refs[refName];
                const inputEl = Array.isArray(ref) ? ref[0] : ref;
                if (inputEl) {
                    inputEl.value = Number.isFinite(parseFloat(originalValue)) ? parseFloat(originalValue) : '';
                }
            } else {
                const refName = 'editable_' + rowIndex + '_' + colIndex;
                const ref = this.$refs[refName];
                const editableEl = Array.isArray(ref) ? ref[0] : ref;
                if (editableEl) {
                    editableEl.textContent = originalValue || '';
                }
            }
            
            // Clear dirty flag
            if (this.dirtyCells[rowIndex]) {
                delete this.dirtyCells[rowIndex][colIndex];
            }
            
            // Emit cell-edit event
            this.$emit('cell-edit', rowIndex, colIndex, originalValue);
            this.checkDirtyCells();
        },
        handleCellFocus(rowIndex, colIndex, event) {
            // No undo capture on focus - only capture when user starts typing in handleCellEdit
        },
        handleEditableCellContainerClick(rowIndex, colIndex, column, event) {
            if (!column?.editable) return;

            const target = event?.target;
            if (target?.isContentEditable || target?.tagName === 'INPUT') return;

            if (column.format === 'number') {
                const numberRefName = 'number_editable_' + rowIndex + '_' + colIndex;
                const numberRef = this.$refs[numberRefName];
                const numberInputEl = Array.isArray(numberRef) ? numberRef[0] : numberRef;
                if (numberInputEl && typeof numberInputEl.focus === 'function') {
                    numberInputEl.focus({ preventScroll: true });
                }
                return;
            }

            const refName = 'editable_' + rowIndex + '_' + colIndex;
            const ref = this.$refs[refName];
            const editableEl = Array.isArray(ref) ? ref[0] : ref;
            if (editableEl && typeof editableEl.focus === 'function') {
                editableEl.focus({ preventScroll: true });
            }
        },
        handleCellBlur(rowIndex, colIndex, event) {
            // Clear flags when cell loses focus (enables new snapshot on next focus+edit)
            this.hasUndoCaptured = false;
            this.lastEditTimestamp = null;
            undoRegistry.clearCurrentEditCapture();
            if (this._undoIdleTimer) {
                clearTimeout(this._undoIdleTimer);
                this._undoIdleTimer = null;
            }
        },
        compareAllCellsDirty() {
            // Compare all cells in data vs originalData and update dirtyCells
            if (!this.hasEditableColumns) return;
            this.dirtyCells = {};
            if (!Array.isArray(this.data) || !Array.isArray(this.originalData)) return;
            this.data.forEach((row, rowIndex) => {
                const originalRow = this.originalData[rowIndex];
                // Treat undefined originalRow as an object with all nulls for dirty checking
                this.columns.forEach((column, colIndex) => {
                    const key = column.key;
                    if (column.editable) {
                        const currentValue = row[key];
                        // If originalRow is undefined, treat as null
                        const originalValue = originalRow ? originalRow[key] : null;
                        if (currentValue !== originalValue) {
                            if (!this.dirtyCells[rowIndex]) this.dirtyCells[rowIndex] = {};
                            this.dirtyCells[rowIndex][colIndex] = true;
                        }
                    }
                });
                
                // Always check MetaData and EditHistory columns for changes, even though they're hidden
                // Use a special column index (-1) to track these hidden column changes
                ['MetaData'].forEach(hiddenKey => {
                    if (row && row.hasOwnProperty(hiddenKey)) {
                        const currentValue = row[hiddenKey];
                        const originalValue = originalRow ? originalRow[hiddenKey] : null;
                        // Compare values (handle both string and object comparisons)
                        const isDifferent = currentValue !== originalValue;
                        if (isDifferent) {
                            if (!this.dirtyCells[rowIndex]) this.dirtyCells[rowIndex] = {};
                            // Use -1 as a sentinel column index for hidden metadata columns
                            this.dirtyCells[rowIndex][-1] = true;
                        }
                    }
                });
            });
            this.checkDirtyCells();
        },
        // Called by slot from nested TableComponent
        handleInnerTableDirty(isDirty, rowIndex, colIndex) {
            if (!this.nestedTableDirtyCells[rowIndex]) this.nestedTableDirtyCells[rowIndex] = {};
            if (isDirty) {
                this.nestedTableDirtyCells[rowIndex][colIndex] = true;
            } else {
                delete this.nestedTableDirtyCells[rowIndex][colIndex];
                if (Object.keys(this.nestedTableDirtyCells[rowIndex]).length === 0) {
                    delete this.nestedTableDirtyCells[rowIndex];
                }
            }
            this.checkDirtyCells();
        },
        checkDirtyCells() {
            // If any cell is dirty, allow save event
            const hasDirtyCell = Object.keys(this.dirtyCells).some(row =>
                Object.keys(this.dirtyCells[row]).length > 0
            );
            // If any nested table cell is dirty, allow save event
            const hasNestedDirty = Object.keys(this.nestedTableDirtyCells).some(row =>
                Object.keys(this.nestedTableDirtyCells[row]).length > 0
            );
            this.allowSaveEvent = hasDirtyCell || hasNestedDirty;
        },
        handleSave() {
            this.$emit('on-save');
        },
        handleRowMove() {
            this.$emit('row-move');
        },
        handleHamburgerMenu() {
            // Show the hamburger menu modal directly
            if (this.hamburgerMenuComponent) {
                this.$modal.custom(
                    this.hamburgerMenuComponent.components,
                    { 
                        ...this.hamburgerMenuComponent.props,
                        modalClass: 'hamburger-menu'
                    },
                    this.title || 'Menu'
                );
            }
        },
        
        handleUndo() {
            if (this.canUndo) {
                const alert = undoRegistry.undo();
                if (alert) modalManager.confirm(alert, () => {}, null, 'Note', 'OK', null, 'small-menu');
            }
        },
        
        handleRedo() {
            if (this.canRedo) {
                const alert = undoRegistry.redo();
                if (alert) modalManager.confirm(alert, () => {}, null, 'Note', 'OK', null, 'small-menu');
            }
        },
        
        handleDragHandleMouseDown(rowIndex, event) {
            // Only respond to left mouse button
            if (event.button !== 0) return;
            
            // Ensure this is a drag handle
            if (!event.target.classList.contains('row-drag-handle')) return;
            
            this.clickState.isMouseDown = true;
            this.clickState.startRowIndex = rowIndex;
            this.clickState.startTime = Date.now();
            this.clickState.startX = event.clientX;
            this.clickState.startY = event.clientY;
            this.clickState.hasMoved = false;
            this.clickState.shiftKey = event.shiftKey;
            
            // Set up long click timer (800ms)
            this.clickState.longClickTimer = setTimeout(() => {
                if (this.clickState.isMouseDown && !this.clickState.hasMoved) {
                    // Capture selection state before multiselection starts
                    const routeKey = this.appContext?.currentPath?.split('?')[0];
                    if (routeKey) {
                        undoRegistry.capture(this.data, routeKey, { 
                            type: 'multi-selection',
                            selectionState: tableRowSelectionState
                        });
                    }
                    
                    // Long click: add row to selection and enable multi-selection mode
                    tableRowSelectionState.addRow(rowIndex, this.data, this.dragId);
                    this.clickState.isMultiSelecting = true;
                    this.clickState.lastHoveredRowIndex = rowIndex;
                    this.clickState.longClickTimer = null;
                }
            }, 700);
            
            // Add global mouse move and up listeners
            document.addEventListener('mousemove', this.handleGlobalMouseMove);
            document.addEventListener('mouseup', this.handleGlobalMouseUp);
            
            // Prevent text selection
            event.preventDefault();
        },
        
        handleDragHandleTouchStart(rowIndex, event) {
            // Extract touch coordinates from the first touch point
            const touch = event.touches[0];
            if (!touch) return;
            
            // Ensure this is a drag handle
            if (!event.target.classList.contains('row-drag-handle')) return;
            
            this.clickState.isMouseDown = true;
            this.clickState.startRowIndex = rowIndex;
            this.clickState.startTime = Date.now();
            this.clickState.startX = touch.clientX;
            this.clickState.startY = touch.clientY;
            this.clickState.hasMoved = false;
            
            // Set up long click timer (800ms)
            this.clickState.longClickTimer = setTimeout(() => {
                if (this.clickState.isMouseDown && !this.clickState.hasMoved) {
                    // Capture selection state before multiselection starts
                    const routeKey = this.appContext?.currentPath?.split('?')[0];
                    if (routeKey) {
                        undoRegistry.capture(this.data, routeKey, { 
                            type: 'multi-selection',
                            selectionState: tableRowSelectionState
                        });
                    }
                    
                    // Long touch: add row to selection and enable multi-selection mode
                    tableRowSelectionState.addRow(rowIndex, this.data, this.dragId);
                    this.clickState.isMultiSelecting = true;
                    this.clickState.lastHoveredRowIndex = rowIndex;
                    this.clickState.longClickTimer = null;
                }
            }, 700);
            
            // Add global touch move and end listeners
            document.addEventListener('touchmove', this.handleGlobalTouchMove);
            document.addEventListener('touchend', this.handleGlobalTouchEnd);
            document.addEventListener('touchcancel', this.handleGlobalTouchEnd);
            
            // Prevent text selection and default touch behavior
            event.preventDefault();
        },
        
        handleGlobalMouseMove(event) {
            if (!this.clickState.isMouseDown) return;
            
            // Update global mouse position for drag follower
            tableRowSelectionState.mouseX = event.clientX;
            tableRowSelectionState.mouseY = event.clientY;
            
            const deltaX = Math.abs(event.clientX - this.clickState.startX);
            const deltaY = Math.abs(event.clientY - this.clickState.startY);
            const moveDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            // If moved more than 8 pixels
            if (moveDistance > 8 && !this.clickState.hasMoved) {
                this.clickState.hasMoved = true;
                
                // Cancel long click timer
                if (this.clickState.longClickTimer) {
                    clearTimeout(this.clickState.longClickTimer);
                    this.clickState.longClickTimer = null;
                }
                
                // If not in multi-selection mode, handle normal drag logic
                if (!this.clickState.isMultiSelecting) {
                    // If dragged row is not in selection, replace entire selection with this row
                    if (!tableRowSelectionState.hasRow(this.data, this.clickState.startRowIndex)) {
                        // Capture selection state before clearing for immediate drag
                        const routeKey = this.appContext?.currentPath?.split('?')[0];
                        if (routeKey) {
                            undoRegistry.capture(this.data, routeKey, { 
                                type: 'drag-start-selection',
                                selectionState: tableRowSelectionState
                            });
                        }
                        
                        tableRowSelectionState.clearAll();
                        tableRowSelectionState.addRow(this.clickState.startRowIndex, this.data, this.dragId);
                    }
                    
                    // Start drag if table is draggable and we have selections
                    if (this.draggable && tableRowSelectionState.getTotalSelectionCount() > 0) {
                        tableRowSelectionState.startDrag(this.data, this.dragId);
                        this.unselectAllEditableCells();
                    }
                }
            }
            
            // Handle multi-selection mode
            if (this.clickState.isMultiSelecting && this.clickState.hasMoved) {
                // Find the row index at current mouse position
                const currentRowIndex = this.getRowIndexAtPosition(event.clientY);
                
                if (currentRowIndex !== null && currentRowIndex !== this.clickState.lastHoveredRowIndex) {
                    // Update the selection range
                    this.selectRowRange(this.clickState.startRowIndex, currentRowIndex);
                    this.clickState.lastHoveredRowIndex = currentRowIndex;
                }
            }
        },
        handleGlobalMouseUp(event) {
            if (!this.clickState.isMouseDown) return;
            // Clear local drop target after drag completion

            this.clearDropTarget();

            if (tableRowSelectionState.findingDropTargets) {
                // Clean up and exit early - don't process click logic when dragging
                this.resetClickState();
                return;
            }

            // Check if mouse up is on the same drag handle that started the interaction
            const targetHandle = event.target.closest('.row-drag-handle');
            const startHandle = document.elementFromPoint(this.clickState.startX, this.clickState.startY);
            
            // Special case: if we were multi-selecting, preserve the selection and exit
            if (this.clickState.isMultiSelecting) {
                // Set global timestamp to prevent handleOutsideClick from clearing selection
                tableRowSelectionState.lastMultiSelectEndTime = Date.now();
                this.resetClickState();
                return;
            }

            // Only process click logic if mouse up is on the same handle (or close enough)
            if (targetHandle && startHandle && targetHandle === startHandle) {
                // Clear long click timer
                if (this.clickState.longClickTimer) {
                    clearTimeout(this.clickState.longClickTimer);
                    this.clickState.longClickTimer = null;
                }
                
                // Short click logic (only if no movement occurred)
                if (!this.clickState.hasMoved && !this.clickState.isMultiSelecting) {
                    if (this.clickState.shiftKey && this.clickState.lastAnchorRowIndex !== null) {
                        // Shift-click: range select from anchor to clicked row
                        this.selectRowRange(this.clickState.lastAnchorRowIndex, this.clickState.startRowIndex);
                    } else {
                        // Capture selection state before toggle
                        const routeKey = this.appContext?.currentPath?.split('?')[0];
                        if (routeKey) {
                            undoRegistry.capture(this.data, routeKey, { 
                                type: 'selection-toggle',
                                selectionState: tableRowSelectionState
                            });
                        }
                        
                        // Toggle selection state of clicked row
                        tableRowSelectionState.toggleRow(this.clickState.startRowIndex, this.data, this.dragId);
                        this.clickState.lastAnchorRowIndex = this.clickState.startRowIndex;
                    }
                }
            }
            
            // Clean up
            this.resetClickState();
        },
        
        handleGlobalTouchMove(event) {
            if (!this.clickState.isMouseDown) return;
            
            // Get the first touch point
            const touch = event.touches[0];
            if (!touch) return;
            
            const deltaX = Math.abs(touch.clientX - this.clickState.startX);
            const deltaY = Math.abs(touch.clientY - this.clickState.startY);
            const moveDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            // If moved more than 8 pixels
            if (moveDistance > 8 && !this.clickState.hasMoved) {
                this.clickState.hasMoved = true;
                
                // Cancel long click timer
                if (this.clickState.longClickTimer) {
                    clearTimeout(this.clickState.longClickTimer);
                    this.clickState.longClickTimer = null;
                }
                
                // If not in multi-selection mode, handle normal drag logic
                if (!this.clickState.isMultiSelecting) {
                    // If dragged row is not in selection, replace entire selection with this row
                    if (!tableRowSelectionState.hasRow(this.data, this.clickState.startRowIndex)) {
                        // Capture selection state before clearing for immediate drag
                        const routeKey = this.appContext?.currentPath?.split('?')[0];
                        if (routeKey) {
                            undoRegistry.capture(this.data, routeKey, { 
                                type: 'drag-start-selection',
                                selectionState: tableRowSelectionState
                            });
                        }
                        
                        tableRowSelectionState.clearAll();
                        tableRowSelectionState.addRow(this.clickState.startRowIndex, this.data, this.dragId);
                    }
                    
                    // Start drag if table is draggable and we have selections
                    if (this.draggable && tableRowSelectionState.getTotalSelectionCount() > 0) {
                        tableRowSelectionState.startDrag(this.data, this.dragId);
                        this.unselectAllEditableCells();
                    }
                }
            }
            
            // Dispatch synthetic mousemove event for cross-table drop detection
            // This allows table @mousemove handlers to fire on whichever table is under the touch
            if (tableRowSelectionState.findingDropTargets) {
                const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);
                const currentTable = elementUnderTouch?.closest('.dynamic-table');
                
                // Detect table transitions and dispatch mouseleave/mouseenter
                if (currentTable !== this.clickState.lastTouchTable) {
                    // Dispatch mouseleave to the previous table
                    if (this.clickState.lastTouchTable) {
                        const leaveEvent = new MouseEvent('mouseleave', {
                            clientX: touch.clientX,
                            clientY: touch.clientY,
                            bubbles: false,
                            cancelable: true
                        });
                        this.clickState.lastTouchTable.dispatchEvent(leaveEvent);
                    }
                    
                    // Dispatch mouseenter to the new table
                    if (currentTable) {
                        const enterEvent = new MouseEvent('mouseenter', {
                            clientX: touch.clientX,
                            clientY: touch.clientY,
                            bubbles: false,
                            cancelable: true
                        });
                        currentTable.dispatchEvent(enterEvent);
                    }
                    
                    // Update tracked table
                    this.clickState.lastTouchTable = currentTable;
                }
                
                // Dispatch mousemove to current element
                const syntheticEvent = new MouseEvent('mousemove', {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    bubbles: true,
                    cancelable: true
                });
                elementUnderTouch?.dispatchEvent(syntheticEvent);
            }
            
            // Handle multi-selection mode
            if (this.clickState.isMultiSelecting && this.clickState.hasMoved) {
                // Find the row index at current touch position
                const currentRowIndex = this.getRowIndexAtPosition(touch.clientY);
                
                if (currentRowIndex !== null && currentRowIndex !== this.clickState.lastHoveredRowIndex) {
                    // Update the selection range
                    this.selectRowRange(this.clickState.startRowIndex, currentRowIndex);
                    this.clickState.lastHoveredRowIndex = currentRowIndex;
                }
            }
            
            // Prevent scrolling while dragging
            event.preventDefault();
        },
        
        handleGlobalTouchEnd(event) {
            if (!this.clickState.isMouseDown) return;
            
            // Clear local drop target after drag completion
            this.clearDropTarget();

            if (tableRowSelectionState.findingDropTargets) {
                // Clean up and exit early - don't process click logic when dragging
                this.resetClickState();
                return;
            }

            // Get the touch point that ended
            const touch = event.changedTouches[0];
            if (!touch) {
                this.resetClickState();
                return;
            }
            
            // Check if touch ended on the same drag handle that started the interaction
            const targetHandle = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.row-drag-handle');
            const startHandle = document.elementFromPoint(this.clickState.startX, this.clickState.startY);
            
            // Special case: if we were multi-selecting, preserve the selection and exit
            if (this.clickState.isMultiSelecting) {
                // Set global timestamp to prevent handleOutsideClick from clearing selection
                tableRowSelectionState.lastMultiSelectEndTime = Date.now();
                this.resetClickState();
                return;
            }

            // Only process click logic if touch ended on the same handle (or close enough)
            if (targetHandle && startHandle && targetHandle === startHandle) {
                // Clear long click timer
                if (this.clickState.longClickTimer) {
                    clearTimeout(this.clickState.longClickTimer);
                    this.clickState.longClickTimer = null;
                }
                
                // Short tap logic (only if no movement occurred)
                if (!this.clickState.hasMoved && !this.clickState.isMultiSelecting) {
                    // Capture selection state before toggle
                    const routeKey = this.appContext?.currentPath?.split('?')[0];
                    if (routeKey) {
                        undoRegistry.capture(this.data, routeKey, { 
                            type: 'selection-toggle',
                            selectionState: tableRowSelectionState
                        });
                    }
                    
                    // Toggle selection state of tapped row
                    tableRowSelectionState.toggleRow(this.clickState.startRowIndex, this.data, this.dragId);
                    this.clickState.lastAnchorRowIndex = this.clickState.startRowIndex;
                }
            }
            
            // Clean up
            this.resetClickState();
        },
        
        resetClickState() {
            if (this.clickState.longClickTimer) {
                clearTimeout(this.clickState.longClickTimer);
                this.clickState.longClickTimer = null;
            }
            
            this.clickState.isMouseDown = false;
            this.clickState.startRowIndex = null;
            this.clickState.startTime = null;
            this.clickState.startX = null;
            this.clickState.startY = null;
            this.clickState.hasMoved = false;
            this.clickState.shiftKey = false;
            this.clickState.isMultiSelecting = false;
            this.clickState.lastHoveredRowIndex = null;
            this.clickState.lastTouchTable = null;
            
            // Remove global listeners (both mouse and touch)
            document.removeEventListener('mousemove', this.handleGlobalMouseMove);
            document.removeEventListener('mouseup', this.handleGlobalMouseUp);
            document.removeEventListener('touchmove', this.handleGlobalTouchMove);
            document.removeEventListener('touchend', this.handleGlobalTouchEnd);
            document.removeEventListener('touchcancel', this.handleGlobalTouchEnd);
        },
        handleTableMouseEnter() {
            this.isMouseInTable = true;
            this.mouseMoveCounter = 0; // Reset counter when entering table
        },
        handleTableMouseLeave() {
            this.isMouseInTable = false;
            // Always clear drop target when leaving table
            this.clearDropTarget();
            tableRowSelectionState.clearDropTargetRegistration(this.data);
            this.lastKnownMouseX = null;
            this.lastKnownMouseY = null;
            this.mouseMoveCounter = 0; // Reset counter when leaving table
        },
        findDropTargetAtCursor() {
            // Use stored mouse position if available
            if (this.lastKnownMouseX === null || this.lastKnownMouseY === null) {
                return; // No mouse position available
            }
            
            let mouseX = this.lastKnownMouseX;
            let mouseY = this.lastKnownMouseY;
            if (this.lastKnownMouseX !== undefined && this.lastKnownMouseY !== undefined) {
                mouseX = this.lastKnownMouseX;
                mouseY = this.lastKnownMouseY;
            }
            
            // Find the table element - scope to this specific table using drag-id.
            // Exclude the sticky header clone (class 'sticky-header') which also carries the dragId
            // class but has no tbody; without this exclusion a scrolled page would always resolve
            // tableEl to the fixed clone, causing the bounds check to discard every cursor position.
            let tableEl;
            if (this.dragId) {
                tableEl = this.$el.querySelector(`table.${this.dragId}:not(.sticky-header)`);
            } else {
                tableEl = this.$el.querySelector('table:not(.sticky-header)');
            }
            if (!tableEl) return;
            
            const tableRect = tableEl.getBoundingClientRect();
            
            // Check if mouse is within table bounds
            if (mouseY < tableRect.top || mouseY > tableRect.bottom) {
                // Only clear if we're not in an active drag operation
                if (!tableRowSelectionState.findingDropTargets) {
                    this.clearDropTarget();
                }
                return;
            }
            
            // Find thead, tbody, and tfoot elements
            let thead, tbody;
            if (this.dragId) {
                thead = tableEl.querySelector(`table.${this.dragId} > thead`);
                tbody = tableEl.querySelector(`table.${this.dragId} > tbody`);
            } else {
                thead = tableEl.querySelector('thead');
                tbody = tableEl.querySelector('tbody');
            }
            let newDropTarget = { type: null, position: null, isAbove: false };
            
            // Check header drop target
            if (thead) {
                const theadRect = thead.getBoundingClientRect();
                if (mouseY >= theadRect.top && mouseY <= theadRect.bottom) {
                    newDropTarget = { type: 'header', position: null, isAbove: false };
                }
            }
            
            // Check between rows in tbody
            if (tbody && newDropTarget.type === null) {
                // Select only data rows (those with data-visible-idx) to correctly map back to
                // visibleRows. This excludes details-row-container rows and any extra <tr> elements
                // injected by slots, which would otherwise cause the loop index to drift ahead of
                // visibleRows and break drop-target detection for rows lower in the table.
                const rows = tbody.querySelectorAll(':scope > tr[data-visible-idx]');
                
                // Special case: if table is empty but draggable, check the empty-drop-target row
                if (rows.length === 0 && this.draggable) {
                    const emptyRow = tbody.querySelector('tr.empty-drop-target');
                    if (emptyRow) {
                        const rowRect = emptyRow.getBoundingClientRect();
                        if (mouseY >= rowRect.top && mouseY <= rowRect.bottom) {
                            // Drop at the beginning of empty table
                            newDropTarget = {
                                type: 'between',
                                targetIndex: 0,
                                visualTargetIndex: 0
                            };
                        }
                    }
                }
                
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const rowRect = row.getBoundingClientRect();
                    
                    if (mouseY >= rowRect.top && mouseY <= rowRect.bottom) {
                        // Read visibleIdx directly from the element so the mapping is correct
                        // regardless of how many non-data rows exist between data rows in the DOM.
                        const visibleIdx = parseInt(row.getAttribute('data-visible-idx'), 10);
                        const rowHeight = rowRect.height;
                        const rowTop = rowRect.top;
                        const relativeY = mouseY - rowTop;
                        
                        // Split row into thirds if allowDropOnto is enabled
                        if (this.allowDropOnto) {
                            const topThird = rowHeight / 3;
                            const bottomThird = (rowHeight * 2) / 3;
                            
                            if (relativeY >= topThird && relativeY <= bottomThird) {
                                // Middle third - check if target row is eligible for drop-onto
                                const currentVisibleRow = this.visibleRows[visibleIdx];
                                const targetIndex = currentVisibleRow ? currentVisibleRow.idx : visibleIdx;
                                const targetRow = this.data[targetIndex];
                                
                                // Don't allow drop onto if:
                                // 1. Any selected row is a group master
                                // 2. Target row is a group child (in-group)
                                // 3. Target row is an empty placeholder (data array is empty or row has class 'empty-drop-target')
                                // 4. Target row is currently selected
                                // 5. Target row is marked for deletion
                                const hasGroupMasterSelected = tableRowSelectionState.hasGroupMasterInDragSnapshot();
                                const isEmptyPlaceholder = !this.data || this.data.length === 0 || row.classList.contains('empty-drop-target');
                                const isGroupChild = this.isRowInGroup(targetIndex);
                                const isTargetSelected = tableRowSelectionState.hasRow(this.data, targetIndex);
                                const isMarkedForDeletion = this.isRowMarkedForDeletion(targetRow);
                                
                                if (!hasGroupMasterSelected && !isGroupChild && !isEmptyPlaceholder && !isTargetSelected && !isMarkedForDeletion) {
                                    newDropTarget = {
                                        type: 'onto',
                                        targetIndex: targetIndex
                                    };
                                    //console.log('Drop ONTO target found:', newDropTarget, 'visual index:', visibleIdx, 'mouseY:', mouseY, 'rowRect:', rowRect);
                                    break;
                                }
                                // If any condition fails, fall through to between logic below
                            }
                        }
                        
                        // Top or bottom third (or allowDropOnto is false) - normal between behavior
                        const midpoint = rowRect.top + rowRect.height / 2;
                        const isAbove = mouseY < midpoint;
                        
                        // Map visual row index to actual data position.
                        // visibleRows contains { row, idx } where idx is the actual data index.
                        // visualTargetIndex tracks which visual row shows the drop indicator;
                        // targetIndex is the data insertion point (may differ when groups are closed).
                        let targetIndex;
                        let visualTargetIndex;
                        if (isAbove) {
                            // Insert before this row
                            visualTargetIndex = visibleIdx;
                            if (visibleIdx === 0) {
                                targetIndex = 0; // Insert at beginning
                            } else {
                                // Find the data index of the previous visible row and add 1,
                                // skipping past any hidden group children that follow it.
                                const prevVisibleRow = this.visibleRows[visibleIdx - 1];
                                if (prevVisibleRow) {
                                    const prevMeta = tableRowSelectionState._getRowMetadata(prevVisibleRow.row);
                                    const prevGrouping = prevMeta?.grouping;
                                    if (prevGrouping?.isGroupMaster && this.isGroupMembersHiddenById(prevGrouping.groupId)) {
                                        const children = tableRowSelectionState._getGroupChildren(prevVisibleRow.idx, this.data);
                                        targetIndex = prevVisibleRow.idx + children.length + 1;
                                    } else {
                                        targetIndex = prevVisibleRow.idx + 1;
                                    }
                                } else {
                                    targetIndex = 0;
                                }
                            }
                        } else {
                            // Insert after this row, skipping past any hidden group children.
                            visualTargetIndex = visibleIdx + 1;
                            const currentVisibleRow = this.visibleRows[visibleIdx];
                            if (currentVisibleRow) {
                                const curMeta = tableRowSelectionState._getRowMetadata(currentVisibleRow.row);
                                const curGrouping = curMeta?.grouping;
                                if (curGrouping?.isGroupMaster && this.isGroupMembersHiddenById(curGrouping.groupId)) {
                                    const children = tableRowSelectionState._getGroupChildren(currentVisibleRow.idx, this.data);
                                    targetIndex = currentVisibleRow.idx + children.length + 1;
                                } else {
                                    targetIndex = currentVisibleRow.idx + 1;
                                }
                            } else {
                                targetIndex = this.data.length;
                            }
                        }
                        
                        // Check if a group master is selected and this position would split a group
                        const hasGroupMasterSelected = tableRowSelectionState.hasGroupMasterInDragSnapshot();
                        if (hasGroupMasterSelected && this.wouldSplitGroup(targetIndex)) {
                            // Don't allow drop between group rows
                            continue;
                        }
                        
                        newDropTarget = {
                            type: 'between',
                            targetIndex: targetIndex,
                            visualTargetIndex: visualTargetIndex
                        };
                        //console.log('Drop target found:', newDropTarget, 'visual index:', visibleIdx, 'isAbove:', isAbove, 'mouseY:', mouseY, 'rowRect:', rowRect);
                        break;
                    }
                }
            }
            
            // Update drop target if changed
            if (this.dropTarget.type !== newDropTarget.type ||
                this.dropTarget.targetIndex !== newDropTarget.targetIndex ||
                this.dropTarget.visualTargetIndex !== newDropTarget.visualTargetIndex) {
                
                this.dropTarget = newDropTarget;
                
                // Register the new drop target with global state
                if (this.dropTarget.type) {
                    tableRowSelectionState.registerDropTarget(this.data, this.dropTarget);
                }
            }
        },

        getRowIndexAtPosition(mouseY) {
            // Find which row index corresponds to the given Y position - scope to this specific table.
            // Use [data-visible-idx] to select only data rows, excluding details rows and nested rows.
            // Exclude the sticky header clone so we always target the actual data table.
            const tableEl = this.dragId
                ? this.$el.querySelector(`table.${this.dragId}:not(.sticky-header)`)
                : this.$el.querySelector('table:not(.sticky-header)');
            if (!tableEl) return null;
            const tbody = tableEl.querySelector('tbody');
            if (!tbody) return null;
            const rows = tbody.querySelectorAll(':scope > tr[data-visible-idx]');
            
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rowRect = row.getBoundingClientRect();
                
                if (mouseY >= rowRect.top && mouseY <= rowRect.bottom) {
                    const visibleIdx = parseInt(row.getAttribute('data-visible-idx'), 10);
                    const visibleRowData = this.visibleRows[visibleIdx];
                    return visibleRowData ? visibleRowData.idx : null;
                }
            }
            
            return null;
        },

        selectRowRange(startIndex, endIndex) {
            // Clear current selections for this table
            tableRowSelectionState.clearArray(this.data);
            
            // Determine the actual range (handle reverse selection)
            const minIndex = Math.min(startIndex, endIndex);
            const maxIndex = Math.max(startIndex, endIndex);
            
            // Select all rows in the range
            for (let i = minIndex; i <= maxIndex; i++) {
                if (i >= 0 && i < this.data.length) {
                    tableRowSelectionState.addRow(i, this.data, this.dragId);
                }
            }
        },
        clearDropTarget() {
            this.dropTarget = { type: null, position: null, isAbove: false };
        },
        handleTableMouseMove(event) {
            // Store last known mouse position for drop target detection
            const newX = event.clientX;
            const newY = event.clientY;
            
            // Update global mouse position for drag follower when in drag/clipboard mode
            if (tableRowSelectionState.findingDropTargets || tableRowSelectionState.clipboardMode) {
                tableRowSelectionState.mouseX = newX;
                tableRowSelectionState.mouseY = newY;
            }
            
            // Only increment counter if mouse has actually moved
            if (this.lastKnownMouseX !== newX || this.lastKnownMouseY !== newY) {
                this.lastKnownMouseX = newX;
                this.lastKnownMouseY = newY;
                // Increment counter and check if it's the 6th move
                this.mouseMoveCounter++;
                if (this.mouseMoveCounter >= 6) {
                
                    // Only detect drop targets if dragging is active and this table can receive drops
                    if (tableRowSelectionState.findingDropTargets && this.draggable && tableRowSelectionState.dragId == this.dragId) {
                        this.mouseMoveCounter = 0; // Reset counter
                        this.findDropTargetAtCursor();
                    }
                }
            }
        },
        
        handleTableTouchStart(event) {
            // Treat touch start similar to mouse enter - indicates finger is in table
            this.isMouseInTable = true;
            this.mouseMoveCounter = 0;
        },
        
        handleTableTouchEnd(event) {
            // Don't clear drop targets if we're in the middle of a drag operation
            // The global touch end handler will handle that
            if (tableRowSelectionState.findingDropTargets) {
                return;
            }
            
            // Treat touch end similar to mouse leave - indicates finger left table
            this.isMouseInTable = false;
            // Always clear drop target when leaving table (if not dragging)
            this.clearDropTarget();
            tableRowSelectionState.clearDropTargetRegistration(this.data);
            this.lastKnownMouseX = null;
            this.lastKnownMouseY = null;
            this.mouseMoveCounter = 0;
        },
        
        updateAllEditableCells() {
            // Set contenteditable text for all editable cells to match data (only on mount or new row)
            if (!Array.isArray(this.data)) return; // <-- guard against null/undefined
            this.data.forEach((row, rowIndex) => {
                if (!row) return; // Skip undefined rows
                this.columns.forEach((column, colIndex) => {
                    if (column.editable) {
                        const refName = 'editable_' + rowIndex + '_' + colIndex;
                        const cell = this.$refs[refName];
                        const value = row[column.key] || '';
                        if (cell && cell instanceof HTMLElement) {
                            // Only update if cell is not focused
                            if (document.activeElement !== cell) {
                                cell.textContent = value;
                            }
                        } else if (Array.isArray(cell)) {
                            cell.forEach(el => {
                                if (el instanceof HTMLElement && document.activeElement !== el) {
                                    el.textContent = value;
                                }
                            });
                        }
                    }
                });
            });
        },
        unselectAllEditableCells() {
            // Remove focus from any editable cell. get editable cells by searching dom for contenteditable=true
            const editableCells = this.$el.querySelectorAll('[contenteditable="true"]');
            editableCells.forEach(cell => {
                if (cell instanceof HTMLElement && document.activeElement === cell) {
                    cell.blur();
                }
            });
        },
        toggleRowDetails(rowIndex) {
            if (this.expandedRows.has(rowIndex)) {
                this.expandedRows.delete(rowIndex);
            } else {
                this.expandedRows.add(rowIndex);
            }
        },
        
        isGroupMembersHiddenById(groupId) {
            // view mode (hideGroupMembers=true): default=closed, override=open → hidden when NOT overridden
            // edit mode (hideGroupMembers=false): default=open, override=closed → hidden when overridden
            return this.hideGroupMembers
                ? !this.overriddenGroups.has(groupId)
                : this.overriddenGroups.has(groupId);
        },

        isGroupMembersHidden(rowIndex) {
            const row = this.data[rowIndex];
            if (!row) return false;
            const metadata = tableRowSelectionState._getRowMetadata(row);
            const grouping = metadata?.grouping;
            if (!grouping?.isGroupMaster) return false;
            return this.isGroupMembersHiddenById(grouping.groupId);
        },

        toggleGroupCollapse(rowIndex) {
            const row = this.data[rowIndex];
            if (!row) return;
            const metadata = tableRowSelectionState._getRowMetadata(row);
            const grouping = metadata?.grouping;
            if (!grouping?.isGroupMaster) return;
            if (this.overriddenGroups.has(grouping.groupId)) {
                this.overriddenGroups.delete(grouping.groupId);
            } else {
                this.overriddenGroups.add(grouping.groupId);
            }
            this.overriddenGroups = new Set(this.overriddenGroups);
        },

        showGroup(rowIndex) {
            const row = this.data[rowIndex];
            if (!row) return;
            const metadata = tableRowSelectionState._getRowMetadata(row);
            const grouping = metadata?.grouping;
            if (!grouping?.isGroupMaster) return;
            // To open: in view mode add the exception (open), in edit mode remove the exception (not closed)
            if (this.hideGroupMembers) {
                this.overriddenGroups.add(grouping.groupId);
            } else {
                this.overriddenGroups.delete(grouping.groupId);
            }
            this.overriddenGroups = new Set(this.overriddenGroups);
        },

        getGroupToggleIcon(rowIndex) {
            // Returns 'expand' if group is collapsed, 'compress' if expanded
            return this.isGroupMembersHidden(rowIndex) ? 'expand' : 'compress';
        },

        getGroupToggleTitle(rowIndex) {
            // Returns appropriate title based on group state
            return this.isGroupMembersHidden(rowIndex) ? 'Expand Group' : 'Collapse Group';
        },
        
        isRowExpanded(rowIndex) {
            return this.expandedRows.has(rowIndex);
        },

        shouldShowDetailsContent(row, rowIndex) {
            if (this.forceDetails) {
                return !this.rowDetailsVisible || this.rowDetailsVisible(row);
            }
            return this.isRowExpanded(rowIndex);
        },
        
        handleOutsideClick(event) {
            const clickedElement = event.target;
            
            // Handle clearing selections when clicking outside selected rows
            if (tableRowSelectionState.getTotalSelectionCount() > 0) {
                // Don't clear if multiselect or drag just finished (within 100ms) - check global state
                const timeSinceMultiSelect = tableRowSelectionState.lastMultiSelectEndTime 
                    ? Date.now() - tableRowSelectionState.lastMultiSelectEndTime 
                    : Infinity;
                const timeSinceDrag = tableRowSelectionState.lastDragEndTime 
                    ? Date.now() - tableRowSelectionState.lastDragEndTime 
                    : Infinity;
                    
                if (timeSinceMultiSelect < 100 || timeSinceDrag < 100) {
                    return; // Skip clearing - multiselect or drag just finished
                }
                
                // Check if click was on a drag handle
                const clickedDragHandle = clickedElement.closest('.row-drag-handle');
                
                // Check if click was on the selection bubble
                const clickedSelectionBubble = clickedElement.closest('.selection-action-bubble');
                
                // Check if click was within a table header (to avoid interfering with header buttons like undo/redo)
                const clickedInHeader = clickedElement.closest('.content-header');
                
                // Clear selections for any click that isn't on a drag handle, selection bubble, or table header —
                // including clicks outside all tables. Drag handles are the only way to build/extend selections.
                if (!clickedDragHandle && !clickedSelectionBubble && !clickedInHeader) {
                    // Capture state before clearing for undo
                    if (tableRowSelectionState.currentRouteKey) {
                        // Get all unique arrays involved in selections
                        const selectedRows = tableRowSelectionState.getAllSelectedRows();
                        const uniqueArrays = [...new Set(selectedRows.map(r => r.sourceArray))];
                        
                        // Capture with selection state
                        undoRegistry.capture(
                            uniqueArrays,
                            tableRowSelectionState.currentRouteKey,
                            {
                                type: 'selection-toggle',
                                selectionState: tableRowSelectionState
                            }
                        );
                    }
                    
                    tableRowSelectionState.clearAll();
                    this.clickState.lastAnchorRowIndex = null;
                }
            }
            
            // Handle closing expanded details (existing functionality)
            if (this.expandedRows.size === 0) return;
            
            // Check if the click is outside any details area
            const detailsContainer = clickedElement.closest('.details-container');
            const detailsButton = clickedElement.closest('.details-toggle');
            
            // If click is not on a details button or inside a details container, close all expanded rows
            if (!detailsContainer && !detailsButton) {
                this.expandedRows.clear();
            }
        },
        
        // Serialize selected visible rows to a tab-delimited string for the OS clipboard.
        _serializeRowsToTsv() {
            const cols = this.clipboardExportColumns;
            if (cols.length === 0) return null;
            const allSelected = tableRowSelectionState.getAllSelectedRows();
            if (allSelected.length === 0) return null;
            return allSelected.map(({ row }) =>
                cols.map(col => {
                    const val = String(row[col.key] ?? '');
                    return val.replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, '');
                }).join('\t')
            ).join('\n');
        },

        // Handle the browser paste event — fires on Ctrl+V from any context.
        // Handle the paste event. If a compatible table is under the cursor, paste directly to the
        // top of it without showing the modal. If no compatible table is under the cursor, fall back
        // to the table-selection modal. Multiple draggable tables each register this listener;
        // externalPasteActive acts as a mutex so only the first handler to claim the event runs.
        _handleExternalPaste(event) {
            if (tableRowSelectionState.clipboardMode) return;
            if (tableRowSelectionState.externalPasteActive) return;

            const text = event.clipboardData?.getData('text/plain') || '';
            if (!text || !text.includes('\t')) return;

            const lines = text.trim().split('\n');
            const rows = lines
                .map(line => line.split('\t'))
                .filter(cells => cells.some(c => c.trim() !== ''));
            if (rows.length === 0) return;
            const colCount = rows[0].length;

            // Find the innermost .dynamic-table element currently under the cursor.
            // querySelectorAll returns elements in document order; the last match is the deepest.
            const hoveredTables = document.querySelectorAll('.dynamic-table:hover');
            const hoveredEl = hoveredTables.length > 0 ? hoveredTables[hoveredTables.length - 1] : null;

            if (hoveredEl) {
                for (const [dragId, instances] of tableRowSelectionState.activeTables) {
                    const inst = instances[0];
                    if (!inst || inst.$el !== hoveredEl) continue;
                    const cols = inst.pasteableColumns;
                    // Element matched but column count is incompatible — skip direct paste,
                    // fall through to modal so the user can see what happened.
                    if (cols.length < colCount) break;

                    // Compatible table found — drop at the top with no modal.
                    // Claim the mutex; release asynchronously after all paste listeners have run.
                    tableRowSelectionState.externalPasteActive = true;
                    Promise.resolve().then(() => { tableRowSelectionState.externalPasteActive = false; });

                    const items = rows.map(cells => {
                        // Build from an existing row's structure so keys like Items, Piece #,
                        // MetaData, etc. are preserved, preventing header-derivation loss.
                        const templateRow = inst.data.find(r => r != null) || null;
                        const row = {};
                        if (templateRow) {
                            Object.keys(templateRow).forEach(key => {
                                if (key === 'Items') {
                                    row.Items = [];
                                } else if (key !== 'AppData') {
                                    row[key] = '';
                                }
                            });
                        }
                        cols.forEach((col, i) => {
                            row[col.key] = i < cells.length ? cells[i].trim() : '';
                        });
                        return { clone: row, original: null };
                    });

                    event.preventDefault();
                    tableRowSelectionState._lastSeenExternalContent = text;
                    tableRowSelectionState.loadExternalClipboard(items, dragId);
                    tableRowSelectionState.dragTargetArray = inst.data;
                    tableRowSelectionState.completeClipboard({ type: 'header' });
                    return;
                }
            }

            // No compatible table under cursor — fall back to the selection modal.
            this._processExternalClipboardText(text);
        },

        // Handle tab-visibility change or window focus — re-checks the clipboard when the app regains focus.
        _handleVisibilityChange() {
            if (document.visibilityState === 'visible') this._readAndProcessExternalClipboard();
        },

        // Attempt a permission-gated passive clipboard read and process the result.
        async _readAndProcessExternalClipboard() {
            if (tableRowSelectionState.clipboardMode) return;
            if (tableRowSelectionState.externalPasteActive) return;
            if (tableRowSelectionState.clipboardReadPermission !== 'granted') return;
            try {
                const text = await navigator.clipboard.readText();
                if (text === tableRowSelectionState._lastSeenExternalContent) return;
                this._processExternalClipboardText(text);
            } catch (_e) {
                // Permission revoked since last check — update the stored state.
                tableRowSelectionState.clipboardReadPermission = 'prompt';
            }
        },

        // Core external clipboard logic: parse TSV, find compatible tables, show modal.
        // Returns true when it decides to show the paste modal (caller can preventDefault).
        _processExternalClipboardText(text) {
            if (!text || !text.includes('\t')) return false;
            if (tableRowSelectionState.clipboardMode) return false;
            if (text === tableRowSelectionState._appClipboardContent) return false;
            if (tableRowSelectionState.externalPasteActive) return false;

            // Parse rows and determine column count.
            const lines = text.trim().split('\n');
            const rows = lines
                .map(line => line.split('\t'))
                .filter(cells => cells.some(c => c.trim() !== ''));
            if (rows.length === 0) return false;
            const colCount = rows[0].length;

            // Find draggable tables whose editable columns can absorb the incoming data.
            const compatibleOptions = [];
            for (const [dragId, instances] of tableRowSelectionState.activeTables) {
                const inst = instances[0];
                if (!inst) continue;
                const cols = inst.pasteableColumns;
                if (cols.length >= colCount) {
                    compatibleOptions.push({
                        dragId,
                        label: inst.dragLabel || dragId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                        pasteableColumns: cols,
                        inst
                    });
                }
            }
            if (compatibleOptions.length === 0) return false;

            // Mark as seen and claim the mutex before proceeding.
            tableRowSelectionState._lastSeenExternalContent = text;
            tableRowSelectionState.externalPasteActive = true;

            const buildItems = (option) => rows.map(cells => {
                // Build from an existing row's structure so keys like Items, Piece #,
                // MetaData, etc. are preserved, preventing header-derivation loss.
                const templateRow = option.inst.data.find(r => r != null) || null;
                const row = {};
                if (templateRow) {
                    Object.keys(templateRow).forEach(key => {
                        if (key === 'Items') {
                            row.Items = [];
                        } else if (key !== 'AppData') {
                            row[key] = '';
                        }
                    });
                }
                option.pasteableColumns.forEach((col, i) => {
                    row[col.key] = i < cells.length ? cells[i].trim() : '';
                });
                return { clone: row, original: null };
            });

            // If only one table can receive the data, skip the modal and go straight to
            // clipboard mode. This eliminates one required Ctrl+V press for the common case.
            if (compatibleOptions.length === 1) {
                Promise.resolve().then(() => { tableRowSelectionState.externalPasteActive = false; });
                tableRowSelectionState.loadExternalClipboard(
                    buildItems(compatibleOptions[0]),
                    compatibleOptions[0].dragId
                );
                return true;
            }

            const onConfirm = (selectedDragId) => {
                tableRowSelectionState.externalPasteActive = false;
                const option = compatibleOptions.find(o => o.dragId === selectedDragId);
                if (!option) return;
                tableRowSelectionState.loadExternalClipboard(buildItems(option), selectedDragId);
            };

            const onCancel = () => {
                tableRowSelectionState.externalPasteActive = false;
            };

            modalManager.custom(ExternalPasteComponent, {
                rowCount: rows.length,
                dragIdOptions: compatibleOptions.map(o => ({ dragId: o.dragId, label: o.label })),
                onConfirm,
                onCancel,
                modalClass: 'small-menu'
            }, 'Paste from External Clipboard');

            return true;
        },

        handleEscapeKey(event) {
            // Handle Ctrl+C / Ctrl+X: activate clipboard mode for selected rows in this table
            if ((event.ctrlKey || event.metaKey) && (event.key === 'c' || event.key === 'x')) {
                if (
                    tableRowSelectionState.getArraySelectionCount(this.data) > 0 &&
                    !tableRowSelectionState.clipboardMode &&
                    this.draggable
                ) {
                    const mode = event.key === 'c' ? 'copy' : 'cut';
                    tableRowSelectionState.startClipboard(mode, this.dragId, this.currentRouteKey);
                    // Also write selected rows as TSV to the OS clipboard so Excel/Sheets can receive them.
                    const tsv = this._serializeRowsToTsv();
                    if (tsv !== null) {
                        navigator.clipboard.writeText(tsv).then(() => {
                            tableRowSelectionState._appClipboardContent = tsv;
                        }).catch(() => {});
                    }
                    event.preventDefault();
                }
                return;
            }

            // Handle keyboard shortcuts for table interactions
            if (event.key === 'Escape') {
                let handled = false;
                
                // Close all expanded details
                if (this.expandedRows.size > 0) {
                    this.expandedRows.clear();
                    handled = true;
                }
                
                // Clear all selections
                if (tableRowSelectionState.getTotalSelectionCount() > 0) {
                    // Capture state before clearing for undo
                    if (undoRegistry.currentRouteKey) {
                        const selectedRows = tableRowSelectionState.getAllSelectedRows();
                        const uniqueArrays = [...new Set(selectedRows.map(r => r.sourceArray))];
                        
                        undoRegistry.capture(
                            uniqueArrays,
                            undoRegistry.currentRouteKey,
                            {
                                type: 'selection-toggle',
                                selectionState: tableRowSelectionState
                            }
                        );
                    }
                    
                    tableRowSelectionState.clearAll();
                    handled = true;
                }
                
                if (handled) {
                    event.preventDefault();
                }
            }
            
            // Handle Delete key - mark selected rows for deletion
            if (event.key === 'Delete' || event.key === 'Backspace') {
                if (tableRowSelectionState.getTotalSelectionCount() > 0) {
                    // Capture state before clearing for undo
                    if (undoRegistry.currentRouteKey) {
                        const selectedRows = tableRowSelectionState.getAllSelectedRows();
                        const uniqueArrays = [...new Set(selectedRows.map(r => r.sourceArray))];
                        
                        undoRegistry.capture(
                            uniqueArrays,
                            undoRegistry.currentRouteKey,
                            {
                                type: 'selection-toggle',
                                selectionState: tableRowSelectionState
                            }
                        );
                    }

                    tableRowSelectionState.markSelectedForDeletion(true);
                    tableRowSelectionState.clearAll();
                    event.preventDefault();
                }
            }
        },

        hasDetailsSearchMatch(row) {
            if (!this.activeSearchValue || !this.activeSearchValue.trim()) {
                return false;
            }
            
            // Split search term into individual words for partial matching
            const searchWords = this.search.splitSearchTerms(this.activeSearchValue);
            
            // All search words must match somewhere in the details columns (AND logic)
            return searchWords.every(word => 
                this.detailsColumns.some(column => {
                    const value = row[column.key];
                    // Skip null/undefined values to prevent matching "undefined" or "null" strings
                    return value != null && String(value).toLowerCase().includes(word.toLowerCase());
                })
            );
        },
    },
    template: html `
        <div class="dynamic-table"
            @mouseenter="handleTableMouseEnter"
            @mouseleave="handleTableMouseLeave"
            @mousemove="handleTableMouseMove"
            @touchstart="handleTableTouchStart"
            @touchend="handleTableTouchEnd"
            @touchcancel="handleTableTouchEnd"
        >
            <!-- Drag Follower UI -->
            <div v-if="shouldShowDragFollower" class="drag-follower" :style="dragFollowerStyle">
                {{ dragFollowerText }}
            </div>
            <!-- Selection Action Bubble (outside table) -->
            <transition name="fade">
                <div v-if="shouldShowSelectionBubble" :selectedCount="selectedRowCount" class="selection-action-bubble" :style="selectionBubbleStyle">
                    <template v-if="isInClipboardMode">
                        <button @click="cancelClipboard" class="button-symbol white" title="Cancel (Esc)">🗙</button>
                    </template>
                    <template v-else>
                        <button v-if="newRow && hasConsecutiveSelection" @click="handleAddRowAbove" class="button-symbol white" title="Add Row Above">+</button>
                        <button @click="handleDeleteSelected" :class="['button-symbol', areAllSelectedMarkedForDeletion ? 'green' : 'red']" title="Delete Selected"><span v-if="areAllSelectedMarkedForDeletion" class="material-symbols-outlined">restore_from_trash</span><span v-else class="material-symbols-outlined">delete</span></button>
                        <button v-if="canCreateGroupFromSelection" @click="handleCreateGroupFromSelection" class="button-symbol white" title="Group Selected Rows">
                            <span class="material-symbols-outlined">cell_merge</span>
                        </button>
                        <button v-if="hasSelectedGroupMasters" @click="handleToggleSelectedGroups" class="button-symbol white" :title="groupToggleTitle">
                            <span class="material-symbols-outlined">{{ groupToggleSymbol }}</span>
                        </button>
                        <button @click="handleMoreOptions" class="button-symbol blue" title="More Row Options">☰</button>
                        <button v-if="newRow && hasConsecutiveSelection" @click="handleAddRowBelow" class="button-symbol white" title="Add Row Below">+</button>
                        <slot
                            name="selection-actions"
                            :selectedRows="getSelectedRows()"
                            :selectedIndices="getSelectedRowIndices()"
                        >
                            <!-- Default content if no slot provided -->
                        </slot>
                    </template>
                </div>
            </transition>
            
            <!-- Error State -->
            <div key="error-state" v-if="error" class="content-header red">
                <span>Error: {{ error }}</span>
            </div>

            <!-- Clipboard Permission Request Banner -->
            <div v-if="showClipboardPermissionPrompt" class="content-header">
                <span>Allow clipboard access to auto-detect copied data.</span>
                <div class="spacer"></div>
                <div class="button-bar">
                    <button @click="requestClipboardPermission" class="green">Enable</button>
                    <button @click="dismissClipboardPermissionPrompt" class="button-symbol white" title="Dismiss">🗙</button>
                </div>
            </div>

            <!-- Spacer: holds layout space when sticky wrapper becomes fixed -->
            <div class="sticky-header-spacer" :style="{ height: stickyActive ? stickySpacerHeight + 'px' : '0' }" aria-hidden="true"></div>

            <!-- Sticky wrapper: content-header + loading bar + thead clone (all fixed together when sticky) -->
            <div class="sticky-header-wrapper" :style="stickyActive ? { position: 'fixed', top: stickyTop + 'px', left: stickyLeft + 'px', width: stickyWidth + 'px', zIndex: '1000' } : {}">

                <div key="content-header" v-if="showHeader && (title || showRefresh || showSearch)" :class="['content-header', theme]">
                    <slot 
                        name="header-area"
                    ></slot>
                    <div class="spacer"></div>
                    <div v-if="showNewRowButton || showSaveButton || showRefresh || hamburgerMenuComponent || showSearch" :class="{'button-bar': showNewRowButton || showSaveButton || showRefresh || showSearch}">
                        <div v-if="showSearch" class="input-container">
                            <input
                                type="text"
                                v-model="search.searchValue.value"
                                @blur="search.handleBlur"
                                @keydown.esc="search.clearSearch"
                                placeholder="Find..."
                                class="search-input"
                            />
                            <button
                                v-if="search.searchValue.value"
                                @mousedown="search.clearSearch"
                                class="column-button"
                                title="Clear search"
                            >
                                🗙
                            </button>
                            <button
                                v-if="showSearch && hideRowsOnSearch"
                                @mousedown.prevent="hideRowsOnSearchLocal = !hideRowsOnSearchLocal"
                                class="column-button"
                                :title="hideRowsOnSearchLocal ? 'Show all rows' : 'Hide non-matching rows'"
                            >
                                <span class="material-symbols-outlined">{{ hideRowsOnSearchLocal ? 'visibility' : 'visibility_off' }}</span>
                            </button>
                        </div>
                        <button
                            v-if="showNewRowButton"
                            @click="$emit('new-row')"
                            :disabled="isLoading"
                            :class="theme"
                        >
                            New Item
                        </button>
                        <button
                            v-if="showSaveButton || allowSaveEvent"
                            @click="handleSave"
                            :disabled="isLoading || !allowSaveEvent"
                            class="green"
                        >
                            Save
                        </button>
                        <button 
                            v-if="showRefresh" 
                            @click="handleRefresh" 
                            :disabled="isLoading" 
                            :class="allowSaveEvent ? 'red' : ''"
                        >
                            {{ isLoading ? 'Loading...' : (allowSaveEvent ? 'Discard' : 'Refresh') }}
                        </button>
                        <button
                            v-if="hasEditableColumns"
                            @click="handleUndo"
                            :disabled="!canUndo"
                            class="button-symbol white"
                            title="Undo"
                        >
                            ⮢
                        </button>
                        <button
                            v-if="hasEditableColumns"
                            @click="handleRedo"
                            :disabled="!canRedo"
                            class="button-symbol white"
                            title="Redo"
                        >
                            ⮣
                        </button>
                        <button
                            v-if="hamburgerMenuComponent"
                            @click="handleHamburgerMenu"
                            title="More Table Options"
                            class="button-symbol white"
                        >
                            ☰
                        </button>
                        <ViewChangeComponent
                            v-if="viewModes && containerPath && navigateToPath"
                            :container-path="containerPath"
                            :navigate-to-path="navigateToPath"
                            :view-modes="viewModes"
                        />
                    </div>
                </div>

                <!-- Loading/Analysis Progress Indicator -->
                <LoadingBarComponent
                    :key="key + 'loading-progress'"
                    v-if="showHeader"
                    :is-loading="isLoading"
                    :is-analyzing="isAnalyzing"
                    :percent-complete="loadingProgress"
                />

                <!-- Sticky Header Clone (thead only, mirrors column widths) -->
                <table v-if="showStickyHeader" :class="{ editing: hasEditableColumns, [dragId]: dragId, 'sticky-header': true }">
                    <colgroup>
                        <col v-if="draggable" :style="stickyColumnWidths[0] ? { width: stickyColumnWidths[0] + 'px' } : { width: '20px' }" />
                        <col v-for="(column, colIdx) in visibleColumns" 
                            :key="column.key"
                            :style="stickyColumnWidths[draggable ? colIdx + 1 : colIdx] ? { width: stickyColumnWidths[draggable ? colIdx + 1 : colIdx] + 'px' } : (column.width ? { width: column.width + 'px' } : {})"
                            :class="column.columnClass || ''"
                        />
                        <col v-if="allowDetails && !forceDetails" :style="stickyColumnWidths[stickyColumnWidths.length - 1] ? { width: stickyColumnWidths[stickyColumnWidths.length - 1] + 'px' } : {}" />
                    </colgroup>
                    <thead :class="{ [theme]: true, active: theadActive }" @click="handleTheadTap($event)">
                        <tr>
                            <th v-if="draggable" class="spacer-cell" :style="stickyColumnWidths[0] ? { width: stickyColumnWidths[0] + 'px' } : {}"></th>
                            <th 
                                v-for="(column, colIdx) in visibleColumns" 
                                :key="column.key"
                                :class="getColumnFont(column)"
                                :title="column.title || column.label"
                                :style="stickyColumnWidths[draggable ? colIdx + 1 : colIdx] ? { width: stickyColumnWidths[draggable ? colIdx + 1 : colIdx] + 'px' } : {}"
                            >
                                <div>
                                    <span v-if="column.labelHtml" v-html="column.labelHtml"></span>
                                    <span v-else>{{ column.label }}</span>
                                    <button 
                                        v-if="isColumnSortable(column)"
                                        @click="handleSort(column.key)"
                                        :class="'column-button ' + (sortColumn === column.key ? 'active' : '')"
                                    >
                                        {{ getSortIcon(column.key) || '⭥' }}
                                    </button>
                                    <button 
                                        v-if="column.allowHide"
                                        @click="handleHideColumn(column.key)"
                                        class="column-button"
                                        title="Hide this column"
                                    >
                                        🗙
                                    </button>
                                </div>
                            </th>
                            <th v-if="allowDetails && !forceDetails" class="details-header" style="font-size: 20px; line-height: 1em;" :style="stickyColumnWidths[stickyColumnWidths.length - 1] ? { width: stickyColumnWidths[stickyColumnWidths.length - 1] + 'px' } : {}">&#9432;</th>
                        </tr>
                    </thead>
                </table>

            </div>

            <!-- Data Table (always render if draggable, even when empty) -->
            <div key="data-table" v-if="(data && data.length > 0) || (draggable && !isLoading)" :class="'table-wrapper' + (theme ? ' ' + theme : '')">
                <table :class="{ editing: hasEditableColumns, [dragId]: dragId }">
                    <colgroup>
                        <col v-if="draggable" :style="{ width: '20px' }" />
                        <col v-for="(column, colIdx) in visibleColumns" 
                            :key="column.key"
                            :style="column.width ? 'width:' + column.width + 'px' : ''"
                            :class="column.columnClass || ''"
                        />
                        <col v-if="allowDetails && !forceDetails" />
                    </colgroup>
                    <thead :class="{ [theme]: true, 'drop-target-header': dropTarget?.type === 'header', active: theadActive }" @click="handleClipboardHeaderClick($event); handleTheadTap($event)">
                        <tr>
                            <th v-if="draggable" class="spacer-cell"></th>
                            <th 
                                v-for="(column, colIdx) in visibleColumns" 
                                :key="column.key"
                                :class="getColumnFont(column)"
                                :title="column.title || column.label"
                            >
                                <div>
                                    <span v-if="column.labelHtml" v-html="column.labelHtml"></span>
                                    <span v-else>{{ column.label }}</span>
                                    <button 
                                        v-if="isColumnSortable(column)"
                                        @click="handleSort(column.key)"
                                        :class="'column-button ' + (sortColumn === column.key ? 'active' : '')"
                                    >
                                        {{ getSortIcon(column.key) || '⭥' }}
                                    </button>
                                    <button 
                                        v-if="column.allowHide"
                                        @click="handleHideColumn(column.key)"
                                        class="column-button"
                                        title="Hide this column"
                                    >
                                        🗙
                                    </button>
                                </div>
                            </th>
                            <th v-if="allowDetails && !forceDetails" class="details-header" style="font-size: 20px; line-height: 1em;" title="Details">&#9432;</th>
                        </tr>
                    </thead>
                    <tbody>
                        <template v-for="({ row, idx }, visibleIdx) in visibleRows" :key="idx">
                            <tr 
                                :data-visible-idx="visibleIdx"
                                :class="[
                                    {
                                        'dragging': isRowDragging(idx),
                                        'drag-over': false,
                                        'selected': hasEditableColumns && isRowSelected(idx),
                                        'analyzing': isRowAnalyzing(idx),
                                        'marked-for-deletion': isRowMarkedForDeletion(row),
                                        'in-group': isRowInGroup(idx),
                                        'is-group': isRowGroupMaster(idx),
                                        'drop-target-above': dropTarget?.type === 'between' && dropTarget?.visualTargetIndex === visibleIdx,
                                        'drop-target-below': dropTarget?.type === 'between' && dropTarget?.visualTargetIndex === visibleIdx + 1,
                                        'drop-target-onto': dropTarget?.type === 'onto' && dropTarget?.targetIndex === idx
                                    },
                                    getRowMetadataClass(row)
                                ]"
                                @click="handleClipboardRowClick(idx, visibleIdx, $event)"
                            >
                                <td v-if="draggable"
                                    class="row-drag-handle"
                                    draggable="true"
                                    @mousedown="handleDragHandleMouseDown(idx, $event)"
                                    @touchstart="handleDragHandleTouchStart(idx, $event)"
                                ></td>
                                <td 
                                    v-for="(column, colIndex) in mainTableColumns" 
                                    :key="column.key"
                                    :colspan="column.colspan || 1"
                                    :class="[getCellClass(row[column.key], column, idx, colIndex)]"
                                    v-show="!hideSet.has(column.key)"
                                    @click="handleEditableCellContainerClick(idx, colIndex, column, $event)"
                                >
                                    <div :class="['table-cell-container', { 'search-match': hasSearchMatch(row[column.key], column) }]">
                                        <!-- Editable number input -->
                                        <slot
                                            v-if="column.editable && column.format === 'number'"
                                            :row="row"
                                            :column="column">
                                            <span 
                                                v-if="dirtyCells[idx] && dirtyCells[idx][colIndex] && getOriginalDataForRow(row, idx) !== undefined && getOriginalDataForRow(row, idx)?.[column.key] !== row[column.key]"
                                                class="original-value clickable" 
                                                :title="'Click to revert to: ' + formatCellValue(getOriginalDataForRow(row, idx)?.[column.key], column)"
                                                @click="revertCellToOriginal(idx, colIndex, $event)"
                                            >
                                                {{ formatCellValue(getOriginalDataForRow(row, idx)?.[column.key], column) }} →
                                            </span>
                                            <input
                                                type="number"
                                                :value="Number.isFinite(parseFloat(row[column.key])) ? parseFloat(row[column.key]) : ''"
                                                :ref="'number_editable_' + idx + '_' + colIndex"
                                                @input="handleCellEdit(idx, colIndex, $event.target.value)"
                                            />
                                        </slot>
                                        <!-- Editable text div -->
                                        <div
                                            v-else-if="column.editable"
                                            contenteditable="true"
                                            :data-row-index="idx"
                                            :data-col-index="colIndex"
                                            @input="handleCellEdit(idx, colIndex, $event.target.textContent)"
                                            @focus="handleCellFocus(idx, colIndex, $event)"
                                            @blur="handleCellBlur(idx, colIndex, $event)"
                                            class="table-edit-textarea"
                                            :class="{ 'search-match': hasSearchMatch(row[column.key], column) }"
                                            :ref="'editable_' + idx + '_' + colIndex"
                                        ></div>
                                        <span v-if="column.editable && getOriginalDataForRow(row, idx) !== undefined" class="column-button-hint">
                                            {{ getOriginalDataForRow(row, idx)?.[column.key] || '(empty)' }}
                                        </span>
                                        <button
                                            v-if="column.editable && dirtyCells[idx] && dirtyCells[idx][colIndex] && column.format !== 'number' && getOriginalDataForRow(row, idx) !== undefined && getOriginalDataForRow(row, idx)?.[column.key] !== row[column.key]"
                                            @click="revertCellToOriginal(idx, colIndex, $event)"
                                            title="Revert to original value"
                                            class="column-button red">
                                            ⮢
                                        </button>
                                        <!-- Non-editable content (slot) -->
                                        <slot 
                                            v-if="!column.editable"
                                            :row="row" 
                                            :rowIndex="idx" 
                                            :column="column"
                                            :cellRowIndex="idx"
                                            :cellColIndex="colIndex"
                                            :onInnerTableDirty="(isDirty) => handleInnerTableDirty(isDirty, idx, colIndex)"
                                        >
                                            <span v-html="highlightSearchText(row[column.key], column)"></span>
                                        </slot>
                                        
                                        <!-- Additional cell content slot (for warnings, etc.) -->
                                        <slot 
                                            name="cell-extra"
                                            :row="row" 
                                            :rowIndex="idx" 
                                            :column="column"
                                            :cellRowIndex="idx"
                                            :cellColIndex="colIndex"
                                            :isGroupMembersHidden="isGroupMembersHidden(idx)"
                                            :showGroup="() => showGroup(idx)"
                                            :isEditable="column.editable"
                                        ></slot>
                                    </div>
                                </td>
                                <td v-if="allowDetails && !forceDetails" class="details-cell">
                                    <button 
                                        @click="toggleRowDetails(idx)"
                                        title="Toggle Details"
                                        :class="[theme, 'button-symbol', 'details-toggle', isRowExpanded(idx) ? 'expanded' : 'collapsed', hasDetailsSearchMatch(row) ? 'search-match' : '']"
                                    >
                                        {{ isRowExpanded(idx) ? '🗙' : '☷' }}
                                    </button>
                                </td>
                            </tr>
                            
                            <!-- Group expand/collapse button between rows -->
                            
                            <button
                                v-if="isRowGroupMaster(idx)"
                                class="column-button between-rows" 
                                :title="getGroupToggleTitle(idx)"
                                @click="toggleGroupCollapse(idx)"
                            >
                                <span class="material-symbols-outlined">{{ getGroupToggleIcon(idx) }}</span>
                            </button>
                            
                            <!-- Column-aligned detail rows (row-detail-rows slot) -->
                            <template v-if="allowDetails && $slots['row-detail-rows'] && shouldShowDetailsContent(row, idx)">
                                <slot name="row-detail-rows" :row="row" :rowIndex="idx" :visibleColumns="visibleColumns" />
                            </template>

                            <!-- Expandable single-cell details row (row-details slot) -->
                            <tr v-if="allowDetails && !$slots['row-detail-rows']" class="details-row-container">
                                <td v-if="draggable"></td>
                                <td :colspan="visibleColumns.length + (allowDetails && !forceDetails ? 1 : 0)" class="details-container">
                                    
                                    <div v-if="shouldShowDetailsContent(row, idx)" class="details-content">
                                        <!-- Auto-generated details from columns marked with details: true -->
                                        <div v-if="detailsColumns.length > 0" class="auto-details">
                                            <div class="details-grid">
                                                <div 
                                                    v-for="column in detailsColumns" 
                                                    :key="column.key"
                                                    class="detail-item"
                                                >
                                                    <label>{{ column.label }}:</label>
                                                    <span v-html="highlightSearchText(row[column.key], column)"></span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <!-- Custom slot content -->
                                        <slot 
                                            name="row-details"
                                            :row="row" 
                                            :rowIndex="idx"
                                            :isExpanded="isRowExpanded(idx)"
                                            :detailsColumns="detailsColumns"
                                        >
                                        </slot>
                                    </div>
                                </td>
                            </tr>
                        </template>
                        
                        <!-- Empty state row for draggable tables -->
                        <tr v-if="draggable && (!data || data.length === 0)" class="empty-drop-target">
                            <td class="spacer-cell"></td>
                            <td
                                :colspan="visibleColumns.length + (allowDetails && !forceDetails ? 1 : 0)"
                                class="empty-message"
                                style="text-align: center;"
                            >
                                {{ isLoading || isAnalyzing ? loadingMessage : emptyMessage }}
                            </td>
                        </tr>
                    </tbody>
                    <tfoot v-if="newRow">
                        <tr>
                            <td v-if="draggable" class="spacer-cell"></td>
                            <td 
                                :colspan="visibleColumns.length + (allowDetails && !forceDetails ? 1 : 0)" 
                                class="new-row-button"
                                title="Add new row"
                                @click="isInClipboardMode && dropTarget?.type === 'footer' ? completeClipboardAtCurrentTarget() : $emit('new-row')"
                            >
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        

            <!-- Loading State >
            <div key="loading-state" v-if="isLoading || isAnalyzing" class="content-footer loading-message">
                <img src="assets/loading.gif" alt="..."/>
                <p>{{ loadingMessage }}</p>
            </div-->

            <!-- Data Summary -->
            <div key="data-summary" v-if="showFooter" :class="['content-footer', theme ]">
                <p v-if="isLoading || isAnalyzing" class="loading-message">{{ loadingMessage }}</p>
                <p v-else-if="visibleRows.length < data.length">Showing {{ visibleRows.length }} of {{ data.length }} row{{ data.length !== 1 ? 's' : '' }}</p>
                <p v-else-if="!data || data.length === 0" class="empty-message">{{ emptyMessage }}</p>
                <p v-else>Showing {{ data.length }} row{{ data.length !== 1 ? 's' : '' }}</p>
                
                <button
                    v-if="activeSearchValue && hideRowsOnSearchLocal"
                    @click="search.clearSearch"
                    class="card"
                    style="width: auto;"
                    title="Clear filter"
                >
                    🗙 Clear filter
                </button>
                
                
            </div>
            <div class="content-footer red"  v-if="showFooter && allowSaveEvent"><p>There are unsaved changes in this table.</p></div>
        </div>
    `
};

