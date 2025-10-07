// Modular reactive store factory for any generic data, with async API calls for load and save
export function createReactiveStore(apiCall = null, saveCall = null, apiArgs = []) {
    // Helper to recursively add AppData to all objects in an array (and nested arrays)
    function appDataInit(arr) {
        if (!Array.isArray(arr)) return arr;
        return arr.map(obj => {
            if (obj && typeof obj === 'object') {
                if (!('AppData' in obj)) obj['AppData'] = {};
                // Recursively initialize nested arrays (e.g., Items)
                Object.keys(obj).forEach(key => {
                    if (Array.isArray(obj[key])) {
                        obj[key] = appDataInit(obj[key]);
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
        isAnalyzing: false,
        analysisProgress: 0,
        analysisMessage: '',
        setData(newData) {
            // Deep clone and initialize AppData
            this.data = appDataInit(JSON.parse(JSON.stringify(newData)));
        },
        setOriginalData(newOriginalData) {
            // Deep clone and initialize AppData
            this.originalData = appDataInit(JSON.parse(JSON.stringify(newOriginalData)));
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
            this.isAnalyzing = false;
            this.analysisProgress = 0;
            this.analysisMessage = '';
        },
        async load(message = 'Loading data...') {
            this.reset();
            if (typeof apiCall !== 'function') {
                this.setError('No API call provided');
                // Initialize with empty array to allow dynamic property addition
                this.setOriginalData([]);
                this.setData([]);
                return;
            }
            this.setLoading(true, message);
            this.setError(null);
            try {
                const result = await apiCall(...apiArgs);
                // Handle null, undefined, or empty results by initializing empty arrays
                const dataToSet = (result && Array.isArray(result)) ? result : [];
                this.setOriginalData(dataToSet);
                this.setData(dataToSet);
            } catch (err) {
                this.setError(err.message || 'Failed to load data');
                // Initialize with empty arrays to allow dynamic property addition
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
                const cleanData = removeAppData(this.data);
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
                // Handle null, undefined, or empty results by initializing empty arrays
                const dataToSet = (result && Array.isArray(result)) ? result : [];
                this.setOriginalData(dataToSet);
                return this.originalData;
            } catch (err) {
                this.setOriginalData([]);
                console.log('[ReactiveStore] reloadOriginalData: Failed', err);
                return [];
            } finally {
                this.setLoading(false, '');
            }
        },
        // Mark/unmark for deletion by index using AppData
        markRowForDeletion(idx, value = true) {
            if (this.data[idx]) {
                if (!this.data[idx].AppData) this.data[idx].AppData = {};
                this.data[idx].AppData['marked-for-deletion'] = value;
                // If marking for deletion and row is empty, remove immediately
                if (value) {
                    const row = this.data[idx];
                    // Check if all fields (except 'AppData') are empty/falsy
                    const hasContent = Object.keys(row).some(
                        key => key !== 'AppData' && !!row[key]
                    );
                    if (!hasContent) {
                        this.data.splice(idx, 1);
                    }
                }
            }
        },
        // Remove all rows marked for deletion (and nested arrays)
        removeMarkedRows() {
            this.data = removeAppData(this.data);
        },
        addRow(row, fieldNames = null) {
            // Ensure AppData is set and nested arrays are initialized
            if (row && typeof row === 'object') {
                if (!('AppData' in row)) row['AppData'] = {};
                // Initialize fields to empty string if fieldNames provided
                if (Array.isArray(fieldNames)) {
                    row = initializeRowFields(row, fieldNames);
                }
                Object.keys(row).forEach(key => {
                    if (Array.isArray(row[key])) {
                        row[key] = appDataInit(row[key]);
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
                    if (!('AppData' in row)) row['AppData'] = {};
                    // Initialize fields to empty string if fieldNames provided
                    if (Array.isArray(fieldNames)) {
                        row = initializeRowFields(row, fieldNames);
                    }
                    Object.keys(row).forEach(k => {
                        if (Array.isArray(row[k])) {
                            row[k] = appDataInit(row[k]);
                        }
                    });
                }
                this.data[parentIdx][key].push(row);
            }
        },
        // AppData utility methods for managing arbitrary key-value pairs
        setAppData(rowIdx, key, value) {
            if (this.data[rowIdx]) {
                if (!this.data[rowIdx].AppData) this.data[rowIdx].AppData = {};
                this.data[rowIdx].AppData[key] = value;
            }
        },
        getAppData(rowIdx, key = null) {
            if (!this.data[rowIdx] || !this.data[rowIdx].AppData) return key ? null : {};
            return key ? this.data[rowIdx].AppData[key] : this.data[rowIdx].AppData;
        },
        setNestedAppData(parentIdx, nestedKey, itemIdx, key, value) {
            if (this.data[parentIdx] && 
                Array.isArray(this.data[parentIdx][nestedKey]) && 
                this.data[parentIdx][nestedKey][itemIdx]) {
                if (!this.data[parentIdx][nestedKey][itemIdx].AppData) {
                    this.data[parentIdx][nestedKey][itemIdx].AppData = {};
                }
                this.data[parentIdx][nestedKey][itemIdx].AppData[key] = value;
            }
        },
        getNestedAppData(parentIdx, nestedKey, itemIdx, key = null) {
            if (!this.data[parentIdx] || 
                !Array.isArray(this.data[parentIdx][nestedKey]) || 
                !this.data[parentIdx][nestedKey][itemIdx] ||
                !this.data[parentIdx][nestedKey][itemIdx].AppData) {
                return key ? null : {};
            }
            const appData = this.data[parentIdx][nestedKey][itemIdx].AppData;
            return key ? appData[key] : appData;
        },
        async runAnalysis(analysisSteps, options = {}) {
            const {
                batchSize = 10,
                delayMs = 50,
                skipIfAnalyzed = true
            } = options;

            // Don't run if already analyzing
            if (this.isAnalyzing) {
                return;
            }

            this.isAnalyzing = true;
            this.analysisProgress = 0;
            this.analysisMessage = 'Starting analysis...';

            try {
                const data = this.data;
                if (!Array.isArray(data) || data.length === 0) {
                    return;
                }

                // Initialize AppData if needed
                data.forEach(item => {
                    if (!item.AppData) item.AppData = {};
                    if (skipIfAnalyzed && item.AppData._analyzed) return;
                    item.AppData._analyzing = true;
                });

                // Run each analysis step
                for (let stepIndex = 0; stepIndex < analysisSteps.length; stepIndex++) {
                    const { fn, message } = analysisSteps[stepIndex];
                    this.analysisMessage = message;

                    // Process items in batches
                    for (let i = 0; i < data.length; i += batchSize) {
                        const batch = data.slice(i, i + batchSize);
                        
                        // Run analysis function on batch
                        await Promise.all(batch.map(async (item) => {
                            if (skipIfAnalyzed && item.AppData._analyzed) return;
                            
                            try {
                                // Call analysis function - it should mutate item.AppData
                                await fn(item, this);
                            } catch (error) {
                                console.error('[ProgressiveAnalysis] Error analyzing item:', error);
                                item.AppData._error = error.message;
                            }
                        }));

                        // Update progress
                        const stepProgress = (stepIndex / analysisSteps.length) + 
                                           ((i + batchSize) / data.length) * (1 / analysisSteps.length);
                        this.analysisProgress = Math.min(stepProgress * 100, 100);

                        // Small delay to keep UI responsive
                        if (delayMs > 0) {
                            await new Promise(resolve => setTimeout(resolve, delayMs));
                        }
                    }
                }

                // Mark all items as analyzed
                data.forEach(item => {
                    if (item.AppData) {
                        item.AppData._analyzing = false;
                        item.AppData._analyzed = true;
                    }
                });

                this.analysisProgress = 100;
                this.analysisMessage = 'Analysis complete';

            } catch (error) {
                console.error('[ProgressiveAnalysis] Analysis failed:', error);
                this.analysisMessage = `Analysis failed: ${error.message}`;
            } finally {
                this.isAnalyzing = false;
                // Clear progress after a delay
                setTimeout(() => {
                    this.analysisProgress = 0;
                    this.analysisMessage = '';
                }, 2000);
            }
        }
    });

    // Helper to strip AppData from objects (including filtering out items marked for deletion)
    function removeAppData(arr) {
        if (!Array.isArray(arr)) return arr;
        return arr
            .filter(obj => {
                // Filter out items marked for deletion
                if (obj && typeof obj === 'object' && obj.AppData && obj.AppData['marked-for-deletion']) {
                    return false;
                }
                return true;
            })
            .map(obj => {
                if (obj && typeof obj === 'object') {
                    const newObj = { ...obj };
                    // Remove AppData before sending to API
                    delete newObj.AppData;
                    // Recursively process nested arrays
                    Object.keys(newObj).forEach(key => {
                        if (Array.isArray(newObj[key])) {
                            newObj[key] = removeAppData(newObj[key]);
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
 * @param {boolean} autoLoad - Whether to automatically load data on first creation (default: true)
 * @returns {Object} The reactive store instance
 */
export function getReactiveStore(apiCall, saveCall = null, apiArgs = [], autoLoad = true) {
    const key = apiCall?.toString() + ':' + (saveCall?.toString() || '') + ':' + JSON.stringify(apiArgs);
    
    if (!reactiveStoreRegistry[key]) {
        reactiveStoreRegistry[key] = createReactiveStore(apiCall, saveCall, apiArgs);
        
        if (autoLoad) {
            // Initial load with proper error handling for empty/null responses
            reactiveStoreRegistry[key].load('Loading data...').catch(err => {
                console.warn('[ReactiveStore] Initial load failed:', err);
                // Store will have empty arrays initialized, allowing dynamic property addition
            });
        } else {
            // Initialize with empty arrays to allow dynamic property addition
            reactiveStoreRegistry[key].setOriginalData([]);
            reactiveStoreRegistry[key].setData([]);
        }
    }
    
    return reactiveStoreRegistry[key];
}

/**
 * Helper to create analysis functions that use the existing API
 * @param {Function} apiFunction - Existing API function to call
 * @param {string} resultKey - Key to store result in AppData
 * @param {Function} itemIdentifierFn - Function to extract identifier from item
 */
export function createApiAnalysisStep(apiFunction, resultKey, itemIdentifierFn) {
    return async (item, reactiveStore) => {
        const identifier = itemIdentifierFn(item);
        if (!identifier) return;

        try {
            const result = await apiFunction(identifier);
            item.AppData[resultKey] = result;
        } catch (error) {
            item.AppData[`${resultKey}_error`] = error.message;
        }
    };
}

/**
 * Helper to create analysis functions that process item data locally
 * @param {Function} processingFn - Function that takes (item) and returns result
 * @param {string} resultKey - Key to store result in AppData
 */
export function createLocalAnalysisStep(processingFn, resultKey) {
    return async (item, reactiveStore) => {
        try {
            const result = await processingFn(item, reactiveStore);
            if (result !== undefined) {
                item.AppData[resultKey] = result;
            }
        } catch (error) {
            item.AppData[`${resultKey}_error`] = error.message;
        }
    };
}

