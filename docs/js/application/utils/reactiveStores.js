// Modular reactive store factory for any generic data, with async API calls for load and save
export function createReactiveStore(apiCall = null, saveCall = null, apiArgs = []) {
    // Helper to recursively add marked-for-deletion to all objects in an array (and nested arrays)
    function markForDeletionInit(arr) {
        if (!Array.isArray(arr)) return arr;
        return arr.map(obj => {
            if (obj && typeof obj === 'object') {
                if (!('marked-for-deletion' in obj)) obj['marked-for-deletion'] = false;
                // Recursively mark nested arrays (e.g., Items)
                Object.keys(obj).forEach(key => {
                    if (Array.isArray(obj[key])) {
                        obj[key] = markForDeletionInit(obj[key]);
                    }
                });
            }
            return obj;
        });
    }

    const store = Vue.reactive({
        data: [],
        originalData: [],
        isLoading: false,
        loadingMessage: '',
        error: null,
        setData(newData) {
            // Deep clone and initialize marked-for-deletion
            this.data = markForDeletionInit(JSON.parse(JSON.stringify(newData)));
        },
        setOriginalData(newOriginalData) {
            // Deep clone and initialize marked-for-deletion
            this.originalData = markForDeletionInit(JSON.parse(JSON.stringify(newOriginalData)));
        },
        setError(err) {
            this.error = err;
        },
        setLoading(isLoading, message = '') {
            this.isLoading = isLoading;
            this.loadingMessage = message;
        },
        reset() {
            this.data = [];
            this.originalData = [];
            this.isLoading = false;
            this.loadingMessage = '';
            this.error = null;
        },
        async load(message = 'Loading data...') {
            this.reset();
            if (typeof apiCall !== 'function') {
                this.setError('No API call provided');
                return;
            }
            this.setLoading(true, message);
            this.setError(null);
            try {
                const result = await apiCall(...apiArgs);
                this.setOriginalData(result);
                this.setData(result);
            } catch (err) {
                this.setError(err.message || 'Failed to load data');
                this.setOriginalData([]);
                this.setData([]);
            } finally {
                this.setLoading(false, '');
            }
        },
        async save(message = 'Saving data...') {
            if (typeof saveCall !== 'function') {
                this.setError('No save API call provided');
                return;
            }
            this.setLoading(true, message);
            this.setError(null);
            try {
                // Remove all objects marked for deletion before saving
                const cleanData = removeMarkedForDeletion(this.data);
                const result = await saveCall(cleanData, ...apiArgs);
                // now remove the rows marked for deletion from live data without breaking reactivity:
                this.removeMarkedRows();
                return result;
            } catch (err) {
                this.setError(err.message || 'Failed to save data');
                return false;
            } finally {
                this.setLoading(false, '');
                this.reloadOriginalData();
            }
        },
        async reloadOriginalData() {
            this.setLoading(true, 'Reloading data...');
            if (typeof apiCall !== 'function') {
                this.setOriginalData([]);
                console.log('[ReactiveStore] reloadOriginalData: No API call provided');
                return [];
            }
            try {
                const result = await apiCall(...apiArgs);
                this.setOriginalData(result);
                console.log('[ReactiveStore] reloadOriginalData: Loaded', result);
                return this.originalData;
            } catch (err) {
                this.setOriginalData([]);
                console.log('[ReactiveStore] reloadOriginalData: Failed', err);
                return [];
            } finally {
                this.setLoading(false, '');
            }
        },
        // Mark/unmark for deletion by index
        markRowForDeletion(idx, value = true) {
            if (this.data[idx]) {
                this.data[idx]['marked-for-deletion'] = value;
                // If marking for deletion and row is empty, remove immediately
                if (value) {
                    const row = this.data[idx];
                    // Check if all fields (except 'marked-for-deletion') are empty/falsy
                    const hasContent = Object.keys(row).some(
                        key => key !== 'marked-for-deletion' && !!row[key]
                    );
                    if (!hasContent) {
                        this.data.splice(idx, 1);
                    }
                }
            }
        },
        // Remove all rows marked for deletion (and nested arrays)
        removeMarkedRows() {
            this.data = removeMarkedForDeletion(this.data);
        },
        addRow(row, fieldNames = null) {
            // Ensure marked-for-deletion is set and nested arrays are initialized
            if (row && typeof row === 'object') {
                if (!('marked-for-deletion' in row)) row['marked-for-deletion'] = false;
                // Initialize fields to empty string if fieldNames provided
                if (Array.isArray(fieldNames)) {
                    row = initializeRowFields(row, fieldNames);
                }
                Object.keys(row).forEach(key => {
                    if (Array.isArray(row[key])) {
                        row[key] = markForDeletionInit(row[key]);
                    }
                });
            }
            this.data.push(row);
        },
        addNestedRow(parentIdx, key, row, fieldNames = null) {
            // Add a row to a nested array (e.g., Items)
            if (
                Array.isArray(this.data) &&
                this.data[parentIdx] &&
                Array.isArray(this.data[parentIdx][key])
            ) {
                if (row && typeof row === 'object') {
                    if (!('marked-for-deletion' in row)) row['marked-for-deletion'] = false;
                    // Initialize fields to empty string if fieldNames provided
                    if (Array.isArray(fieldNames)) {
                        row = initializeRowFields(row, fieldNames);
                    }
                    Object.keys(row).forEach(k => {
                        if (Array.isArray(row[k])) {
                            row[k] = markForDeletionInit(row[k]);
                        }
                    });
                }
                this.data[parentIdx][key].push(row);
            }
        },
    });

    // Helper to remove objects marked for deletion recursively
    function removeMarkedForDeletion(arr) {
        if (!Array.isArray(arr)) return arr;
        return arr
            .filter(obj => !(obj && obj['marked-for-deletion']))
            .map(obj => {
                if (obj && typeof obj === 'object') {
                    const newObj = { ...obj };
                    Object.keys(newObj).forEach(key => {
                        if (Array.isArray(newObj[key])) {
                            newObj[key] = removeMarkedForDeletion(newObj[key]);
                        }
                    });
                    return newObj;
                }
                return obj;
            });
    }

    // Helper to initialize all fields in a row with empty strings
    function initializeRowFields(row, fieldNames) {
        if (!row || typeof row !== 'object' || !Array.isArray(fieldNames)) return row;
        fieldNames.forEach(field => {
            if (!(field in row)) row[field] = '';
        });
        return row;
    }

    return store;
}

// Central registry for reactive stores, keyed by apiCall.toString() + JSON.stringify(apiArgs)
const reactiveStoreRegistry = Vue.reactive({});

/**
 * Returns a reactive store instance for the given apiCall and apiArgs.
 * If a store for the same apiCall/apiArgs exists, returns it.
 * Otherwise, creates a new store and registers it.
 * @param {Function} apiCall - The API function to use for loading data
 * @param {Function} saveCall - The API function to use for saving data
 * @param {Array} apiArgs - Arguments to pass to the API function
 * @returns {Object} The reactive store instance
 */
export function getReactiveStore(apiCall, saveCall = null, apiArgs = []) {
    const key = apiCall?.toString() + ':' + (saveCall?.toString() || '') + ':' + JSON.stringify(apiArgs);
    if (!reactiveStoreRegistry[key]) {
        reactiveStoreRegistry[key] = createReactiveStore(apiCall, saveCall, apiArgs);
        reactiveStoreRegistry[key].load('Loading data...'); // Initial load
    }
    return reactiveStoreRegistry[key];
    
}

// Example usage:
// const inventoryStore = createReactiveStore();
// const packlistStore = createReactiveStore();

// Export factory for use in components
export default {
    getReactiveStore
};