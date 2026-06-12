import { Database, parseDate, toISODateString, toUSDateString, wrapMethods, searchFilter, GetTopFuzzyMatch } from '../index.js';

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
            //console.log('[production-utils] No data available to generate mapping');
            return {};
        }
        
        // Get headers from the first row of the 2D array
        const headers = rawData[0];
        
        if (!Array.isArray(headers)) {
            //console.log('[production-utils] Invalid data structure, expected array of headers');
            return {};
        }
        
        // Create mapping where key equals value (identity mapping for all headers)
        const mapping = {};
        headers.forEach(header => {
            if (header && header.toString().trim()) { // Skip empty headers
                mapping[header] = header;
            }
        });
        
        //console.log('[production-utils] Generated mapping from ProductionSchedule headers:', mapping);
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
        //console.log('[production-utils] getOverlappingShows called with:', parameters);
        const tabName = "Production Schedule";
        
        // Get dynamic mapping from ProductionSchedule headers
        const mapping = await deps.call(ProductionUtils.GetMappingFromProductionSchedule);
        
        let data = await deps.call(Database.getData, 'PROD_SCHED', tabName, mapping);
        //console.log('[production-utils] Loaded schedule data:', data);

        // Apply text filters first
        if (searchParams) {
            data = searchFilter(data, searchParams);
        }

        // If no parameters or no date filters, return all data
        if (!parameters || !parameters.dateFilters || parameters.dateFilters.length === 0) {
            //console.log('[production-utils] No date filters provided, returning all data');
            return data;
        }

        const dateFilters = parameters.dateFilters;
        //console.log('[production-utils] Processing date filters:', dateFilters);

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
                // Use year-aware Direction-2 match: parse year from identifier, filter schedule, then match
                const rows = await deps.call(ProductionUtils.findScheduleRowsForPacklist, value, data);
                const row = rows[0] ?? null;
                if (!row) {
                    console.warn('[production-utils] No show found for identifier:', value);
                    return null;
                }
                const ship = _calculateShipDate(row);
                const ret = _calculateReturnDate(row, ship);
                if (filter.column === 'Return' && filter.type === 'after') {
                    return ship;
                } else if (filter.column === 'Ship' && filter.type === 'before') {
                    return ret;
                }
                return getRowDate(row, filter.column);
            }
            
            return null;
        };

        // Calculate year range to check (needed for year filter optimization)
        const filterDates = await Promise.all(
            dateFilters.map(f => resolveFilterValue(f, data))
        );
        const validDates = filterDates.filter(d => d !== null);
        
        if (validDates.length === 0) {
            //console.log('[production-utils] Could not resolve any filter dates');
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

        //console.log(`[production-utils] Filtered ${data.length} shows to ${filtered.length} matching date filters`);
        
        // Normalize all date columns to ensure correct years before returning
        // This fixes user data entry errors (e.g., Dec ship dates for Jan shows)
        filtered.forEach(row => {
            // Normalize Ship date using validation logic
            const correctedShip = _calculateShipDate(row);
            if (correctedShip) {
                row.Ship = toUSDateString(correctedShip);
            }
            
            // Normalize S. Start date
            const sStart = parseDate(row['S. Start'], true, row.Year);
            if (sStart) {
                row['S. Start'] = toUSDateString(sStart);
            }
            
            // Normalize S. End date
            const sEnd = parseDate(row['S. End'], true, row.Year);
            if (sEnd) {
                row['S. End'] = toUSDateString(sEnd);
            }
            
            // Normalize Expected Return Date using validation logic
            const correctedReturn = _calculateReturnDate(row, correctedShip);
            if (correctedReturn && row['Expected Return Date']) {
                row['Expected Return Date'] = toUSDateString(correctedReturn);
            }
        });
        
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
        //console.log('[production-utils] Loaded reference data for fuzzy matching:', { clientsData, showsData });
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
     * @param {string} rawName
     * @param {'client'|'show'} referenceType
     * @returns {Promise<Object|null>}
     */
    static async checkReferenceNameState(deps, rawName, referenceType = 'client') {
        const kind = referenceType === 'show' ? 'show' : 'client';
        const rawValue = _normalizeIndexName(rawName);

        if (!rawValue) {
            return null;
        }

        const refData = await deps.call(ProductionUtils.computeIdentifierReferenceData);
        const ref = kind === 'show' ? refData.shows : refData.clients;
        const indexData = ref.names
            .map((name, i) => ({ name: _normalizeIndexName(name), abbreviations: _splitAbbreviations(ref.abbrs[i] || '') }))
            .filter(entry => entry.name);
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
        const normalizedRaw = _normalizeIndexName(rawValue);
        const refData = await deps.call(ProductionUtils.computeIdentifierReferenceData);
        const ref = kind === 'show' ? refData.shows : refData.clients;
        const indexData = ref.names
            .map((name, i) => ({ name: _normalizeIndexName(name), abbreviations: _splitAbbreviations(ref.abbrs[i] || '') }))
            .filter(entry => entry.name);

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
    static async addCustomReferenceEntry(referenceType, canonicalName, abbreviation) {
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

        const refData = await ProductionUtils.computeIdentifierReferenceData();
        const ref = kind === 'show' ? refData.shows : refData.clients;
        const indexData = ref.names
            .map((name, i) => ({ name: _normalizeIndexName(name), abbreviations: _splitAbbreviations(ref.abbrs[i] || '') }))
            .filter(entry => entry.name);
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

        return {
            updated: true,
            addedRow: rowResult.added,
            rowNumber: rowResult.rowNumber,
            abbreviations: mergedAbbr
        };
    }

    /**
     * Deduplicate schedule data by show identifier (for clients with multiple booths).
     * Use this when you need unique shows for overlap calculations or counts.
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {Array} scheduleData - Array of schedule rows from getOverlappingShows
     * @returns {Promise<Array>} Deduplicated array with one row per unique show
     */
    static async deduplicateScheduleByShow(deps, scheduleData) {
        if (!Array.isArray(scheduleData)) {
            return [];
        }
        
        const seen = new Map();
        const deduplicated = [];
        
        for (const row of scheduleData) {
            // Use existing Identifier or compute one
            let identifier = row.Identifier;
            if (!identifier && row.Show && row.Client && row.Year) {
                identifier = await deps.call(ProductionUtils.computeIdentifier, row.Show, row.Client, row.Year);
            }
            
            // Skip rows without valid identifier
            if (!identifier) {
                deduplicated.push(row);
                continue;
            }
            
            // Skip if we've already seen this show
            if (seen.has(identifier)) {
                continue;
            }
            
            seen.set(identifier, true);
            deduplicated.push(row);
        }
        
        if (deduplicated.length < scheduleData.length) {
            //console.log(`[production-utils] Deduplicated ${scheduleData.length} rows to ${deduplicated.length} unique shows`);
        }
        
        return deduplicated;
    }

    /**
     * Direction 2: Packlist → Schedule.
     * Find schedule row(s) matching a packlist tab title.
     * Parses the year from the title to year-filter the schedule before matching,
     * preventing cross-year mismatches. Strips suffix words (right of year) one at a
     * time to handle suffix-variant tabs (e.g. "NGAUS MEETING ROOM" → "NGAUS").
     * Always stops stripping before the year token would be removed.
     * @param {Object} deps
     * @param {string} packlistTitle - Packlist tab title (may include suffix)
     * @param {Array} [scheduleData] - Pre-loaded schedule rows (optional; loaded if omitted)
     * @returns {Promise<Array>} Matching schedule rows; first element is the canonical match
     */
    static async findScheduleRowsForPacklist(deps, packlistTitle, scheduleData = null) {
        if (!packlistTitle) return [];

        // Load schedule data if not provided
        let data = scheduleData;
        if (!data) {
            const mapping = await deps.call(ProductionUtils.GetMappingFromProductionSchedule);
            data = await deps.call(Database.getData, 'PROD_SCHED', 'Production Schedule', mapping);
        }

        // Parse year from the packlist title to narrow the schedule search
        const titleParts = _parseIdentifierParts(packlistTitle);
        const targetYear = titleParts ? titleParts.year : null;

        // Year-filter schedule rows (all rows if year not parseable)
        const yearData = targetYear
            ? data.filter(row => String(parseInt(row.Year, 10)) === targetYear)
            : data;

        if (yearData.length === 0) return [];

        // Build computed-identifier → row map for year-filtered rows; keep first for duplicate shows
        const scheduleMap = new Map();
        for (const row of yearData) {
            if (!row.Show || !row.Client || !row.Year) continue;
            const computed = await deps.call(ProductionUtils.computeIdentifier, row.Show, row.Client, row.Year);
            if (computed && !scheduleMap.has(computed)) {
                scheduleMap.set(computed, row);
            }
        }

        const candidates = Array.from(scheduleMap.keys());
        if (candidates.length === 0) return [];

        // Find the index of the year token so suffix stripping never removes it
        const words = packlistTitle.trim().split(/\s+/);
        const yearIndex = words.findIndex(w => /^\d{4}$/.test(w));
        // Must keep at least: everything up to and including year, plus one show word
        const minWords = yearIndex >= 0 ? yearIndex + 2 : 1;

        for (let count = words.length; count >= minWords; count--) {
            const candidate = words.slice(0, count).join(' ');
            const match = await deps.call(ProductionUtils.findBestProjectIdentifierMatch, candidate, candidates);
            if (match) {
                if (count < words.length) {
                    //console.log(`[production-utils] Matched suffix variant: "${packlistTitle}" -> "${match}"`);
                }
                const row = scheduleMap.get(match);
                return row ? [row] : [];
            }
        }

        return [];
    }

    /**
     * Get show details by project identifier. Delegates to findScheduleRowsForPacklist.
     * @param {Object} deps
     * @param {string} identifier - Packlist identifier (may include suffix variant)
     * @returns {Promise<Object|null>} Schedule row or null
     */
    static async getShowDetails(deps, identifier) {
        if (!identifier) return null;
        const rows = await deps.call(ProductionUtils.findScheduleRowsForPacklist, identifier);
        const row = rows[0] ?? null;
        if (!row) return null;

        // Normalize date columns before returning to ensure correct years
        const correctedShip = _calculateShipDate(row);
        if (correctedShip) row.Ship = toUSDateString(correctedShip);

        const sStart = parseDate(row['S. Start'], true, row.Year);
        if (sStart) row['S. Start'] = toUSDateString(sStart);

        const sEnd = parseDate(row['S. End'], true, row.Year);
        if (sEnd) row['S. End'] = toUSDateString(sEnd);

        const correctedReturn = _calculateReturnDate(row, correctedShip);
        if (correctedReturn && row['Expected Return Date']) {
            row['Expected Return Date'] = toUSDateString(correctedReturn);
        }

        return row;
    }

    /**
     * Direction 1: Schedule → Packlist.
     * Find all packlist tabs (primary + suffix variants) for a schedule row.
     * Eliminates the repeated computeIdentifier + findAllPackListTabsForShow boilerplate.
     * @param {Object} deps
     * @param {Object} scheduleRow - Schedule row with Show, Client, Year (and optional Identifier)
     * @param {Array<{title:string}>} tabs - Available packlist tabs
     * @returns {Promise<Array<{title:string}>>} Matching tabs; empty array if none found
     */
    static async findPacklistTabsForScheduleRow(deps, scheduleRow, tabs) {
        if (!scheduleRow || !Array.isArray(tabs)) return [];
        const identifier = scheduleRow.Identifier ||
            await deps.call(ProductionUtils.computeIdentifier, scheduleRow.Show, scheduleRow.Client, scheduleRow.Year);
        if (!identifier) return [];
        return deps.call(ProductionUtils.findAllPackListTabsForShow, identifier, tabs);
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
        return deps.call(ProductionUtils.getProjectShipDateFromRow, row);
    }

    static async getProjectShipDateFromRow(deps, row) {
        if (!row) return null;
        return toISODateString(_calculateShipDate(row));
    }

    static async getProjectReturnDateFromRow(deps, row) {
        if (!row) return null;
        const ship = _calculateShipDate(row);
        return toISODateString(_calculateReturnDate(row, ship));
    }

    static async getProjectReturnDate(deps, projectIdentifier) {
        const row = await deps.call(ProductionUtils.getShowDetails, projectIdentifier);
        return deps.call(ProductionUtils.getProjectReturnDateFromRow, row);
    }

    /**
     * Normalize ship date to include year, guessing if missing
     * API function used by reactive store analysis to ensure all ship dates have years
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {Object} row - Schedule row with date fields (Ship, S. Start, S. End, Year)
     * @returns {Promise<string|null>} Ship date in MM/DD/YYYY format or null
     */
    static async guessShipDate(deps, row) {
        return _normalizeScheduleDate(_calculateShipDate(row), 'ship');
    }

    /**
     * Normalize show start date to include year
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {Object} row - Schedule row with date fields
     * @returns {Promise<string|null>} Start date in MM/DD/YYYY format or null
     */
    static async normalizeStartDate(deps, row) {
        return _normalizeScheduleDate(parseDate(row['S. Start'], true, row.Year), 'start');
    }

    /**
     * Normalize show end date to include year
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {Object} row - Schedule row with date fields
     * @returns {Promise<string|null>} End date in MM/DD/YYYY format or null
     */
    static async normalizeEndDate(deps, row) {
        return _normalizeScheduleDate(parseDate(row['S. End'], true, row.Year), 'end');
    }


    /**
     * Resolve the best matching project identifier candidate.
     * Matching order: exact -> case-insensitive -> normalized -> fuzzy/abbreviation fallback.
     * @param {string} identifier
     * @param {string[]} candidates
     * @returns {string|null}
     */
    static async findBestProjectIdentifierMatch(deps, identifier, candidates = []) {
        const rawIdentifier = _normalizeIndexName(identifier);
        if (!rawIdentifier || !Array.isArray(candidates) || candidates.length === 0) {
            return null;
        }

        const cleanCandidates = candidates
            .map(candidate => _normalizeIndexName(candidate))
            .filter(Boolean);

        if (cleanCandidates.length === 0) {
            return null;
        }

        // Quick sync checks — short-circuit before any async work
        const exact = cleanCandidates.find(candidate => candidate === rawIdentifier);
        if (exact) return exact;

        const lowerIdentifier = rawIdentifier.toLowerCase();
        const caseInsensitive = cleanCandidates.find(candidate => candidate.toLowerCase() === lowerIdentifier);
        if (caseInsensitive) return caseInsensitive;

        const normalizedIdentifier = _normalizeMatchText(rawIdentifier);
        const normalizedMatch = cleanCandidates.find(candidate => _normalizeMatchText(candidate) === normalizedIdentifier);
        if (normalizedMatch) return normalizedMatch;

        // Component-level resolution: parse year out of identifiers, resolve client/show via index
        // Both query AND candidate parts are resolved to canonical form before comparing, so
        // abbreviated tab names like "AUSTAL 2026 SNA" match canonical "AUSTAL USA 2026 SURFACE NAVY".
        if (deps) {
            const queryParts = _parseIdentifierParts(rawIdentifier);
            if (queryParts) {
                const refData = await deps.call(ProductionUtils.computeIdentifierReferenceData);

                // Resolve query parts to canonical form
                let resolvedQueryClient = queryParts.client;
                try {
                    resolvedQueryClient = GetTopFuzzyMatch(queryParts.client, refData.clients.names, refData.clients.abbrs) || queryParts.client;
                } catch (e) {}
                let resolvedQueryShow = queryParts.show;
                try {
                    resolvedQueryShow = GetTopFuzzyMatch(queryParts.show, refData.shows.names, refData.shows.abbrs, 2.5) || queryParts.show;
                } catch (e) {}
                const resolvedQueryNormalized = _normalizeMatchText(`${resolvedQueryClient} ${queryParts.year} ${resolvedQueryShow}`);

                for (const candidate of cleanCandidates) {
                    const candidateParts = _parseIdentifierParts(candidate);
                    if (!candidateParts || candidateParts.year !== queryParts.year) continue;

                    let resolvedClient = candidateParts.client;
                    try {
                        resolvedClient = GetTopFuzzyMatch(candidateParts.client, refData.clients.names, refData.clients.abbrs) || candidateParts.client;
                    } catch (e) {}

                    let resolvedShow = candidateParts.show;
                    try {
                        resolvedShow = GetTopFuzzyMatch(candidateParts.show, refData.shows.names, refData.shows.abbrs, 2.5) || candidateParts.show;
                    } catch (e) {}

                    const resolvedCandidate = `${resolvedClient} ${candidateParts.year} ${resolvedShow}`.trim();
                    if (_normalizeMatchText(resolvedCandidate) === resolvedQueryNormalized) return candidate;
                }
            }
        }

        // Fuzzy fallback with year filtering
        // IMPORTANT: Always prefer matches within the same year to avoid cross-year mismatches
        try {
            const queryParts = _parseIdentifierParts(rawIdentifier);
            
            // If we can extract a year, prioritize same-year candidates
            if (queryParts) {
                const sameYearCandidates = cleanCandidates.filter(candidate => {
                    const candidateParts = _parseIdentifierParts(candidate);
                    return candidateParts && candidateParts.year === queryParts.year;
                });
                
                // Try fuzzy match within same year first
                if (sameYearCandidates.length > 0) {
                    const abbreviationRange = sameYearCandidates.map(candidate => 
                        _buildIdentifierAbbreviationSet(candidate).join(', ')
                    );
                    const fuzzyThreshold = rawIdentifier.length > 14 ? 3 : 2;
                    const match = GetTopFuzzyMatch(rawIdentifier, sameYearCandidates, abbreviationRange, fuzzyThreshold);
                    if (match) return match;
                }
            }
            
            // Last resort: year-agnostic fuzzy match (log warning since this may be incorrect)
            const abbreviationRange = cleanCandidates.map(candidate => 
                _buildIdentifierAbbreviationSet(candidate).join(', ')
            );
            const fuzzyThreshold = rawIdentifier.length > 14 ? 3 : 2;
            const match = GetTopFuzzyMatch(rawIdentifier, cleanCandidates, abbreviationRange, fuzzyThreshold);
            if (match) {
                const queryParts = _parseIdentifierParts(rawIdentifier);
                const matchParts = _parseIdentifierParts(match);
                if (queryParts && matchParts && queryParts.year !== matchParts.year) {
                    console.warn(
                        `[production-utils] Cross-year fuzzy match: "${rawIdentifier}" (${queryParts.year}) -> "${match}" (${matchParts.year})`
                    );
                }
            }
            return match;
        } catch (error) {
            return null;
        }
    }

    
    /**
     * Find the matching packlist tab for an identifier string.
     * Tries in order: exact → case-insensitive → normalized (strip non-alphanumeric, uppercase).
     * This is the single source of truth for packlist tab resolution.
     * @param {string} identifier
     * @param {Array<{title:string}>} tabs
     * @returns {{title:string}|null}
     */
    static async findPackListTab(deps, identifier, tabs) {
        if (!identifier || !Array.isArray(tabs)) return null;
        const titleToTab = new Map();
        const titles = [];

        tabs.forEach((tab) => {
            const title = _normalizeIndexName(tab?.title);
            if (!title || titleToTab.has(title)) {
                return;
            }
            titleToTab.set(title, tab);
            titles.push(title);
        });

        const matchedTitle = await deps.call(ProductionUtils.findBestProjectIdentifierMatch, identifier, titles);
        return matchedTitle ? (titleToTab.get(matchedTitle) || null) : null;
    }

    /**
     * Find all packlist tabs for a show, including suffix variants.
     * A client may have multiple packlists for the same show (e.g., "LOCKHEED 2026 SNA" and
     * "LOCKHEED 2026 SNA MEETING ROOM"). This method finds the primary match using full
     * fuzzy/abbreviation/misspelling logic, then returns any other tabs whose title starts
     * with that canonical primary title followed by a space.
     * @param {Object} deps
     * @param {string} identifier - Project identifier (may be abbreviated or misspelled)
     * @param {Array<{title:string}>} tabs - Available packlist tabs (pre-filtered)
     * @returns {Promise<Array<{title:string}>>} All matching tabs; empty array if none found
     */
    static async findAllPackListTabsForShow(deps, identifier, tabs) {
        if (!identifier || !Array.isArray(tabs)) return [];

        const titleToTab = new Map();
        const titles = [];

        tabs.forEach((tab) => {
            const title = _normalizeIndexName(tab?.title);
            if (!title || titleToTab.has(title)) return;
            titleToTab.set(title, tab);
            titles.push(title);
        });

        // Find primary match using full fuzzy/abbreviation/misspelling logic
        const primaryTitle = await deps.call(ProductionUtils.findBestProjectIdentifierMatch, identifier, titles);
        if (!primaryTitle) return [];

        const results = [];
        const primaryTab = titleToTab.get(primaryTitle);
        if (primaryTab) results.push(primaryTab);

        // Find suffix variants: tabs whose title starts with the canonical primary title + space
        // The space separator prevents false matches (e.g., "SNA" vs "SNAP")
        const canonicalPrefix = primaryTitle.trim().toUpperCase();
        for (const title of titles) {
            if (title === primaryTitle) continue;
            if (title.trim().toUpperCase().startsWith(canonicalPrefix + ' ')) {
                const tab = titleToTab.get(title);
                if (tab) results.push(tab);
            }
        }

        return results;
    }




}

export const ProductionUtils = wrapMethods(
    productionUtils_uncached,
    'production_utils',
    [
        'ensureScheduleReferenceRows',
        'updateReferenceAbbreviation',
        'addReferenceName',
        'appendReferenceAbbreviation',
        'addCustomReferenceEntry'
    ]
    // findScheduleRowsForPacklist and findPacklistTabsForScheduleRow are cacheable read-only methods
);






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
    if (ship) {
        // Validate: ship date should be before show start
        // If ship is after show start and both are in the same year,
        // check if moving ship to previous year makes more sense
        const sStart = parseDate(row['S. Start'], true, year);
        if (sStart && ship >= sStart) {
            // Ship is on or after show start - likely a year boundary issue
            // Move ship to previous year
            const shipPrevYear = new Date(ship);
            shipPrevYear.setFullYear(ship.getFullYear() - 1);
            ship = shipPrevYear;
        }
        return ship;
    }
    
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
    if (ret) {
        // Validate: return date should be after show end (or show start if no end)
        // If return is before show dates and both are in the same year,
        // check if moving return to next year makes more sense
        const sEnd = parseDate(row['S. End'], true, year) || parseDate(row['S. Start'], true, year);
        if (sEnd && ret <= sEnd) {
            // Return is on or before show - likely a year boundary issue
            // Move return to next year
            const retNextYear = new Date(ret);
            retNextYear.setFullYear(ret.getFullYear() + 1);
            ret = retNextYear;
        }
        return ret;
    }
    
    // Fallback 1: S. End + 14 days
    const sEnd = parseDate(row['S. End'], true, year);
    if (sEnd) {
        ret = new Date(sEnd.getTime() + 14 * 86400000);
        // Return date is naturally after show end, so calculated year is correct
        return ret;
    }
    
    // Fallback 2: S. Start + 21 days
    const sStart = parseDate(row['S. Start'], true, year);
    if (sStart) {
        ret = new Date(sStart.getTime() + 21 * 86400000);
        // Return date is naturally after show start, so calculated year is correct
        return ret;
    }
    
    // Fallback 3: Ship date + 30 days
    if (shipDate) {
        ret = new Date(shipDate.getTime() + 30 * 86400000);
        // Return date is naturally after ship date, so calculated year is correct
        return ret;
    }
    
    return null;
}

/**
 * Normalize a Date object to MM/DD/YYYY format with error handling
 * Shared helper for all schedule date normalization functions
 * @param {Date|null} date - Date object to format
 * @param {string} dateType - Type of date for error logging (e.g., 'ship', 'start', 'end')
 * @returns {string|null} Formatted date string or null
 * @private
 */
function _normalizeScheduleDate(date, dateType) {
    try {
        return toUSDateString(date);
    } catch (error) {
        console.warn(`[production-utils] Failed to normalize ${dateType} date:`, error);
        return null;
    }
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

function _parseIdentifierParts(identifier) {
    const match = String(identifier || '').trim().match(/^(.+?)\s+(\d{4})\s+(.+)$/);
    if (!match) return null;
    return { client: match[1].trim(), year: match[2], show: match[3].trim() };
}

function _buildIdentifierAbbreviationSet(identifier) {
    const cleanIdentifier = _normalizeIndexName(identifier);
    if (!cleanIdentifier) return [];

    const variants = new Set([
        cleanIdentifier,
        _normalizeMatchText(cleanIdentifier)
    ]);

    _guessAbbreviations(cleanIdentifier).forEach(variant => {
        if (variant) {
            variants.add(variant);
            variants.add(_normalizeMatchText(variant));
        }
    });

    return Array.from(variants).filter(Boolean);
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