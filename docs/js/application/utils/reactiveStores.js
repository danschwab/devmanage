import { CacheInvalidationBus } from '../index.js';
import { PriorityQueue, Priority } from './priorityQueue.js';

// Re-export Priority for component use
export { Priority };

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
export function createReactiveStore(apiCall = null, saveCall = null, apiArgs = [], analysisConfig = null, priorityConfig = null) {
    // Priority configuration with defaults
    const priorities = {
        load: priorityConfig?.load !== undefined ? priorityConfig.load : Priority.LOAD,      // Default: 8
        save: priorityConfig?.save !== undefined ? priorityConfig.save : Priority.SAVE,      // Default: 9
        analysis: priorityConfig?.analysis !== undefined ? priorityConfig.analysis : Priority.ANALYSIS  // Default: 1
    };
    // Helper to recursively add AppData to all objects in an array (and nested arrays)
    function appDataInit(arr) {
        if (!Array.isArray(arr)) return arr;
        return arr.map(obj => {
            if (obj && typeof obj === 'object') {
                if (!('AppData' in obj)) obj['AppData'] = {};
                
                // Initialize analysis target columns if they don't exist
                if (analysisConfig && Array.isArray(analysisConfig)) {
                    analysisConfig.forEach(config => {
                        if (config.targetColumn && !(config.targetColumn in obj)) {
                            obj[config.targetColumn] = null; // Initialize to null for proper placeholder display
                        }
                    });
                }
                
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

    // Helper to preserve analysis results from old data when merging with new data
    function preserveAnalysisResults(newArr, oldArr, analysisConfig, identifierKey = null) {
        if (!Array.isArray(newArr) || !Array.isArray(oldArr) || !analysisConfig || oldArr.length === 0) {
            return newArr;
        }
        
        // Build a map of old items by identifier or index
        const oldItemsMap = new Map();
        oldArr.forEach((item, index) => {
            const key = identifierKey && item[identifierKey] ? item[identifierKey] : index;
            oldItemsMap.set(key, item);
        });
        
        // Copy analysis results from old items to new items
        newArr.forEach((newItem, index) => {
            if (!newItem || typeof newItem !== 'object') return;
            
            const key = identifierKey && newItem[identifierKey] ? newItem[identifierKey] : index;
            const oldItem = oldItemsMap.get(key);
            
            if (oldItem && typeof oldItem === 'object') {
                // Copy analysis target columns
                analysisConfig.forEach(config => {
                    if (config.targetColumn && oldItem[config.targetColumn] !== undefined) {
                        newItem[config.targetColumn] = oldItem[config.targetColumn];
                    }
                });
                
                // Copy AppData analysis results
                if (oldItem.AppData) {
                    if (!newItem.AppData) newItem.AppData = {};
                    analysisConfig.forEach(config => {
                        if (config.resultKey && oldItem.AppData[config.resultKey] !== undefined) {
                            newItem.AppData[config.resultKey] = oldItem.AppData[config.resultKey];
                        }
                        // Preserve analyzed state
                        if (oldItem.AppData._analyzed) {
                            newItem.AppData._analyzed = true;
                        }
                    });
                }
                
                // Recursively preserve nested arrays
                Object.keys(oldItem).forEach(key => {
                    if (Array.isArray(oldItem[key]) && Array.isArray(newItem[key])) {
                        newItem[key] = preserveAnalysisResults(
                            newItem[key], 
                            oldItem[key], 
                            analysisConfig, 
                            identifierKey
                        );
                    }
                });
            }
        });
        
        return newArr;
    }

    // Helper to clear analysis results from AppData and target columns
    function clearAnalysisResults(arr, analysisConfig) {
        if (!Array.isArray(arr) || !analysisConfig) return arr;
        
        const clearResults = (item) => {
            if (item && item.AppData) {
                analysisConfig.forEach(config => {
                    if (config.targetColumn) {
                        // Do NOT clear target column data - preserve existing values
                        // Analysis will only update if result is not null
                        // Clear any AppData error for this target column
                        delete item.AppData[`${config.targetColumn}_error`];
                    } else {
                        // Clear AppData results
                        delete item.AppData[config.resultKey];
                        delete item.AppData[`${config.resultKey}_error`];
                    }
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
        
        // Computed property to check if data has been modified
        get isModified() {
            if (!this.data || !this.originalData) return false;
            if (this.data.length === 0 && this.originalData.length === 0) return false;
            
            // Create clean copies without AppData and analysis columns for comparison
            const cleanCurrent = removeAppData(
                JSON.parse(JSON.stringify(this.data)), 
                this.analysisConfig
            );
            const cleanOriginal = removeAppData(
                JSON.parse(JSON.stringify(this.originalData)), 
                this.analysisConfig
            );
            
            // Deep comparison using JSON serialization
            return JSON.stringify(cleanCurrent) !== JSON.stringify(cleanOriginal);
        },
        
        setData(newData, preserveAnalysis = true) {
            // Deep clone and initialize AppData
            let processedData = appDataInit(JSON.parse(JSON.stringify(newData)));
            
            // Preserve existing analysis results from current data if requested
            if (preserveAnalysis && this.analysisConfig && this.data && this.data.length > 0) {
                // Try to find an identifier key from analysis config
                const identifierKey = this.analysisConfig[0]?.sourceColumns?.[0] || null;
                processedData = preserveAnalysisResults(processedData, this.data, this.analysisConfig, identifierKey);
            } else if (this.analysisConfig) {
                // Clear any existing analysis results if not preserving
                clearAnalysisResults(processedData, this.analysisConfig);
            }
            
            this.data = processedData;
            
            // Automatically run analysis if configured and data is loaded
            // Skip items that already have analysis results
            if (this.analysisConfig && this.data.length > 0 && !this.isAnalyzing) {
                // Use nextTick to ensure Vue has updated the DOM and reactive properties
                Vue.nextTick(() => {
                    this.runConfiguredAnalysis({ skipIfAnalyzed: preserveAnalysis });
                });
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
            //this.reset();
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
                // Use priority queue for load operations (high priority)
                const result = await PriorityQueue.enqueue(
                    apiCall,
                    apiArgs,
                    priorities.load,
                    { label: message, type: 'load', store: 'reactive' }
                );
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
                // Remove all objects marked for deletion and analysis target columns before saving
                const cleanData = removeAppData(this.data, this.analysisConfig);
                // Use priority queue for save operations (highest priority)
                const result = await PriorityQueue.enqueue(
                    saveCall,
                    [cleanData, ...apiArgs],
                    priorities.save,
                    { label: message, type: 'save', store: 'reactive' }
                );
                // now remove the rows marked for deletion from live data without breaking reactivity:
                this.removeMarkedRows();
                return result;
            } catch (err) {
                this.setError(err.message || 'Failed to save data');
                return false;
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
            this.data = removeAppData(this.data, this.analysisConfig);
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
        // Clear specific analysis results by result key or target column
        clearSpecificAnalysisResults(identifiers = []) {
            if (!this.analysisConfig || !Array.isArray(identifiers) || identifiers.length === 0) {
                return;
            }
            
            const clearSpecificResults = (item) => {
                if (item && item.AppData) {
                    this.analysisConfig.forEach(config => {
                        const shouldClear = identifiers.includes(config.resultKey) || 
                                          identifiers.includes(config.targetColumn);
                        
                        if (shouldClear) {
                            if (config.targetColumn) {
                                // Clear target column data
                                if (item.hasOwnProperty(config.targetColumn)) {
                                    item[config.targetColumn] = null;
                                }
                                // Clear any AppData error for this target column
                                delete item.AppData[`${config.targetColumn}_error`];
                            } else {
                                // Clear AppData results
                                delete item.AppData[config.resultKey];
                                delete item.AppData[`${config.resultKey}_error`];
                            }
                        }
                    });
                }
            };

            this.data.forEach(item => {
                clearSpecificResults(item);
                // Also clear nested arrays if they exist
                if (item && typeof item === 'object') {
                    Object.keys(item).forEach(key => {
                        if (Array.isArray(item[key])) {
                            item[key].forEach(nestedItem => clearSpecificResults(nestedItem));
                        }
                    });
                }
            });
        },
        async runConfiguredAnalysis(options = {}) {
            if (!this.analysisConfig || this.isAnalyzing) {
                return;
            }

            const {
                batchSize = 10,
                delayMs = 50,
                skipIfAnalyzed = false
            } = options;

            this.isAnalyzing = true;
            this.analysisProgress = 0;
            this.analysisMessage = 'Starting analysis...';

            try {
                // Helper to find value from ordered source columns
                const findSourceValue = (item, sourceColumns, parentItem = null) => {
                    if (!sourceColumns || sourceColumns.length === 0) return item;
                    
                    for (const column of sourceColumns) {
                        // First check the item itself
                        if (item && item[column] !== undefined && item[column] !== null && item[column] !== '') {
                            return item[column];
                        }
                        // Then check parent item if available
                        if (parentItem && parentItem[column] !== undefined && parentItem[column] !== null && parentItem[column] !== '') {
                            return parentItem[column];
                        }
                    }
                    return null;
                };

                // Helper to detect which arrays contain the requested columns
                const detectRelevantArrays = () => {
                    const relevantConfigs = [];
                    
                    for (const config of this.analysisConfig) {
                        const configResult = {
                            ...config,
                            processMain: false,
                            processNested: [],
                            needsParentContext: false
                        };

                        if (!config.sourceColumns || config.sourceColumns.length === 0) {
                            // No source columns specified, process main array only
                            configResult.processMain = true;
                        } else {
                            // Check if any source columns exist in main data
                            const mainSample = this.data[0];
                            if (mainSample) {
                                const hasMainColumns = config.sourceColumns.some(col => 
                                    mainSample.hasOwnProperty(col) && 
                                    mainSample[col] !== undefined && 
                                    mainSample[col] !== null && 
                                    mainSample[col] !== ''
                                );
                                
                                if (hasMainColumns) {
                                    configResult.processMain = true;
                                }

                                // Check nested arrays for the columns
                                Object.keys(mainSample).forEach(key => {
                                    if (Array.isArray(mainSample[key]) && mainSample[key].length > 0) {
                                        const nestedSample = mainSample[key][0];
                                        const hasNestedColumns = config.sourceColumns.some(col => 
                                            nestedSample.hasOwnProperty(col) && 
                                            nestedSample[col] !== undefined && 
                                            nestedSample[col] !== null && 
                                            nestedSample[col] !== ''
                                        );
                                        
                                        if (hasNestedColumns) {
                                            configResult.processNested.push(key);
                                            
                                            // Check if nested items need parent context
                                            const needsParent = config.sourceColumns.some(col => 
                                                !nestedSample.hasOwnProperty(col) && 
                                                mainSample.hasOwnProperty(col)
                                            );
                                            
                                            if (needsParent) {
                                                configResult.needsParentContext = true;
                                            }
                                        }
                                    }
                                });
                            }
                        }

                        relevantConfigs.push(configResult);
                    }

                    return relevantConfigs;
                };

                const relevantConfigs = detectRelevantArrays();
                let totalOperations = 0;
                let completedOperations = 0;

                // Calculate total operations for progress tracking
                relevantConfigs.forEach(config => {
                    if (config.processMain) {
                        totalOperations += this.data.length;
                    }
                    config.processNested.forEach(arrayKey => {
                        this.data.forEach(item => {
                            if (item[arrayKey] && Array.isArray(item[arrayKey])) {
                                totalOperations += item[arrayKey].length;
                            }
                        });
                    });
                });

                // Process main data
                for (const config of relevantConfigs) {
                    if (!config.processMain) continue;

                    this.analysisMessage = `${config.label || 'Processing'} main data...`;

                    for (let i = 0; i < this.data.length; i += batchSize) {
                        const batch = this.data.slice(i, i + batchSize);
                        
                        // Create batch promises for concurrent execution via priority queue
                        const batchPromises = batch.map(async (item) => {
                            if (!item || typeof item !== 'object') return;
                            if (!item.AppData) item.AppData = {};
                            
                            // Skip if already analyzed and skipIfAnalyzed is true
                            // Check both the analyzed flag and whether the result already exists
                            if (skipIfAnalyzed) {
                                const hasResult = config.targetColumn 
                                    ? (item[config.targetColumn] !== undefined && item[config.targetColumn] !== null && item[config.targetColumn] !== '')
                                    : (item.AppData[config.resultKey] !== undefined && item.AppData[config.resultKey] !== null && item.AppData[config.resultKey] !== '');
                                
                                if (hasResult || item.AppData._analyzed) {
                                    return;
                                }
                            }
                            
                            item.AppData._analyzing = true;

                            try {
                                const inputValue = findSourceValue(item, config.sourceColumns);
                                
                                if (inputValue !== null || config.passFullItem) {
                                    // Use full item if passFullItem is true, otherwise use extracted value
                                    const firstParam = config.passFullItem ? item : inputValue;
                                    const apiParams = [firstParam, ...(config.additionalParams || [])];
                                    
                                    // Use priority queue for analysis calls (low priority)
                                    const result = await PriorityQueue.enqueue(
                                        config.apiFunction,
                                        apiParams,
                                        config.priority !== undefined ? config.priority : priorities.analysis,
                                        {
                                            label: config.label || config.resultKey,
                                            type: 'analysis',
                                            resultKey: config.resultKey,
                                            store: 'reactive'
                                        }
                                    );
                                    
                                    // Store result based on return value:
                                    // - undefined: preserve existing value (do nothing)
                                    // - null: explicitly clear the value
                                    // - any other value: update with new value
                                    if (result !== undefined) {
                                        if (config.targetColumn) {
                                            item[config.targetColumn] = result;
                                        } else {
                                            item.AppData[config.resultKey] = result;
                                        }
                                    }
                                }
                                
                            } catch (error) {
                                console.error(`[ConfiguredAnalysis] Error in ${config.label || config.resultKey}:`, error);
                                if (config.targetColumn) {
                                    item.AppData[`${config.targetColumn}_error`] = error.message;
                                } else {
                                    item.AppData[`${config.resultKey}_error`] = error.message;
                                }
                            }
                            
                            item.AppData._analyzing = false;
                            item.AppData._analyzed = true;
                        });
                        
                        // Wait for entire batch to complete
                        await Promise.all(batchPromises);
                        
                        completedOperations += batch.length;

                        this.analysisProgress = Math.min((completedOperations / totalOperations) * 100, 100);

                        if (delayMs > 0) {
                            await new Promise(resolve => setTimeout(resolve, delayMs));
                        }
                    }
                }

                // Process nested data
                for (const config of relevantConfigs) {
                    for (const arrayKey of config.processNested) {
                        this.analysisMessage = `${config.label || 'Processing'} ${arrayKey} data...`;

                        for (const parentItem of this.data) {
                            if (!parentItem[arrayKey] || !Array.isArray(parentItem[arrayKey])) continue;

                            const nestedArray = parentItem[arrayKey];
                            
                            for (let i = 0; i < nestedArray.length; i += batchSize) {
                                const batch = nestedArray.slice(i, i + batchSize);
                                
                                // Create batch promises for concurrent execution via priority queue
                                const batchPromises = batch.map(async (nestedItem) => {
                                    if (!nestedItem || typeof nestedItem !== 'object') return;
                                    if (!nestedItem.AppData) nestedItem.AppData = {};
                                    
                                    // Skip if already analyzed and skipIfAnalyzed is true
                                    // Check both the analyzed flag and whether the result already exists
                                    if (skipIfAnalyzed) {
                                        const hasResult = config.targetColumn 
                                            ? (nestedItem[config.targetColumn] !== undefined && nestedItem[config.targetColumn] !== null && nestedItem[config.targetColumn] !== '')
                                            : (nestedItem.AppData[config.resultKey] !== undefined && nestedItem.AppData[config.resultKey] !== null && nestedItem.AppData[config.resultKey] !== '');
                                        
                                        if (hasResult || nestedItem.AppData._analyzed) {
                                            return;
                                        }
                                    }
                                    
                                    nestedItem.AppData._analyzing = true;

                                    try {
                                        // Create enhanced item with parent context if needed
                                        let itemWithContext = nestedItem;
                                        if (config.needsParentContext) {
                                            itemWithContext = { ...parentItem, ...nestedItem };
                                        }

                                        const inputValue = findSourceValue(nestedItem, config.sourceColumns, 
                                            config.needsParentContext ? parentItem : null);
                                        
                                        if (inputValue !== null || config.passFullItem) {
                                            // Use full item if passFullItem is true, otherwise use extracted value
                                            const firstParam = config.passFullItem ? nestedItem : inputValue;
                                            const apiParams = [firstParam, ...(config.additionalParams || [])];
                                            
                                            // Use priority queue for analysis calls (low priority)
                                            const result = await PriorityQueue.enqueue(
                                                config.apiFunction,
                                                apiParams,
                                                config.priority !== undefined ? config.priority : priorities.analysis,
                                                {
                                                    label: config.label || config.resultKey,
                                                    type: 'analysis',
                                                    resultKey: config.resultKey,
                                                    nested: arrayKey,
                                                    store: 'reactive'
                                                }
                                            );
                                            
                                            // Store result based on return value:
                                            // - undefined: preserve existing value (do nothing)
                                            // - null: explicitly clear the value
                                            // - any other value: update with new value
                                            if (result !== undefined) {
                                                if (config.targetColumn) {
                                                    nestedItem[config.targetColumn] = result;
                                                } else {
                                                    nestedItem.AppData[config.resultKey] = result;
                                                }
                                            }
                                        }
                                        
                                    } catch (error) {
                                        console.error(`[ConfiguredAnalysis] Error in ${config.label || config.resultKey}:`, error);
                                        if (config.targetColumn) {
                                            nestedItem.AppData[`${config.targetColumn}_error`] = error.message;
                                        } else {
                                            nestedItem.AppData[`${config.resultKey}_error`] = error.message;
                                        }
                                    }
                                    
                                    nestedItem.AppData._analyzing = false;
                                    nestedItem.AppData._analyzed = true;
                                });
                                
                                // Wait for entire batch to complete
                                await Promise.all(batchPromises);
                                
                                completedOperations += batch.length;

                                this.analysisProgress = Math.min((completedOperations / totalOperations) * 100, 100);

                                if (delayMs > 0) {
                                    await new Promise(resolve => setTimeout(resolve, delayMs));
                                }
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
                setTimeout(() => {
                    this.analysisProgress = 0;
                    this.analysisMessage = '';
                }, 2000);
            }
        },
        async handleInvalidation() {
            // Reload both originalData and data from the server
            await this.load('Reloading data due to invalidation...');
        }
    });

    // Helper to strip AppData and analysis target columns from objects (including filtering out items marked for deletion)
    function removeAppData(arr, analysisConfig = null) {
        if (!Array.isArray(arr)) return arr;
        
        // Get list of target columns to remove
        const targetColumns = new Set();
        if (analysisConfig && Array.isArray(analysisConfig)) {
            analysisConfig.forEach(config => {
                if (config.targetColumn) {
                    targetColumns.add(config.targetColumn);
                }
            });
        }
        
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
                    
                    // Remove analysis target columns before sending to API
                    targetColumns.forEach(column => {
                        delete newObj[column];
                    });
                    
                    // Recursively process nested arrays
                    Object.keys(newObj).forEach(key => {
                        if (Array.isArray(newObj[key])) {
                            newObj[key] = removeAppData(newObj[key], analysisConfig);
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
 * Find stores that match the given criteria (partial matching)
 * Useful for finding stores when you don't know the exact analysis config
 * @param {Function} apiCall - The API function used to create the store
 * @param {Array} apiArgs - Arguments passed to the API function
 * @returns {Array} Array of matching store objects with { key, store, isModified }
 */
export function findMatchingStores(apiCall, apiArgs = []) {
    if (!apiCall) return [];
    
    const apiCallStr = apiCall.toString();
    const apiArgsStr = JSON.stringify(apiArgs);
    const matches = [];
    
    // Search through all registered stores
    for (const [key, store] of Object.entries(reactiveStoreRegistry)) {
        // Check if the key starts with the apiCall and contains the apiArgs
        if (key.includes(apiCallStr) && key.includes(apiArgsStr)) {
            matches.push({
                key,
                store,
                isModified: store.isModified || false
            });
        }
    }
    
    return matches;
}

/**
 * Check if a reactive store exists and get its modification status
 * @param {Function} apiCall - The API function used to create the store
 * @param {Function} saveCall - The save function (optional, can be null)
 * @param {Array} apiArgs - Arguments passed to the API function
 * @param {Array} analysisConfig - Analysis configuration (optional)
 * @returns {Object|null} { exists: boolean, isModified: boolean, store: Object } or null if not found
 */
export function getStoreStatus(apiCall, saveCall = null, apiArgs = [], analysisConfig = null) {
    const key = apiCall?.toString() + ':' + (saveCall?.toString() || '') + ':' + JSON.stringify(apiArgs) + ':' + JSON.stringify(analysisConfig);
    const store = reactiveStoreRegistry[key];
    
    if (!store) {
        return { exists: false, isModified: false, store: null };
    }
    
    return {
        exists: true,
        isModified: store.isModified || false,
        store: store
    };
}

/**
 * Helper to extract method name from API function
 * @param {Function} apiFunction - The API function
 * @returns {string|null} - Method name or null
 */
function extractMethodName(apiFunction) {
    if (!apiFunction) return null;
    
    // Check if the function has _methodName property (set by wrapMethods)
    if (apiFunction._methodName) {
        return apiFunction._methodName;
    }
    
    const funcStr = apiFunction.toString();
    // For arrow functions that call Requests.methodName, extract the method name
    // Matches patterns like: Requests.methodName( or Requests.methodName.call(
    const requestsMatch = funcStr.match(/Requests\.(\w+)(?:\(|\.call\()/);
    if (requestsMatch) {
        return requestsMatch[1];
    }
    
    // Try to extract method name from function
    const match = funcStr.match(/function\s+(\w+)|^(\w+)\s*\(/);
    if (match) {
        return match[1] || match[2];
    }
    
    // For arrow functions, check the name property
    if (apiFunction.name) {
        return apiFunction.name;
    }
    
    console.warn(`[extractMethodName] Could not extract name from function`, funcStr.substring(0, 100));
    return null;
}

/**
 * Returns a reactive store instance for the given apiCall and apiArgs.
 * If a store for the same apiCall/apiArgs exists, returns it.
 * Otherwise, creates a new store and registers it.
 * @param {Function} apiCall - The API function to use for loading data
 * @param {Function} saveCall - The API function to use for saving data
 * @param {Array} apiArgs - Arguments to pass to the API function
 * @param {Array} analysisConfig - Optional analysis configuration array
 * @param {boolean} autoLoad - Whether to automatically load data on first creation (default: true)
 * @param {Object} priorityConfig - Optional priority configuration for load/save/analysis
 * @returns {Object} The reactive store instance
 */
export function getReactiveStore(apiCall, saveCall = null, apiArgs = [], analysisConfig = null, autoLoad = true, priorityConfig = null) {
    const key = apiCall?.toString() + ':' + (saveCall?.toString() || '') + ':' + JSON.stringify(apiArgs) + ':' + JSON.stringify(analysisConfig);
    
    if (!reactiveStoreRegistry[key]) {
        const store = createReactiveStore(apiCall, saveCall, apiArgs, analysisConfig, priorityConfig);
        reactiveStoreRegistry[key] = store;
        
        // Setup cache invalidation subscriptions
        setupCacheInvalidationListeners(store, apiCall, apiArgs, analysisConfig);
        
        if (autoLoad) {
            // Initial load with proper error handling for empty/null responses
            store.load('Loading data...').catch(err => {
                console.warn('[ReactiveStore] Initial load failed:', err);
                // Store will have empty arrays initialized, allowing dynamic property addition
            });
        } else {
            // Initialize with empty arrays to allow dynamic property addition
            store.setOriginalData([]);
            store.setData([]);
        }
    }
    
    return reactiveStoreRegistry[key];
}

/**
 * Setup cache invalidation listeners for a reactive store
 * @param {Object} store - The reactive store instance
 * @param {Function} apiCall - The main API call function
 * @param {Array} apiArgs - Arguments for the API call
 * @param {Array} analysisConfig - Analysis configuration
 */
function setupCacheInvalidationListeners(store, apiCall, apiArgs, analysisConfig) {
    // Subscribe to main API call invalidations (triggers full reload)
    const mainMethodName = extractMethodName(apiCall);
    if (mainMethodName) {
        const mainPattern = `api:${mainMethodName}`;
        const storeArgs = JSON.stringify(apiArgs).replace(/^\[|\]$/g, '');
        
        CacheInvalidationBus.on(mainPattern, (eventData) => {
            // Check if arguments match
            const cachedArgs = eventData.argsString;
            
            if (cachedArgs === storeArgs) {
                console.log(`[ReactiveStore] Cache invalidation received for ${mainMethodName} with matching args, reloading data`);
                store.handleInvalidation();
            }
        });
    }
    
    // Subscribe to analysis function invalidations (triggers re-analysis only)
    if (analysisConfig && Array.isArray(analysisConfig)) {
        analysisConfig.forEach((config, index) => {
            const analysisMethodName = extractMethodName(config.apiFunction);
            if (analysisMethodName) {
                const analysisPattern = `api:${analysisMethodName}`;
                
                CacheInvalidationBus.on(analysisPattern, (eventData) => {
                    // Clear and rerun only the specific analysis that was invalidated
                    console.log(`[ReactiveStore] Analysis invalidation received for ${analysisMethodName}, re-running analysis step ${index + 1}`);
                    store.clearSpecificAnalysisResults([config.resultKey || config.targetColumn]);
                    store.runConfiguredAnalysis({ skipIfAnalyzed: false });
                });
            }
        });
    }
}

/**
 * Helper to create a new analysis configuration entry
 * @param {Function} apiFunction - The API function to call
 * @param {string} resultKey - Key to store the result in AppData OR column name if targetColumn is specified
 * @param {string} label - UI label for the analysis step
 * @param {string|Array<string>} sourceColumns - Column(s) to extract value from (ordered array for priority)
 * @param {Array} additionalParams - Additional parameters to pass to API function
 * @param {string} targetColumn - Optional: column name to store results directly in data (not AppData)
 * @param {boolean} passFullItem - If true, pass entire item as first param instead of extracted value
 * @param {number} priority - Priority level (0-9, default: Priority.ANALYSIS=1)
 * @returns {Object} Analysis configuration object
 */
export function createAnalysisConfig(apiFunction, resultKey, label, sourceColumns = null, additionalParams = [], targetColumn = null, passFullItem = false, priority = Priority.ANALYSIS) {
    return {
        apiFunction,
        resultKey,
        label,
        sourceColumns: Array.isArray(sourceColumns) ? sourceColumns : (sourceColumns ? [sourceColumns] : []),
        additionalParams,
        targetColumn, // If set, results go to this column instead of AppData
        passFullItem, // If true, pass entire item even when sourceColumns specified
        priority // Priority level for queue processing
    };
}

