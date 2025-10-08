/**
 * Reactive Store System with Configurable Analysis
 * 
 * This system provides Vue 3 reactive data stores with optional automatic analysis.
 * 
 * Example usage with analysis:
 * 
 * // Define analysis steps
 * const analysisConfig = [
 *     createAnalysisConfig(
 *         Requests.getItemInfo,     // API function
 *         'itemInfo',               // Result key in AppData  
 *         'Loading item info...',   // UI label
 *         'itemId',                 // Source column (or null for entire item)
 *         ['details'],              // Additional parameters
 *         'Items'                   // Also process nested 'Items' arrays
 *     ),
 *     createAnalysisConfig(
 *         Requests.checkQuantity,
 *         'quantityStatus', 
 *         'Checking quantities...',
 *         'itemId'
 *     )
 * ];
 * 
 * // Create store with analysis
 * const store = getReactiveStore(
 *     Requests.getPackList,      // Load function
 *     Requests.savePackList,     // Save function
 *     [tabName],                 // API arguments
 *     analysisConfig             // Analysis configuration
 * );
 * 
 * // Results will be stored in item.AppData[resultKey] automatically after data loads
 * 
 * Key Features:
 * - Automatic analysis execution when data loads/reloads
 * - Results cleared and re-analyzed on each data load
 * - Support for nested data processing (e.g., Items within Crates)
 * - Progress tracking with meaningful UI labels
 * - Error isolation - individual analysis failures don't stop the process
 * - Declarative configuration - no manual step creation needed
 */

// Modular reactive store factory for any generic data, with async API calls for load and save
export function createReactiveStore(apiCall = null, saveCall = null, apiArgs = [], analysisConfig = null) {
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

    // Helper to clear analysis results from AppData
    function clearAnalysisResults(arr, analysisConfig) {
        if (!Array.isArray(arr) || !analysisConfig) return arr;
        
        const clearResults = (item) => {
            if (item && item.AppData) {
                analysisConfig.forEach(config => {
                    // Clear the result key and error key
                    delete item.AppData[config.resultKey];
                    delete item.AppData[`${config.resultKey}_error`];
                });
                // Clear analysis state
                delete item.AppData._analyzed;
                delete item.AppData._analyzing;
            }
        };

        arr.forEach(item => {
            clearResults(item);
            // Also clear nested arrays if they exist
            if (item && typeof item === 'object') {
                Object.keys(item).forEach(key => {
                    if (Array.isArray(item[key])) {
                        item[key].forEach(nestedItem => clearResults(nestedItem));
                    }
                });
            }
        });
        
        return arr;
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
        analysisConfig,
        setData(newData) {
            // Deep clone and initialize AppData
            const processedData = appDataInit(JSON.parse(JSON.stringify(newData)));
            // Clear any existing analysis results if analysis is configured
            if (this.analysisConfig) {
                clearAnalysisResults(processedData, this.analysisConfig);
            }
            this.data = processedData;
            
            // Automatically run analysis if configured and data is loaded
            if (this.analysisConfig && this.data.length > 0) {
                // Run analysis after a small delay to allow UI to update
                setTimeout(() => {
                    this.runConfiguredAnalysis();
                }, 100);
            }
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
        async runConfiguredAnalysis(options = {}) {
            if (!this.analysisConfig || this.isAnalyzing) {
                return;
            }

            const {
                batchSize = 10,
                delayMs = 50,
                skipIfAnalyzed = false // Don't skip by default for configured analysis
            } = options;

            this.isAnalyzing = true;
            this.analysisProgress = 0;
            this.analysisMessage = 'Starting analysis...';

            try {
                const processData = async (dataArray, isNested = false) => {
                    if (!Array.isArray(dataArray) || dataArray.length === 0) {
                        return;
                    }

                    // Process items in batches
                    for (let i = 0; i < dataArray.length; i += batchSize) {
                        const batch = dataArray.slice(i, i + batchSize);
                        
                        await Promise.all(batch.map(async (item) => {
                            if (!item || typeof item !== 'object') return;
                            if (!item.AppData) item.AppData = {};
                            
                            if (skipIfAnalyzed && item.AppData._analyzed) return;
                            item.AppData._analyzing = true;

                            // Run each configured analysis step
                            for (const config of this.analysisConfig) {
                                try {
                                    this.analysisMessage = config.label || 'Processing...';
                                    
                                    // Extract value from specified column
                                    let inputValue = item;
                                    if (config.sourceColumn) {
                                        inputValue = item[config.sourceColumn];
                                    }
                                    
                                    // Skip if no input value
                                    if (!inputValue) continue;
                                    
                                    // Call API function with the extracted value and additional parameters
                                    const apiParams = [inputValue, ...(config.additionalParams || [])];
                                    const result = await config.apiFunction(...apiParams);
                                    
                                    // Store result in AppData
                                    item.AppData[config.resultKey] = result;
                                    
                                } catch (error) {
                                    console.error(`[ConfiguredAnalysis] Error in ${config.label || config.resultKey}:`, error);
                                    item.AppData[`${config.resultKey}_error`] = error.message;
                                }
                            }
                            
                            item.AppData._analyzing = false;
                            item.AppData._analyzed = true;
                        }));

                        // Update progress for main data
                        if (!isNested) {
                            this.analysisProgress = Math.min(((i + batchSize) / dataArray.length) * 50, 50);
                        }

                        // Small delay to keep UI responsive
                        if (delayMs > 0) {
                            await new Promise(resolve => setTimeout(resolve, delayMs));
                        }
                    }
                };

                // Process main data
                await processData(this.data, false);
                
                // Process nested data if configured
                const nestedConfigs = this.analysisConfig.filter(config => config.nestedArrayKey);
                if (nestedConfigs.length > 0) {
                    this.analysisMessage = 'Processing nested data...';
                    
                    for (const item of this.data) {
                        for (const config of nestedConfigs) {
                            if (item[config.nestedArrayKey] && Array.isArray(item[config.nestedArrayKey])) {
                                await processData(item[config.nestedArrayKey], true);
                            }
                        }
                    }
                }

                this.analysisProgress = 100;
                this.analysisMessage = 'Analysis complete';

            } catch (error) {
                console.error('[ConfiguredAnalysis] Analysis failed:', error);
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
 * @param {Array} analysisConfig - Optional analysis configuration array
 * @param {boolean} autoLoad - Whether to automatically load data on first creation (default: true)
 * @returns {Object} The reactive store instance
 */
export function getReactiveStore(apiCall, saveCall = null, apiArgs = [], analysisConfig = null, autoLoad = true) {
    const key = apiCall?.toString() + ':' + (saveCall?.toString() || '') + ':' + JSON.stringify(apiArgs) + ':' + JSON.stringify(analysisConfig);
    
    if (!reactiveStoreRegistry[key]) {
        reactiveStoreRegistry[key] = createReactiveStore(apiCall, saveCall, apiArgs, analysisConfig);
        
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
 * Helper to create a new analysis configuration entry
 * @param {Function} apiFunction - The API function to call
 * @param {string} resultKey - Key to store the result in AppData
 * @param {string} label - UI label for the analysis step
 * @param {string} sourceColumn - Column to extract value from (if null, passes entire item)
 * @param {Array} additionalParams - Additional parameters to pass to API function
 * @param {string} nestedArrayKey - If provided, will also process nested arrays with this key
 * @returns {Object} Analysis configuration object
 */
export function createAnalysisConfig(apiFunction, resultKey, label, sourceColumn = null, additionalParams = [], nestedArrayKey = null) {
    return {
        apiFunction,
        resultKey,
        label,
        sourceColumn,
        additionalParams,
        nestedArrayKey
    };
}

