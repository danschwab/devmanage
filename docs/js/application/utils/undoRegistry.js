// Global undo/redo registry for table operations
// Route-scoped undo stacks that maintain separate histories per navigation path

export const undoRegistry = Vue.reactive({
    // Route-scoped undo/redo stacks
    undoStacksByRoute: new Map(), // routeKey -> { undoStack: [], redoStack: [], arrayRefs: Set }
    
    // Current active route
    currentRouteKey: null,
    
    // Configuration
    maxUndoSteps: 50, // Maximum undo steps per route
    maxRouteStacks: 10, // Maximum number of routes to track (LRU eviction)
    
    // Track current edit capture to prevent duplicate captures
    _currentEditCapture: null, // { routeKey, tableId, rowIndex, colIndex }
    
    // Get or create route stacks with LRU eviction
    _getRouteStacks(routeKey) {
        if (!this.undoStacksByRoute.has(routeKey)) {
            this.undoStacksByRoute.set(routeKey, {
                undoStack: [],
                redoStack: [],
                arrayRefs: new Set() // Track which arrays this route uses
            });
            
            // LRU eviction if exceeding maxRouteStacks
            if (this.undoStacksByRoute.size > this.maxRouteStacks) {
                const firstKey = this.undoStacksByRoute.keys().next().value;
                const evictedStacks = this.undoStacksByRoute.get(firstKey);
                console.log(`[Undo] Evicting route '${firstKey}' - had ${evictedStacks.arrayRefs.size} arrays with ${evictedStacks.undoStack.length} undo states`);
                this.undoStacksByRoute.delete(firstKey);
                // Snapshots are automatically GC'd when route is deleted
            }
        }
        return this.undoStacksByRoute.get(routeKey);
    },
    
    // Set the active route for undo/redo operations
    setActiveRoute(routeKey) {
        this.currentRouteKey = routeKey;
        this._currentEditCapture = null; // Clear edit capture when route changes
        console.log(`[Undo] Active route set to: ${routeKey}`);
    },
    
    // Unified capture function for all operations
    // Can handle single array (cell edits) or multiple arrays (drags, deletions)
    capture(arrays, routeKey, options = {}) {
        const {
            type = 'operation',
            cellInfo = null,
            preventDuplicates = false
        } = options;
        
        // Normalize arrays to always be an array of data arrays
        // Check if arrays is already an array of arrays (has _tableId property) or a single data array
        let arrayList;
        if (Array.isArray(arrays)) {
            // Check if this is an array of data arrays or a single data array
            // A data array will have _tableId property or first element will be a plain object (row)
            const isArrayOfArrays = arrays.length > 0 && arrays[0] && typeof arrays[0] === 'object' && arrays[0]._tableId !== undefined;
            arrayList = isArrayOfArrays ? arrays : [arrays];
        } else {
            arrayList = [arrays];
        }
        
        if (!routeKey || !arrayList || arrayList.length === 0) {
            console.warn('[Undo] Cannot capture - missing routeKey or arrays');
            return;
        }
        
        // Duplicate prevention for cell edits
        if (preventDuplicates && cellInfo) {
            const tableId = arrayList[0]._tableId || 'unknown';
            if (this._currentEditCapture &&
                this._currentEditCapture.routeKey === routeKey &&
                this._currentEditCapture.tableId === tableId &&
                this._currentEditCapture.rowIndex === cellInfo.rowIndex &&
                this._currentEditCapture.colIndex === cellInfo.colIndex) {
                console.log(`[Undo] Skipping duplicate capture for cell [${cellInfo.rowIndex}, ${cellInfo.colIndex}]`);
                return;
            }
        }
        
        const stacks = this._getRouteStacks(routeKey);
        
        // Create snapshots of all involved arrays (excluding AppData)
        const arraySnapshots = arrayList.map(arr => ({
            tableId: arr._tableId || 'unknown',
            arrayRef: arr,
            snapshot: this._createSnapshotWithoutAppData(arr)
        }));
        
        const snapshot = {
            type,
            timestamp: Date.now(),
            routeKey,
            cellInfo,
            arrays: arraySnapshots
        };
        
        // Add to undo stack
        stacks.undoStack.push(snapshot);
        
        // Clear redo stack (new action invalidates redo)
        stacks.redoStack = [];
        
        // Register array references
        arrayList.forEach(arr => stacks.arrayRefs.add(arr));
        
        // Limit stack size
        if (stacks.undoStack.length > this.maxUndoSteps) {
            stacks.undoStack.shift();
        }
        
        // Mark cell as captured if this was a cell edit with duplicate prevention
        if (preventDuplicates && cellInfo) {
            const tableId = arrayList[0]._tableId || 'unknown';
            this._currentEditCapture = { routeKey, tableId, rowIndex: cellInfo.rowIndex, colIndex: cellInfo.colIndex };
        }
        
        const opDesc = cellInfo ? `cell edit [${cellInfo.rowIndex}, ${cellInfo.colIndex}]` : `${type} with ${arrayList.length} array(s)`;
        console.log(`[Undo] Captured ${opDesc} for route: ${routeKey} (stack: ${stacks.undoStack.length})`);
    },
    
    // Clear current edit capture (called on blur or route change)
    clearCurrentEditCapture() {
        this._currentEditCapture = null;
    },
    
    // Create a snapshot of an array without AppData (to avoid interfering with analytics)
    _createSnapshotWithoutAppData(array) {
        return array.map(row => {
            if (!row) return row;
            const rowCopy = { ...row };
            delete rowCopy.AppData; // Remove AppData from snapshot
            return rowCopy;
        });
    },
    
    // Restore a snapshot while preserving current AppData
    _restoreSnapshotPreservingAppData(targetArray, snapshot) {
        // Save current AppData for each row
        const currentAppData = targetArray.map(row => row?.AppData);
        
        // Clear and restore from snapshot
        targetArray.splice(0, targetArray.length, ...snapshot);
        
        // Restore AppData for rows that existed before and still exist
        for (let i = 0; i < Math.min(currentAppData.length, targetArray.length); i++) {
            if (currentAppData[i] && targetArray[i]) {
                targetArray[i].AppData = currentAppData[i];
            }
        }
    },
    
    // Undo last operation for current route
    undo() {
        if (!this.currentRouteKey) {
            console.warn('[Undo] No active route set');
            return false;
        }
        
        const stacks = this._getRouteStacks(this.currentRouteKey);
        
        if (stacks.undoStack.length === 0) {
            console.log('[Undo] Nothing to undo');
            return false;
        }
        
        // Blur any focused contenteditable cell before undo
        if (document.activeElement && document.activeElement.contentEditable === 'true') {
            document.activeElement.blur();
        }
        
        // Pop state from undo stack
        const state = stacks.undoStack.pop();
        
        // Save current state to redo stack before restoring (excluding AppData)
        const redoState = {
            type: state.type,
            timestamp: Date.now(),
            routeKey: state.routeKey,
            cellInfo: state.cellInfo,
            arrays: state.arrays.map(arrSnapshot => ({
                tableId: arrSnapshot.tableId,
                arrayRef: arrSnapshot.arrayRef,
                snapshot: this._createSnapshotWithoutAppData(arrSnapshot.arrayRef)
            }))
        };
        stacks.redoStack.push(redoState);
        
        // Restore state while preserving AppData
        state.arrays.forEach(arrSnapshot => {
            const targetArray = arrSnapshot.arrayRef;
            const snapshot = arrSnapshot.snapshot;
            
            // Restore snapshot while preserving current AppData
            this._restoreSnapshotPreservingAppData(targetArray, snapshot);
        });
        
        // Clear current edit capture so subsequent edits can create new snapshots
        this._currentEditCapture = null;
        
        console.log(`[Undo] Undid ${state.type} operation (undo: ${stacks.undoStack.length}, redo: ${stacks.redoStack.length})`);
        return true;
    },
    
    // Redo last undone operation for current route
    redo() {
        if (!this.currentRouteKey) {
            console.warn('[Undo] No active route set');
            return false;
        }
        
        const stacks = this._getRouteStacks(this.currentRouteKey);
        
        if (stacks.redoStack.length === 0) {
            console.log('[Undo] Nothing to redo');
            return false;
        }
        
        // Blur any focused contenteditable cell before redo
        if (document.activeElement && document.activeElement.contentEditable === 'true') {
            document.activeElement.blur();
        }
        
        // Pop state from redo stack
        const state = stacks.redoStack.pop();
        
        // Save current state to undo stack before restoring (excluding AppData)
        const undoState = {
            type: state.type,
            timestamp: Date.now(),
            routeKey: state.routeKey,
            cellInfo: state.cellInfo,
            arrays: state.arrays.map(arrSnapshot => ({
                tableId: arrSnapshot.tableId,
                arrayRef: arrSnapshot.arrayRef,
                snapshot: this._createSnapshotWithoutAppData(arrSnapshot.arrayRef)
            }))
        };
        stacks.undoStack.push(undoState);
        
        // Restore state while preserving AppData
        state.arrays.forEach(arrSnapshot => {
            const targetArray = arrSnapshot.arrayRef;
            const snapshot = arrSnapshot.snapshot;
            
            // Restore snapshot while preserving current AppData
            this._restoreSnapshotPreservingAppData(targetArray, snapshot);
        });
        
        // Clear current edit capture so subsequent edits can create new snapshots
        this._currentEditCapture = null;
        
        console.log(`[Undo] Redid ${state.type} operation (undo: ${stacks.undoStack.length}, redo: ${stacks.redoStack.length})`);
        return true;
    },
    
    // Get memory usage statistics
    getMemoryStats() {
        const stats = {
            totalRoutes: this.undoStacksByRoute.size,
            currentRoute: this.currentRouteKey,
            routes: []
        };
        
        for (const [routeKey, stacks] of this.undoStacksByRoute) {
            const routeStats = {
                routeKey,
                undoCount: stacks.undoStack.length,
                redoCount: stacks.redoStack.length,
                arrayCount: stacks.arrayRefs.size,
                estimatedSize: 0
            };
            
            // Estimate size of snapshots
            stacks.undoStack.forEach(state => {
                state.arrays.forEach(arrSnapshot => {
                    const jsonStr = JSON.stringify(arrSnapshot.snapshot);
                    routeStats.estimatedSize += jsonStr.length;
                });
            });
            
            stacks.redoStack.forEach(state => {
                state.arrays.forEach(arrSnapshot => {
                    const jsonStr = JSON.stringify(arrSnapshot.snapshot);
                    routeStats.estimatedSize += jsonStr.length;
                });
            });
            
            stats.routes.push(routeStats);
        }
        
        return stats;
    },
    
    // Get arrays shared across multiple routes
    getSharedArrays() {
        const arrayToRoutes = new Map();
        
        for (const [routeKey, stacks] of this.undoStacksByRoute) {
            for (const arrayRef of stacks.arrayRefs) {
                if (!arrayToRoutes.has(arrayRef)) {
                    arrayToRoutes.set(arrayRef, new Set());
                }
                arrayToRoutes.get(arrayRef).add(routeKey);
            }
        }
        
        // Return only arrays used in multiple routes
        return Array.from(arrayToRoutes.entries())
            .filter(([arr, routes]) => routes.size > 1)
            .map(([arr, routes]) => ({
                tableId: arr._tableId,
                routes: Array.from(routes)
            }));
    }
});
