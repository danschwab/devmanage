import { Database, parseDate, toISODateString, wrapMethods, searchFilter, GetTopFuzzyMatch, invalidateCache } from '../index.js';

/**
 * Utility functions for production schedule operations
 */
class productionUtils_uncached {
    /**
     * Get mapping from ProductionSchedule table headers
     * @param {Object} deps - Dependency decorator for tracking calls
     * @returns {Promise<Object>} Mapping object where keys and values are the same (all available headers)
     */
    static async GetMappingFromProductionSchedule(deps) {
        const tabName = "Production Schedule";
        
        // Get the raw data (2D array) to extract headers from first row
        const rawData = await deps.call(Database.getData, 'PROD_SCHED', tabName);
        
        if (!rawData || rawData.length === 0) {
            console.log('[production-utils] No data available to generate mapping');
            return {};
        }
        
        // Get headers from the first row of the 2D array
        const headers = rawData[0];
        
        if (!Array.isArray(headers)) {
            console.log('[production-utils] Invalid data structure, expected array of headers');
            return {};
        }
        
        // Create mapping where key equals value (identity mapping for all headers)
        const mapping = {};
        headers.forEach(header => {
            if (header && header.toString().trim()) { // Skip empty headers
                mapping[header] = header;
            }
        });
        
        console.log('[production-utils] Generated mapping from ProductionSchedule headers:', mapping);
        return mapping;
    }

    /**
     * Get overlapping shows based on parameters
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {Object} parameters - Filter parameters with dateFilters array
     * @param {Object} searchParams - Text search parameters
     * @returns {Promise<Array>} Array of filtered show data
     */
    static async getOverlappingShows(deps, parameters = null, searchParams = null) {
        console.log('[production-utils] getOverlappingShows called with:', parameters);
        const tabName = "Production Schedule";
        
        // Get dynamic mapping from ProductionSchedule headers
        const mapping = await deps.call(ProductionUtils.GetMappingFromProductionSchedule);
        
        let data = await deps.call(Database.getData, 'PROD_SCHED', tabName, mapping);
        console.log('[production-utils] Loaded schedule data:', data);

        // Apply text filters first
        if (searchParams) {
            data = searchFilter(data, searchParams);
        }

        // If no parameters or no date filters, return all data
        if (!parameters || !parameters.dateFilters || parameters.dateFilters.length === 0) {
            console.log('[production-utils] No date filters provided, returning all data');
            return data;
        }

        const dateFilters = parameters.dateFilters;
        console.log('[production-utils] Processing date filters:', dateFilters);

        // Helper to get date from row based on column
        const getRowDate = (row, column) => {
            if (column === 'Ship') {
                return _calculateShipDate(row);
            } else if (column === 'Return') {
                const ship = _calculateShipDate(row);
                return _calculateReturnDate(row, ship);
            } else if (column === 'Show Date') {
                // Try to get show date from S. Start field
                let showDate = parseDate(row['S. Start'], true, row.Year);
                
                // If show date not available, try other date fields to infer it
                if (!showDate) {
                    const ship = _calculateShipDate(row);
                    if (ship) {
                        // Typical show is ~7-14 days after ship
                        showDate = new Date(ship.getTime() + 10 * 86400000);
                    }
                }
                return showDate;
            }
            return null;
        };

        // Helper to resolve filter value to a date
        const resolveFilterValue = async (filter, data) => {
            const value = filter.value;
            
            // If it's a number, treat as offset from today
            if (typeof value === 'number') {
                const today = new Date();
                return new Date(today.getTime() + value * 86400000);
            }
            
            // If it looks like a date string (YYYY-MM-DD), parse it
            if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
                return new Date(value + 'T12:00:00');  // noon — matches _calculateShipDate/_calculateReturnDate
            }
            
            // Otherwise, treat as identifier - find the show and get its date
            if (typeof value === 'string') {
                for (const row of data) {
                    const showName = row.Show;
                    const client = row.Client;
                    const year = row.Year;
                    if (showName && client && year) {
                        const computedIdentifier = await deps.call(ProductionUtils.computeIdentifier, showName, client, year);
                        if (computedIdentifier === value) {
                            // Special overlap logic for identifiers:
                            // To find shows active during identifier's period:
                            // - column='Return' + type='after' → check if target returns after identifier ships
                            // - column='Ship' + type='before' → check if target ships before identifier returns
                            const ship = _calculateShipDate(row);
                            const ret = _calculateReturnDate(row, ship);
                            
                            if (filter.column === 'Return' && filter.type === 'after') {
                                // Check if target's return is after identifier's ship
                                return ship;
                            } else if (filter.column === 'Ship' && filter.type === 'before') {
                                // Check if target's ship is before identifier's return
                                return ret;
                            }
                            
                            // Fallback: use the specified column from the identifier show
                            return getRowDate(row, filter.column);
                        }
                    }
                }
                console.warn('[production-utils] No show found for identifier:', value);
                return null;
            }
            
            return null;
        };

        // Calculate year range to check (needed for year filter optimization)
        const filterDates = await Promise.all(
            dateFilters.map(f => resolveFilterValue(f, data))
        );
        const validDates = filterDates.filter(d => d !== null);
        
        if (validDates.length === 0) {
            console.log('[production-utils] Could not resolve any filter dates');
            return [];
        }

        const years = validDates.map(d => d.getFullYear());
        const minYear = Math.min(...years);
        const maxYear = Math.max(...years);
        const yearsToCheck = [];
        for (let y = minYear; y <= maxYear; y++) {
            yearsToCheck.push(y);
        }

        // Filter data
        const filtered = data.filter(row => {
            // Year optimization
            if (!row.Year || !yearsToCheck.includes(parseInt(row.Year))) {
                return false;
            }

            // Apply all date filters (AND logic - must pass all)
            return dateFilters.every(filter => {
                const rowDate = getRowDate(row, filter.column);
                if (!rowDate) {
                    return false; // If we can't get the date, filter out the row
                }

                const filterDateIndex = dateFilters.indexOf(filter);
                const filterDate = filterDates[filterDateIndex];
                if (!filterDate) {
                    return false; // If we can't resolve filter value, filter out the row
                }

                // Apply filter type
                if (filter.type === 'after') {
                    return rowDate >= filterDate;
                } else if (filter.type === 'before') {
                    return rowDate <= filterDate;
                }
                
                return true;
            });
        });

        console.log(`[production-utils] Filtered ${data.length} shows to ${filtered.length} matching date filters`);
        return filtered;
    }
    
    
    /**
     * Compute the "Identifier" value for a production schedule row
     * @param {string} showName - Show name
     * @param {string} clientName - Client name
     * @param {string} year - Production year
     * @param {Object} deps - Dependency decorator for tracking calls
     * @returns {Promise<string>} The computed identifier string
     */
    static async computeIdentifier(deps, showName, clientName, year) {
        // Normalize inputs so all callers produce the same result regardless of type or whitespace
        const normalizedShow   = String(showName   || '').trim();
        const normalizedClient = String(clientName || '').trim();
        const normalizedYear   = String(parseInt(year, 10) || '').replace('NaN', '').trim();

        // If showName is blank, return blank
        if (!normalizedShow) {
            return '';
        }

        // Get reference data
        const referenceData = await deps.call(ProductionUtils.computeIdentifierReferenceData);
        
        // Fuzzy match client 
        let clientMatch = '';
        try {
            clientMatch = GetTopFuzzyMatch(
                normalizedClient,
                referenceData.clients.names,
                referenceData.clients.abbrs
            );
        } catch (e) {
            clientMatch = normalizedClient;
        }

        // Fuzzy match show
        let showMatch = '';
        try {
            showMatch = GetTopFuzzyMatch(
                normalizedShow,
                referenceData.shows.names,
                referenceData.shows.abbrs,
                2.5
            );
        } catch (e) {
            showMatch = normalizedShow;
        }

        // Compose identifier
        return `${clientMatch} ${normalizedYear} ${showMatch}`.trim();
    }

    /**
     * Helper method to get fuzzy matching reference data
     * @param {Object} deps - Dependency decorator for tracking calls
     * @returns {Promise<Object>} Reference data for fuzzy matching
     * @private
     */
    static async computeIdentifierReferenceData(deps) {
        const clientsData = await deps.call(Database.getData, 'CACHE', 'Clients', { name: 'Clients', abbr: 'Abbreviations' });
        const showsData = await deps.call(Database.getData, 'CACHE', 'Shows', { name: 'Shows', abbr: 'Abbreviations' });
        console.log('[production-utils] Loaded reference data for fuzzy matching:', { clientsData, showsData });
        return {
            clients: {
                names: clientsData.map(row => row.name || ''),
                abbrs: clientsData.map(row => row.abbr || '')
            },
            shows: {
                names: showsData.map(row => row.name || ''),
                abbrs: showsData.map(row => row.abbr || '')
            }
        };
    }

    /**
     * Analyze whether a schedule row value is healthy against the index.
     * Returns a clickable alert payload for unresolved entries; returns null when healthy.
     * @param {Object} deps
     * @param {Object} scheduleRow
     * @param {'client'|'show'} referenceType
     * @returns {Promise<Object|null>}
     */
    static async checkReferenceNameState(deps, scheduleRow, referenceType = 'client') {
        const kind = referenceType === 'show' ? 'show' : 'client';
        const tabName = kind === 'show' ? 'Shows' : 'Clients';
        const rawValue = _normalizeIndexName(kind === 'show' ? scheduleRow?.Show : scheduleRow?.Client);

        if (!rawValue) {
            return null;
        }

        const indexData = await _getReferenceIndexData(tabName);
        const state = _classifyReferenceState(rawValue, indexData);

        // Exact matches should not render cards.
        if (state.status === 'exact-name' || state.status === 'exact-abbreviation') {
            return null;
        }

        if (state.status === 'fuzzy-pass' && state.bestMatch) {
            return {
                message: state.bestMatch,
                type: 'index-reference-resolved',
                color: 'gray',
                clickable: true,
                referenceType: kind,
                rawValue,
                status: state.status,
                bestMatch: state.bestMatch
            };
        }

        const message = '⚠';

        return {
            message,
            type: 'index-reference',
            color: 'red',
            clickable: true,
            referenceType: kind,
            rawValue,
            status: state.status,
            bestMatch: state.bestMatch || null
        };
    }

    /**
     * Build resolution options for an unresolved client/show value.
     * @param {Object} deps
     * @param {'client'|'show'} referenceType
     * @param {string} rawValue
     * @param {boolean} includeAllCandidates
     * @returns {Promise<{referenceType:string, rawValue:string, options:Array<Object>}>}
     */
    static async getReferenceResolutionOptions(deps, referenceType, rawValue, includeAllCandidates = false) {
        const kind = referenceType === 'show' ? 'show' : 'client';
        const tabName = kind === 'show' ? 'Shows' : 'Clients';
        const normalizedRaw = _normalizeIndexName(rawValue);
        const indexData = await _getReferenceIndexData(tabName);

        if (!normalizedRaw) {
            return { referenceType: kind, rawValue: '', options: [] };
        }

        const guessedAbbreviations = _guessAbbreviations(normalizedRaw);
        const candidates = _rankReferenceCandidates(normalizedRaw, indexData, guessedAbbreviations);
        const topCandidates = includeAllCandidates
            ? candidates.sort((a, b) => a.name.localeCompare(b.name))
            : _filterHighConfidenceCandidates(candidates);

        const options = [];

        if (!includeAllCandidates) {
            options.push({
                actionType: 'add-new',
                label: `Add ${normalizedRaw} to ${kind} index`,
                buttonClass: 'green',
                canonicalName: normalizedRaw,
                abbreviation: ''
            });
        }

        topCandidates.forEach((candidate) => {
            options.push({
                actionType: 'add-abbreviation',
                label: `Abbreviation for ${candidate.name}`,
                canonicalName: candidate.name,
                abbreviation: normalizedRaw,
                reason: candidate.reason,
                score: candidate.score
            });
        });

        if (!includeAllCandidates) {
            options.push({
                actionType: 'browse-all',
                label: `See all ${kind}s`,
                buttonClass: 'blue',
                canonicalName: '',
                abbreviation: normalizedRaw
            });
        }

        return {
            referenceType: kind,
            rawValue: normalizedRaw,
            options
        };
    }

    /**
     * Add a custom canonical client/show name and store the missing value as its abbreviation.
     * Mutation — uncached.
     * @param {Object} deps
     * @param {'client'|'show'} referenceType
     * @param {string} canonicalName
     * @param {string} abbreviation
     * @returns {Promise<{applied:boolean,addedRow:boolean,rowNumber:number|null,canonicalName:string,abbreviation:string,conflict:Object|null}>}
     */
    static async addCustomReferenceEntry(deps, referenceType, canonicalName, abbreviation) {
        const kind = referenceType === 'show' ? 'show' : 'client';
        const tabName = kind === 'show' ? 'Shows' : 'Clients';
        const normalizedName = _normalizeIndexName(canonicalName);
        const normalizedAbbreviation = _normalizeIndexName(abbreviation);

        if (!normalizedName || !normalizedAbbreviation) {
            return {
                applied: false,
                addedRow: false,
                rowNumber: null,
                canonicalName: normalizedName,
                abbreviation: normalizedAbbreviation,
                conflict: {
                    field: !normalizedName ? 'name' : 'abbreviation',
                    value: !normalizedName ? canonicalName : abbreviation,
                    existingName: ''
                }
            };
        }

        const indexData = await _getReferenceIndexData(tabName);
        const nameConflict = _findReferenceConflict(normalizedName, indexData);
        if (nameConflict) {
            return {
                applied: false,
                addedRow: false,
                rowNumber: null,
                canonicalName: normalizedName,
                abbreviation: normalizedAbbreviation,
                conflict: {
                    field: 'name',
                    value: normalizedName,
                    existingName: nameConflict.name
                }
            };
        }

        const abbreviationConflict = _findReferenceConflict(normalizedAbbreviation, indexData);
        if (abbreviationConflict) {
            return {
                applied: false,
                addedRow: false,
                rowNumber: null,
                canonicalName: normalizedName,
                abbreviation: normalizedAbbreviation,
                conflict: {
                    field: 'abbreviation',
                    value: normalizedAbbreviation,
                    existingName: abbreviationConflict.name
                }
            };
        }

        const rowResult = await _findOrCreateReferenceRow(tabName, normalizedName);
        const rawData = await Database.getData('CACHE', tabName);
        const headers = Array.isArray(rawData) && Array.isArray(rawData[0]) ? rawData[0] : [];
        const abbrColIndex = headers.findIndex((header) => String(header || '').trim() === 'Abbreviations');

        if (abbrColIndex === -1 || !rowResult.rowNumber) {
            throw new Error(`[production-utils] Missing Abbreviations column in CACHE/${tabName}`);
        }

        const targetRow = Array.isArray(rawData[rowResult.rowNumber - 1]) ? rawData[rowResult.rowNumber - 1] : [];
        const existingAbbrText = String(targetRow[abbrColIndex] || '').trim();
        const mergedAbbr = _mergeAbbreviations(existingAbbrText, normalizedAbbreviation);

        if (mergedAbbr !== existingAbbrText) {
            await Database.setCellValue('CACHE', tabName, rowResult.rowNumber, abbrColIndex + 1, mergedAbbr);
        }

        _invalidateReferenceCaches();

        return {
            applied: true,
            addedRow: rowResult.added,
            rowNumber: rowResult.rowNumber,
            canonicalName: normalizedName,
            abbreviation: mergedAbbr,
            conflict: null
        };
    }

    /**
     * Ensure missing client/show index rows exist in CACHE reference tabs.
     * Only appends missing rows and never rewrites the whole table.
     * @param {Array<Object>} scheduleRows - Rows containing Client and Show fields
     * @returns {Promise<{clientsAdded:number, showsAdded:number}>}
     */
    static async ensureScheduleReferenceRows(scheduleRows) {
        const rows = Array.isArray(scheduleRows) ? scheduleRows : [];
        const uniqueClients = new Set();
        const uniqueShows = new Set();

        rows.forEach((row) => {
            const client = _normalizeIndexName(row?.Client);
            const show = _normalizeIndexName(row?.Show);
            if (client) uniqueClients.add(client);
            if (show) uniqueShows.add(show);
        });

        const clientsAdded = await _appendMissingReferenceRows('Clients', Array.from(uniqueClients));
        const showsAdded = await _appendMissingReferenceRows('Shows', Array.from(uniqueShows));

        // Force downstream identifier caches to refresh after reference updates.
        invalidateCache([
            { namespace: 'api', methodName: 'computeIdentifier', args: [] },
            { namespace: 'production_utils', methodName: 'computeIdentifierReferenceData', args: [] }
        ], true);

        return { clientsAdded, showsAdded };
    }

    /**
     * Upsert a specific abbreviation by editing exactly one cell in CACHE.
     * Creates the row first when the reference value does not yet exist.
     * @param {'Clients'|'Shows'} referenceTab - Reference tab name
     * @param {string} name - Client/show name to locate or add
     * @param {string} abbreviation - New abbreviation value
     * @returns {Promise<{updated:boolean, addedRow:boolean, rowNumber:number|null}>}
     */
    static async updateReferenceAbbreviation(referenceTab, name, abbreviation) {
        const tabName = referenceTab === 'Shows' ? 'Shows' : 'Clients';
        const normalizedName = _normalizeIndexName(name);
        if (!normalizedName) {
            return { updated: false, addedRow: false, rowNumber: null };
        }

        const rowResult = await _findOrCreateReferenceRow(tabName, normalizedName);
        const rawData = await Database.getData('CACHE', tabName);
        const headers = Array.isArray(rawData) && Array.isArray(rawData[0]) ? rawData[0] : [];
        const abbrColIndex = headers.findIndex((header) => String(header || '').trim() === 'Abbreviations');

        if (abbrColIndex === -1 || !rowResult.rowNumber) {
            throw new Error(`[production-utils] Missing Abbreviations column in CACHE/${tabName}`);
        }

        const targetRow = Array.isArray(rawData[rowResult.rowNumber - 1]) ? rawData[rowResult.rowNumber - 1] : [];
        const existingAbbr = String(targetRow[abbrColIndex] || '').trim();
        const nextAbbr = String(abbreviation || '').trim();

        if (existingAbbr === nextAbbr) {
            return { updated: false, addedRow: rowResult.added, rowNumber: rowResult.rowNumber };
        }

        await Database.setCellValue('CACHE', tabName, rowResult.rowNumber, abbrColIndex + 1, nextAbbr);

        invalidateCache([
            { namespace: 'api', methodName: 'computeIdentifier', args: [] },
            { namespace: 'production_utils', methodName: 'computeIdentifierReferenceData', args: [] }
        ], true);

        return { updated: true, addedRow: rowResult.added, rowNumber: rowResult.rowNumber };
    }

    /**
     * Ensure a canonical reference name exists in the index.
     * @param {'Clients'|'Shows'} referenceTab
     * @param {string} name
     * @returns {Promise<{added:boolean,rowNumber:number|null}>}
     */
    static async addReferenceName(referenceTab, name) {
        const tabName = referenceTab === 'Shows' ? 'Shows' : 'Clients';
        const normalizedName = _normalizeIndexName(name);
        if (!normalizedName) {
            return { added: false, rowNumber: null };
        }

        const rowResult = await _findOrCreateReferenceRow(tabName, normalizedName);
        _invalidateReferenceCaches();
        return { added: rowResult.added, rowNumber: rowResult.rowNumber };
    }

    /**
     * Append an abbreviation token to an existing canonical name.
     * Preserves existing abbreviations and writes only the abbreviation cell.
     * @param {'Clients'|'Shows'} referenceTab
     * @param {string} name
     * @param {string} abbreviation
     * @returns {Promise<{updated:boolean,addedRow:boolean,rowNumber:number|null,abbreviations:string}>}
     */
    static async appendReferenceAbbreviation(referenceTab, name, abbreviation) {
        const tabName = referenceTab === 'Shows' ? 'Shows' : 'Clients';
        const normalizedName = _normalizeIndexName(name);
        const nextAbbr = _normalizeIndexName(abbreviation);

        if (!normalizedName || !nextAbbr) {
            return { updated: false, addedRow: false, rowNumber: null, abbreviations: '' };
        }

        const rowResult = await _findOrCreateReferenceRow(tabName, normalizedName);
        const rawData = await Database.getData('CACHE', tabName);
        const headers = Array.isArray(rawData) && Array.isArray(rawData[0]) ? rawData[0] : [];
        const abbrColIndex = headers.findIndex((header) => String(header || '').trim() === 'Abbreviations');

        if (abbrColIndex === -1 || !rowResult.rowNumber) {
            throw new Error(`[production-utils] Missing Abbreviations column in CACHE/${tabName}`);
        }

        const targetRow = Array.isArray(rawData[rowResult.rowNumber - 1]) ? rawData[rowResult.rowNumber - 1] : [];
        const existingAbbrText = String(targetRow[abbrColIndex] || '').trim();
        const mergedAbbr = _mergeAbbreviations(existingAbbrText, nextAbbr);

        if (mergedAbbr === existingAbbrText) {
            return {
                updated: false,
                addedRow: rowResult.added,
                rowNumber: rowResult.rowNumber,
                abbreviations: mergedAbbr
            };
        }

        await Database.setCellValue('CACHE', tabName, rowResult.rowNumber, abbrColIndex + 1, mergedAbbr);
        _invalidateReferenceCaches();

        return {
            updated: true,
            addedRow: rowResult.added,
            rowNumber: rowResult.rowNumber,
            abbreviations: mergedAbbr
        };
    }

    /**
     * Get show details by project identifier
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} identifier - Project identifier (e.g., "LOCKHEED MARTIN 2025 NGAUS")
     * @returns {Promise<Object|null>} Show details object or null if not found
     */
    static async getShowDetails(deps, identifier) {
        if (!identifier) return null;

        const tabName = "Production Schedule";
        
        // Get dynamic mapping from ProductionSchedule headers
        const mapping = await deps.call(ProductionUtils.GetMappingFromProductionSchedule);
        
        // Get all production schedule data
        const data = await deps.call(Database.getData, 'PROD_SCHED', tabName, mapping);
        
        // Find the row matching the identifier
        for (const row of data) {
            const showName = row.Show;
            const client = row.Client;
            const yearVal = row.Year;
            
            if (showName && client && yearVal) {
                const computedIdentifier = await deps.call(ProductionUtils.computeIdentifier, showName, client, yearVal);
                if (computedIdentifier === identifier) {
                    return row;
                }
            }
        }
        
        return null;
    }


    /**
     * Get the ship date for a project as an ISO date string (YYYY-MM-DD).
     * Returns null if the project cannot be found or has no resolvable ship date.
     * @param {Object} deps
     * @param {string} projectIdentifier
     * @returns {Promise<string|null>}
     */
    static async getProjectShipDate(deps, projectIdentifier) {
        const row = await deps.call(ProductionUtils.getShowDetails, projectIdentifier);
        if (!row) return null;
        const ship = _calculateShipDate(row);
        if (!ship) return null;
        return toISODateString(ship);
    }

    static async getProjectShipDateFromRow(deps, row) {
        if (!row) return null;
        const ship = _calculateShipDate(row);
        if (!ship) return null;
        return toISODateString(ship);
    }

    static async getProjectReturnDateFromRow(deps, row) {
        if (!row) return null;
        const ship = _calculateShipDate(row);
        const ret = _calculateReturnDate(row, ship);
        if (!ret) return null;
        return toISODateString(ret);
    }

    static async getProjectReturnDate(deps, projectIdentifier) {
        const row = await deps.call(ProductionUtils.getShowDetails, projectIdentifier);
        if (!row) return null;
        const ship = _calculateShipDate(row);
        const ret = _calculateReturnDate(row, ship);
        if (!ret) return null;
        return toISODateString(ret);
    }

    /**
     * Guess ship date based on other date fields in the row
     * API function used by reactive store analysis to fill in missing ship dates
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {Object} row - Schedule row with date fields (Ship, S. Start, S. End, Year)
     * @returns {Promise<string|null>} Guessed ship date in MM/DD/YYYY format or null
     */
    static async guessShipDate(deps, row) {
        try {
            // Only guess if Ship is empty
            if (row.Ship && row.Ship.toString().trim() !== '') {
                return row.Ship; // Return existing value
            }
            
            // Use shared calculation logic
            const guessedDate = _calculateShipDate(row);
            
            if (guessedDate) {
                // Format as MM/DD/YYYY
                const month = String(guessedDate.getMonth() + 1).padStart(2, '0');
                const day = String(guessedDate.getDate()).padStart(2, '0');
                const year = guessedDate.getFullYear();
                return `${month}/${day}/${year}`;
            }
            
            return null;
        } catch (error) {
            console.warn('[production-utils] Failed to guess ship date:', error);
            return null;
        }
    }

}

export const ProductionUtils = wrapMethods(
    productionUtils_uncached,
    'production_utils',
    [
        'ensureScheduleReferenceRows',
        'updateReferenceAbbreviation',
        'addReferenceName',
        'appendReferenceAbbreviation'
    ]
);

/**
 * Find the matching packlist tab for an identifier string.
 * Tries in order: exact → case-insensitive → normalized (strip non-alphanumeric, uppercase).
 * This is the single source of truth for packlist tab resolution.
 * @param {string} identifier
 * @param {Array<{title:string}>} tabs
 * @returns {{title:string}|null}
 */
export function findPackListTab(identifier, tabs) {
    if (!identifier || !Array.isArray(tabs)) return null;
    const exact = tabs.find(t => t.title === identifier);
    if (exact) return exact;
    const lc = identifier.toLowerCase();
    const ci = tabs.find(t => t.title.toLowerCase() === lc);
    if (ci) return ci;
    const norm = _normalizeMatchText(identifier);
    return tabs.find(t => _normalizeMatchText(t.title) === norm) || null;
}


// Helper functions not exposed via API

/**
 * Calculate ship date from row data with fallbacks
 * Shared helper used by overlap calculations and date inference
 * @param {Object} row - Schedule row with date fields (Ship, S. Start, S. End, Year)
 * @returns {Date|null} Ship date or null
 * @private
 */
function _calculateShipDate(row) {
    const year = row.Year;
    
    // Try explicit Ship date first
    let ship = parseDate(row.Ship, true, year);
    if (ship) return ship;
    
    // Fallback 1: S. Start - 14 days
    const sStart = parseDate(row['S. Start'], true, year);
    if (sStart) {
        ship = new Date(sStart.getTime() - 14 * 86400000);
        
        // Ensure ship date is before show start date
        // If forcing the year makes ship date >= show start, keep it in the previous year
        if (ship.getFullYear() !== year) {
            const shipWithYearAdjusted = new Date(ship);
            shipWithYearAdjusted.setFullYear(Number(year));
            
            // Only adjust year if it keeps ship date before show start
            if (shipWithYearAdjusted < sStart) {
                ship = shipWithYearAdjusted;
            }
        }
        
        return ship;
    }
    
    // Fallback 2: S. End - 21 days
    const sEnd = parseDate(row['S. End'], true, year);
    if (sEnd) {
        ship = new Date(sEnd.getTime() - 21 * 86400000);
        
        // Ensure ship date is before show end date
        // If forcing the year makes ship date >= show end, keep it in the previous year
        if (ship.getFullYear() !== year) {
            const shipWithYearAdjusted = new Date(ship);
            shipWithYearAdjusted.setFullYear(Number(year));
            
            // Only adjust year if it keeps ship date before show end
            if (shipWithYearAdjusted < sEnd) {
                ship = shipWithYearAdjusted;
            }
        }
        
        return ship;
    }
    
    return null;
}

/**
 * Calculate return date from row data with fallbacks
 * Shared helper used by overlap calculations
 * @param {Object} row - Schedule row with date fields
 * @param {Date|null} shipDate - Already calculated ship date (optional)
 * @returns {Date|null} Return date or null
 * @private
 */
function _calculateReturnDate(row, shipDate = null) {
    const year = row.Year;
    
    // Try explicit return date first
    let ret = parseDate(row['Expected Return Date'], true, year);
    if (ret) return ret;
    
    // Fallback 1: S. End + 10 days
    const sEnd = parseDate(row['S. End'], true, year);
    if (sEnd) {
        ret = new Date(sEnd.getTime() + 10 * 86400000);
        if (ret.getFullYear() != year) ret.setFullYear(Number(year));
        return ret;
    }
    
    // Fallback 2: S. Start + 30 days
    const sStart = parseDate(row['S. Start'], true, year);
    if (sStart) {
        ret = new Date(sStart.getTime() + 30 * 86400000);
        if (ret.getFullYear() != year) ret.setFullYear(Number(year));
        return ret;
    }
    
    // Fallback 3: Ship date + 30 days
    if (shipDate) {
        ret = new Date(shipDate.getTime() + 30 * 86400000);
        if (ret.getFullYear() != year) ret.setFullYear(Number(year));
        return ret;
    }
    
    return null;
}

function _normalizeIndexName(value) {
    return String(value || '').trim();
}

function _normalizeMatchText(value) {
    return _normalizeIndexName(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function _splitAbbreviations(value) {
    return String(value || '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
}

function _findReferenceConflict(candidate, indexData) {
    const rawNorm = _normalizeMatchText(candidate);
    if (!rawNorm || !Array.isArray(indexData) || indexData.length === 0) {
        return null;
    }

    const exactName = indexData.find(entry => _normalizeMatchText(entry.name) === rawNorm);
    if (exactName) {
        return { type: 'exact-name', name: exactName.name };
    }

    const exactAbbreviation = indexData.find(entry =>
        Array.isArray(entry.abbreviations) &&
        entry.abbreviations.some(abbr => _normalizeMatchText(abbr) === rawNorm)
    );
    if (exactAbbreviation) {
        return { type: 'exact-abbreviation', name: exactAbbreviation.name };
    }

    return null;
}

function _mergeAbbreviations(existingText, nextToken) {
    const tokens = _splitAbbreviations(existingText);
    const normalizedTokens = new Set(tokens.map(token => _normalizeMatchText(token)));

    if (!normalizedTokens.has(_normalizeMatchText(nextToken))) {
        tokens.push(nextToken);
    }

    return tokens.join(', ');
}

async function _getReferenceIndexData(tabName) {
    const nameColumn = tabName === 'Shows' ? 'Shows' : 'Clients';
    const rows = await Database.getData('CACHE', tabName, {
        name: nameColumn,
        abbr: 'Abbreviations'
    });

    return rows
        .map(row => ({
            name: _normalizeIndexName(row.name),
            abbreviations: _splitAbbreviations(row.abbr)
        }))
        .filter(row => row.name);
}

function _classifyReferenceState(rawValue, indexData) {
    const rawNorm = _normalizeMatchText(rawValue);
    if (!rawNorm || !Array.isArray(indexData) || indexData.length === 0) {
        return { status: 'missing', bestMatch: '' };
    }

    const exactName = indexData.find(entry => _normalizeMatchText(entry.name) === rawNorm);
    if (exactName) {
        return { status: 'exact-name', bestMatch: exactName.name };
    }

    const exactAbbreviation = indexData.find(entry =>
        Array.isArray(entry.abbreviations) &&
        entry.abbreviations.some(abbr => _normalizeMatchText(abbr) === rawNorm)
    );
    if (exactAbbreviation) {
        return { status: 'exact-abbreviation', bestMatch: exactAbbreviation.name };
    }

    let bestMatch = '';
    try {
        const names = indexData.map(entry => entry.name);
        const abbrList = indexData.map(entry => (entry.abbreviations || []).join(', '));
        bestMatch = GetTopFuzzyMatch(rawValue, names, abbrList, 2.5);
    } catch (error) {
        bestMatch = '';
    }

    if (bestMatch) {
        return { status: 'fuzzy-pass', bestMatch };
    }

    const sortedCandidates = _rankReferenceCandidates(rawValue, indexData, _guessAbbreviations(rawValue));
    if (sortedCandidates.length > 1 && sortedCandidates[0].score - sortedCandidates[1].score < 0.15) {
        return { status: 'ambiguous', bestMatch: sortedCandidates[0].name };
    }

    return { status: 'missing', bestMatch: sortedCandidates[0]?.name || '' };
}

function _rankReferenceCandidates(rawValue, indexData, guessedAbbreviations = []) {
    const rawNorm = _normalizeMatchText(rawValue);
    const rawUpper = _normalizeIndexName(rawValue).toUpperCase();
    const guessedSet = new Set((guessedAbbreviations || []).map(_normalizeMatchText));

    const scored = (indexData || []).map(entry => {
        const nameNorm = _normalizeMatchText(entry.name);
        const abbrNorms = (entry.abbreviations || []).map(_normalizeMatchText);
        const nameDistance = _levenshtein(rawNorm, nameNorm);
        const maxLen = Math.max(rawNorm.length, nameNorm.length, 1);
        const editScore = 1 - (nameDistance / maxLen);
        const startsScore = nameNorm.startsWith(rawNorm) || rawNorm.startsWith(nameNorm) ? 0.2 : 0;

        const guessedAbbrMatch = abbrNorms.some(abbr => guessedSet.has(abbr)) ? 0.35 : 0;
        const containsRawAsAbbr = abbrNorms.includes(rawNorm) ? 0.45 : 0;
        const tokenOverlap = _tokenOverlap(rawUpper, entry.name.toUpperCase()) * 0.25;

        const score = editScore + startsScore + guessedAbbrMatch + containsRawAsAbbr + tokenOverlap;
        let reason = 'fuzzy name similarity';
        if (containsRawAsAbbr) reason = 'already close to existing abbreviation';
        else if (guessedAbbrMatch) reason = 'matches guessed abbreviation pattern';

        return {
            name: entry.name,
            score,
            reason
        };
    });

    return scored.sort((a, b) => b.score - a.score);
}

function _filterHighConfidenceCandidates(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
        return [];
    }

    const topScore = candidates[0].score;

    return candidates.filter(candidate =>
        candidate.score >= 0.9 || (candidate.score >= 0.5 && candidate.score >= topScore - 0.12)
    );
}

function _guessAbbreviations(rawValue) {
    const cleaned = _normalizeIndexName(rawValue);
    if (!cleaned) return [];

    const words = cleaned
        .split(/\s+/)
        .map(w => w.replace(/[^A-Za-z0-9]/g, ''))
        .filter(Boolean);

    const stopWords = new Set(['THE', 'AND', 'OF', 'FOR', 'TO', 'IN', 'AT', 'ON', 'BY']);
    const significant = words.filter(w => !stopWords.has(w.toUpperCase()));
    const basis = significant.length > 0 ? significant : words;

    const candidates = new Set();
    candidates.add(cleaned);

    if (basis.length > 0) {
        candidates.add(basis.map(w => w[0]).join('').toUpperCase());
        candidates.add(basis.map(w => w.slice(0, 2)).join('').toUpperCase());
        candidates.add(basis.map(w => w.slice(0, 3)).join('').toUpperCase());
    }

    const alnum = cleaned.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (alnum) {
        candidates.add(alnum);
        candidates.add(alnum.replace(/[AEIOU]/g, ''));
        candidates.add(alnum.slice(0, 6));
    }

    return Array.from(candidates).filter(Boolean);
}

function _tokenOverlap(a, b) {
    const left = new Set(String(a || '').split(/\s+/).filter(Boolean));
    const right = new Set(String(b || '').split(/\s+/).filter(Boolean));
    if (left.size === 0 || right.size === 0) return 0;

    let common = 0;
    left.forEach(token => {
        if (right.has(token)) common += 1;
    });

    return common / Math.max(left.size, right.size);
}

function _levenshtein(a, b) {
    const s = String(a || '');
    const t = String(b || '');
    const m = s.length;
    const n = t.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i += 1) dp[i][0] = i;
    for (let j = 0; j <= n; j += 1) dp[0][j] = j;

    for (let i = 1; i <= m; i += 1) {
        for (let j = 1; j <= n; j += 1) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }

    return dp[m][n];
}

function _invalidateReferenceCaches() {
    invalidateCache([
        { namespace: 'database', methodName: 'getData', args: ['CACHE', 'Clients'] },
        { namespace: 'database', methodName: 'getData', args: ['CACHE', 'Shows'] },
        { namespace: 'api', methodName: 'computeIdentifier', args: [] },
        { namespace: 'production_utils', methodName: 'computeIdentifierReferenceData', args: [] },
        { namespace: 'production_utils', methodName: 'checkReferenceNameState', args: [] },
        { namespace: 'production_utils', methodName: 'getReferenceResolutionOptions', args: [] }
    ], true);
}

async function _appendMissingReferenceRows(tabName, names) {
    if (!Array.isArray(names) || names.length === 0) {
        return 0;
    }

    let addedCount = 0;
    for (const name of names) {
        const result = await _findOrCreateReferenceRow(tabName, name);
        if (result.added) {
            addedCount += 1;
        }
    }
    return addedCount;
}

async function _findOrCreateReferenceRow(tabName, name) {
    const rawData = await Database.getData('CACHE', tabName);
    const headers = Array.isArray(rawData) && Array.isArray(rawData[0]) ? rawData[0] : [];
    const nameColumn = tabName === 'Shows' ? 'Shows' : 'Clients';
    const nameColIndex = headers.findIndex((header) => String(header || '').trim() === nameColumn);

    if (nameColIndex === -1) {
        throw new Error(`[production-utils] Missing ${nameColumn} column in CACHE/${tabName}`);
    }

    for (let rowIndex = 1; rowIndex < rawData.length; rowIndex += 1) {
        const row = Array.isArray(rawData[rowIndex]) ? rawData[rowIndex] : [];
        const existingName = _normalizeIndexName(row[nameColIndex]);
        if (existingName && existingName.toLowerCase() === name.toLowerCase()) {
            return { rowNumber: rowIndex + 1, added: false };
        }
    }

    const rowValues = new Array(Math.max(headers.length, nameColIndex + 1)).fill('');
    rowValues[nameColIndex] = name;
    const rowNumber = await Database.appendSheetRow('CACHE', tabName, rowValues);
    return { rowNumber, added: true };
}