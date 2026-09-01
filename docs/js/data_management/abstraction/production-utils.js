import { Database, parseDate, toISODateString, toUSDateString, wrapMethods, searchFilter, GetTopFuzzyMatch, normalizeHeaderName, normalizeText, normalizeMatchKey } from '../index.js';

/**
 * Keyword used in NameOverrides table to indicate "ignore forever" (permanently suppress alerts).
 * When an override has this keyword in one field, it means "ignore this identifier, don't link it".
 */
const IGNORE_KEYWORD = '__IGNORE__';

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
        
        // Get headers from the first row of the 2D array and normalize them
        const headers = Array.isArray(rawData[0]) 
            ? rawData[0].map(h => normalizeHeaderName(h))
            : [];
        
        if (!Array.isArray(headers) || headers.length === 0) {
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

        // Helper to get date from row based on column.
        // Handles calculated columns (Ship, Return, Date) and any raw date column via parseDate.
        // filterType ('after'|'before') controls which boundary fallback is used when a
        // generic column is empty or unparseable — maximising recall over precision:
        //   'before' → ship date  (earliest the show could be relevant)
        //   'after'  → return date (latest  the show could be relevant)
        const getRowDate = (row, column, filterType) => {
            if (column === 'Ship') {
                return _calculateShipDate(row);
            } else if (column === 'Return') {
                const ship = _calculateShipDate(row);
                return _calculateReturnDate(row, ship);
            } else if (column === 'Date') {
                // Try to get date from S. Start field
                let showDate = parseDate(row['S. Start'], true, row.Year);
                
                // If date not available, try other date fields to infer it
                if (!showDate) {
                    const ship = _calculateShipDate(row);
                    if (ship) {
                        // Typical show is ~7-14 days after ship
                        showDate = new Date(ship.getTime() + 10 * 86400000);
                    }
                }
                return showDate;
            }
            
            // Generic date column: parse with Year context, then apply year-boundary
            // correction if the date is more than 9 months from the show's start date.
            const rawValue = row[column];
            if (rawValue) {
                let parsed = parseDate(rawValue, true, row.Year);
                if (parsed) {
                    const sStart = parseDate(row['S. Start'], true, row.Year);
                    if (sStart) {
                        const diffMs = parsed - sStart;
                        const NINE_MONTHS_MS = 9 * 30 * 24 * 60 * 60 * 1000;
                        if (diffMs > NINE_MONTHS_MS) {
                            // Date is more than 9 months after show start — move back a year
                            const corrected = new Date(parsed);
                            corrected.setFullYear(corrected.getFullYear() - 1);
                            parsed = corrected;
                        } else if (diffMs < -NINE_MONTHS_MS) {
                            // Date is more than 9 months before show start — move forward a year
                            const corrected = new Date(parsed);
                            corrected.setFullYear(corrected.getFullYear() + 1);
                            parsed = corrected;
                        }
                    }
                    return parsed;
                }
            }
            
            // Column is empty or unparseable — fall back to a show boundary estimate
            // so rows without this field are not silently excluded.
            if (filterType === 'before') {
                // For "before" searches use ship date: the earliest the show is relevant
                return _calculateShipDate(row);
            }
            // For "after" searches (including unknown type) use return date:
            // the latest the show is relevant
            const ship = _calculateShipDate(row);
            return _calculateReturnDate(row, ship);
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
                return getRowDate(row, filter.column, filter.type);
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

        // Derive year bounds from filter directions so open-ended filters work correctly.
        // 'after' filters only constrain the lower bound; 'before' filters only constrain the
        // upper bound. A single 'after 2026' filter must include 2027, 2028, etc., and a
        // single 'before 2025' filter must include 2024, 2023, etc.
        let minYear = -Infinity;
        let maxYear = Infinity;
        dateFilters.forEach((filter, i) => {
            const fd = filterDates[i];
            if (!fd) return;
            const y = fd.getFullYear();
            if (filter.type === 'after' && y > minYear) minYear = y;
            else if (filter.type === 'before' && y < maxYear) maxYear = y;
        });

        // Filter data
        const filtered = data.filter(row => {
            // Year optimization: quickly exclude rows outside the plausible year range
            const rowYear = parseInt(row.Year);
            if (!row.Year || (minYear !== -Infinity && rowYear < minYear) || (maxYear !== Infinity && rowYear > maxYear)) {
                return false;
            }

            // Apply all date filters (AND logic - must pass all)
            return dateFilters.every(filter => {
                const rowDate = getRowDate(row, filter.column, filter.type);
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
        
        // Normalize all date columns to ensure correct years before returning.
        // This fixes user data entry errors (e.g., Dec ship dates for Jan shows).
        // NOTE: work on shallow copies — the source objects live in the Database.getData cache
        // and mutating them would corrupt dates for every subsequent cache hit.
        return filtered.map(row => {
            const normalizedRow = { ...row };

            // Normalize Ship date using validation logic
            const correctedShip = _calculateShipDate(normalizedRow);
            if (correctedShip) {
                normalizedRow.Ship = toUSDateString(correctedShip);
            }
            
            // Normalize S. Start date
            const sStart = parseDate(normalizedRow['S. Start'], true, normalizedRow.Year);
            if (sStart) {
                normalizedRow['S. Start'] = toUSDateString(sStart);
            }
            
            // Normalize S. End date
            const sEnd = parseDate(normalizedRow['S. End'], true, normalizedRow.Year);
            if (sEnd) {
                normalizedRow['S. End'] = toUSDateString(sEnd);
            }
            
            // Normalize Expected Return Date using validation logic
            const correctedReturn = _calculateReturnDate(normalizedRow, correctedShip);
            if (correctedReturn && normalizedRow['Expected Return Date']) {
                normalizedRow['Expected Return Date'] = toUSDateString(correctedReturn);
            }

            return normalizedRow;
        });
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
        const buildRef = (data) => {
            const names = data.map(row => row.name || '');
            const abbrs = data.map(row => row.abbr || '');
            const indexData = names
                .map((name, i) => ({ name: normalizeText(name), abbreviations: _splitAbbreviations(abbrs[i] || '') }))
                .filter(entry => entry.name);
            return { names, abbrs, indexData };
        };
        return { clients: buildRef(clientsData), shows: buildRef(showsData) };
    }

    /**
     * Analyze whether a schedule row value is healthy against the index.
     * Returns a clickable alert payload for unresolved entries; returns null when healthy.
     * If scheduleRow is provided, checks NameOverrides first to suppress alerts for overridden entries.
     * @param {Object} deps
     * @param {string} rawName
     * @param {'client'|'show'} referenceType
     * @param {Object} [scheduleRow] - Optional row with Client, Show, Year for override checking
     * @returns {Promise<Object|null>}
     */
    static async checkReferenceNameState(deps, rawName, referenceType = 'client', scheduleRow = null) {
        // If we have schedule row context, check for overrides first
        // Check both schedule and packlist fields since identifiers should match
        if (scheduleRow && scheduleRow.Client && scheduleRow.Show && scheduleRow.Year) {
            const overrides = await deps.call(ProductionUtils.getNameOverrides);
            const identifier = await deps.call(ProductionUtils.computeIdentifier, 
                scheduleRow.Show, scheduleRow.Client, scheduleRow.Year);
            
            if (identifier && _findOverride(overrides, normalizeText(identifier).toLowerCase())) {
                return null;
            }
            // Fallback: the override may have been stored using the raw (unresolved) field values
            // when the show/client name fuzzy-matches to a different index entry.
            const rawIdentifier = [scheduleRow.Client, scheduleRow.Year, scheduleRow.Show].filter(Boolean).join(' ');
            if (rawIdentifier && _findOverride(overrides, normalizeText(rawIdentifier).toLowerCase())) {
                return null;
            }
        }
        
        const kind = referenceType === 'show' ? 'show' : 'client';
        const rawValue = normalizeText(rawName);

        if (!rawValue) {
            return null;
        }

        const refData = await deps.call(ProductionUtils.computeIdentifierReferenceData);
        const indexData = (kind === 'show' ? refData.shows : refData.clients).indexData;
        const rawNorm = normalizeMatchKey(rawValue);

        if (!rawNorm || indexData.length === 0) {
            return { message: '⚠', type: 'index-reference', color: 'red', clickable: true, referenceType: kind, rawValue, status: 'missing', bestMatch: null };
        }
        if (indexData.some(entry => normalizeMatchKey(entry.name) === rawNorm)) return null;
        if (indexData.some(entry => Array.isArray(entry.abbreviations) && entry.abbreviations.some(abbr => normalizeMatchKey(abbr) === rawNorm))) return null;

        let bestMatch = '';
        try {
            bestMatch = GetTopFuzzyMatch(rawValue, indexData.map(e => e.name), indexData.map(e => (e.abbreviations || []).join(', ')), 2.5);
        } catch (e) {}

        if (bestMatch) {
            return { message: bestMatch, type: 'index-reference-resolved', color: 'gray', clickable: true, referenceType: kind, rawValue, status: 'fuzzy-pass', bestMatch };
        }

        const sortedCandidates = _rankReferenceCandidates(rawValue, indexData, _guessAbbreviations(rawValue));
        const topCandidate = sortedCandidates[0];
        const status = (sortedCandidates.length > 1 && topCandidate.score - sortedCandidates[1].score < 0.15) ? 'ambiguous' : 'missing';

        return { message: '⚠', type: 'index-reference', color: 'red', clickable: true, referenceType: kind, rawValue, status, bestMatch: topCandidate?.name || null };
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
        const normalizedRaw = normalizeText(rawValue);
        const refData = await deps.call(ProductionUtils.computeIdentifierReferenceData);
        const indexData = (kind === 'show' ? refData.shows : refData.clients).indexData;

        if (!normalizedRaw) {
            return { referenceType: kind, rawValue: '', options: [] };
        }

        const guessedAbbreviations = _guessAbbreviations(normalizedRaw);
        const candidates = _rankReferenceCandidates(normalizedRaw, indexData, guessedAbbreviations);
        const topScore = candidates[0]?.score ?? 0;
        const topCandidates = includeAllCandidates
            ? candidates.sort((a, b) => a.name.localeCompare(b.name))
            : candidates.filter(c => c.score >= 0.9 || (c.score >= 0.5 && c.score >= topScore - 0.12));

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
        const normalizedName = normalizeText(canonicalName);
        const normalizedAbbreviation = normalizeText(abbreviation);

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
        const indexData = (kind === 'show' ? refData.shows : refData.clients).indexData;
        const nameNorm = normalizeMatchKey(normalizedName);
        const nameMatch = nameNorm && (
            indexData.find(e => normalizeMatchKey(e.name) === nameNorm) ||
            indexData.find(e => Array.isArray(e.abbreviations) && e.abbreviations.some(a => normalizeMatchKey(a) === nameNorm))
        );
        if (nameMatch) {
            return { applied: false, addedRow: false, rowNumber: null, canonicalName: normalizedName, abbreviation: normalizedAbbreviation, conflict: { field: 'name', value: normalizedName, existingName: nameMatch.name } };
        }

        const abbrNorm = normalizeMatchKey(normalizedAbbreviation);
        const abbrMatch = abbrNorm && (
            indexData.find(e => normalizeMatchKey(e.name) === abbrNorm) ||
            indexData.find(e => Array.isArray(e.abbreviations) && e.abbreviations.some(a => normalizeMatchKey(a) === abbrNorm))
        );
        if (abbrMatch) {
            return { applied: false, addedRow: false, rowNumber: null, canonicalName: normalizedName, abbreviation: normalizedAbbreviation, conflict: { field: 'abbreviation', value: normalizedAbbreviation, existingName: abbrMatch.name } };
        }

        const { added, rowNumber, abbreviations } = await productionUtils_uncached.upsertReferenceEntry(tabName, normalizedName, normalizedAbbreviation);
        return {
            applied: true,
            addedRow: added,
            rowNumber,
            canonicalName: normalizedName,
            abbreviation: abbreviations,
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
        rows.forEach(row => {
            const client = normalizeText(row?.Client);
            const show = normalizeText(row?.Show);
            if (client) uniqueClients.add(client);
            if (show) uniqueShows.add(show);
        });

        const addMissing = async (tabName, names) => {
            if (names.size === 0) return 0;
            const rawData = await Database.getData('CACHE', tabName);
            const headers = Array.isArray(rawData) && Array.isArray(rawData[0])
                ? rawData[0].map(h => normalizeHeaderName(h)) : [];
            const nameColIndex = headers.findIndex(h => h === tabName);
            if (nameColIndex === -1) throw new Error(`[production-utils] Missing ${tabName} column in CACHE/${tabName}`);
            const existing = new Set(
                rawData.slice(1)
                    .map(r => normalizeText(Array.isArray(r) ? r[nameColIndex] : '')?.toLowerCase())
                    .filter(Boolean)
            );
            let added = 0;
            for (const name of names) {
                if (!existing.has(name.toLowerCase())) {
                    const rowValues = new Array(Math.max(headers.length, nameColIndex + 1)).fill('');
                    rowValues[nameColIndex] = name;
                    await Database.appendSheetRow('CACHE', tabName, rowValues);
                    added++;
                }
            }
            return added;
        };

        const [clientsAdded, showsAdded] = await Promise.all([
            addMissing('Clients', uniqueClients),
            addMissing('Shows', uniqueShows)
        ]);
        return { clientsAdded, showsAdded };
    }

    // Finds/creates a row; if abbreviation is given, merges it into the abbreviation cell.
    static async upsertReferenceEntry(referenceTab, name, abbreviation = null) {
        const tabName = referenceTab === 'Shows' ? 'Shows' : 'Clients';
        const normalizedName = normalizeText(name);
        if (!normalizedName) return { added: false, rowNumber: null, abbreviations: '' };

        const rawData = await Database.getData('CACHE', tabName);
        const headers = Array.isArray(rawData) && Array.isArray(rawData[0])
            ? rawData[0].map(h => normalizeHeaderName(h))
            : [];
        const nameColIndex = headers.findIndex(h => h === tabName);
        if (nameColIndex === -1) throw new Error(`[production-utils] Missing ${tabName} column in CACHE/${tabName}`);

        let rowNumber = null;
        let added = false;
        for (let i = 1; i < rawData.length; i++) {
            const existingName = normalizeText(Array.isArray(rawData[i]) ? rawData[i][nameColIndex] : '');
            if (existingName && existingName.toLowerCase() === normalizedName.toLowerCase()) {
                rowNumber = i + 1;
                break;
            }
        }
        if (rowNumber === null) {
            const rowValues = new Array(Math.max(headers.length, nameColIndex + 1)).fill('');
            rowValues[nameColIndex] = normalizedName;
            rowNumber = await Database.appendSheetRow('CACHE', tabName, rowValues);
            added = true;
        }

        const nextAbbr = normalizeText(abbreviation || '');
        if (!nextAbbr) return { added, rowNumber, abbreviations: '' };

        const abbrColIndex = headers.findIndex(h => h === 'Abbreviations');
        if (abbrColIndex === -1 || !rowNumber) {
            throw new Error(`[production-utils] Missing Abbreviations column in CACHE/${tabName}`);
        }

        const existingAbbrText = added
            ? ''
            : String((Array.isArray(rawData[rowNumber - 1]) ? rawData[rowNumber - 1] : [])[abbrColIndex] || '').trim();
        const mergedAbbr = _mergeAbbreviations(existingAbbrText, nextAbbr);

        if (mergedAbbr !== existingAbbrText) {
            await Database.setCellValue('CACHE', tabName, rowNumber, abbrColIndex + 1, mergedAbbr);
        }

        return { added, rowNumber, abbreviations: mergedAbbr };
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
     * Get all shows deduplicated with their earliest ship and latest return dates.
     * Used to populate the show overlap selector modal.
     * Deduplicates by show name (using abbreviation matching) + year, ignoring client differences.
     * @param {Object} deps
     * @param {Object|null} filter - Optional filter parameters with { dateFilters, textFilters }
     * @returns {Promise<Array<{show, year, shipDate, returnDate}>>}
     */
    static async getDeduplicatedShowDates(deps, filter = null) {
        // Split filter into parameters (dateFilters) and searchParams (textFilters)
        const filterParams = filter?.dateFilters ? { dateFilters: filter.dateFilters } : null;
        const searchParams = filter?.textFilters || null;
        
        // Get filtered production schedule data
        const data = await deps.call(ProductionUtils.getOverlappingShows, filterParams, searchParams);

        // Load reference data for show name normalization
        const referenceData = await deps.call(ProductionUtils.computeIdentifierReferenceData);

        // Group by normalized show name + year (ignoring client), taking earliest ship and latest return
        const showMap = new Map();

        for (const row of data) {
            // Normalize show name using fuzzy matching against the show index
            const rawShowName = String(row.Show || '').trim();
            if (!rawShowName) continue; // Skip rows without show name

            let canonicalShowName = rawShowName;
            try {
                canonicalShowName = _resolveRefPart(rawShowName, referenceData.shows.names, referenceData.shows.abbrs, 2.5);
            } catch (e) {}

            // Create key from canonical show name + year (NOT client)
            const year = row.Year || '';
            const key = `${canonicalShowName}|${year}`;
            
            const ship = _calculateShipDate(row);
            const ret = _calculateReturnDate(row, ship);

            if (!showMap.has(key)) {
                showMap.set(key, {
                    show: canonicalShowName,
                    year: year,
                    shipDate: ship ? toISODateString(ship) : null,
                    returnDate: ret ? toISODateString(ret) : null
                });
            } else {
                // Update existing entry with earlier ship or later return dates
                const existing = showMap.get(key);
                if (ship) {
                    const existingShip = existing.shipDate ? new Date(existing.shipDate + 'T12:00:00') : null;
                    if (!existingShip || ship < existingShip) existing.shipDate = toISODateString(ship);
                }
                if (ret) {
                    const existingRet = existing.returnDate ? new Date(existing.returnDate + 'T12:00:00') : null;
                    if (!existingRet || ret > existingRet) existing.returnDate = toISODateString(ret);
                }
            }
        }

        // Sort: soonest ship date first, then by year desc for undated shows
        return Array.from(showMap.values()).sort((a, b) => {
            if (a.shipDate && b.shipDate) return a.shipDate < b.shipDate ? -1 : 1;
            if (a.shipDate) return -1;
            if (b.shipDate) return 1;
            return (b.year || 0) > (a.year || 0) ? 1 : -1;
        });
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

        const overrides = await deps.call(ProductionUtils.getNameOverrides);
        const override = _findOverride(overrides, normalizeText(packlistTitle).toLowerCase());
        if (override) {
            if (_isIgnoreOverride(override)) return [];
            let overrideData = scheduleData;
            if (!overrideData) {
                const overrideMapping = await deps.call(ProductionUtils.GetMappingFromProductionSchedule);
                overrideData = await deps.call(Database.getData, 'PROD_SCHED', 'Production Schedule', overrideMapping);
            }
            const schedNorm = normalizeText(override.schedule).toLowerCase();
            for (const row of overrideData) {
                if (!row.Show || !row.Client || !row.Year) continue;
                const raw = normalizeText([row.Client, row.Year, row.Show].join(' ')).toLowerCase();
                if (raw === schedNorm) return [row];
                const computed = await deps.call(ProductionUtils.computeIdentifier, row.Show, row.Client, row.Year);
                if (computed && normalizeText(computed).toLowerCase() === schedNorm) return [row];
            }
            return [];
        }

        let data = scheduleData;
        if (!data) {
            const mapping = await deps.call(ProductionUtils.GetMappingFromProductionSchedule);
            data = await deps.call(Database.getData, 'PROD_SCHED', 'Production Schedule', mapping);
        }

        const { scheduleMap, candidates } = await _buildYearFilteredScheduleMap(deps, packlistTitle, data);
        if (candidates.length === 0) return [];
        const match = await deps.call(ProductionUtils.findBestProjectIdentifierMatch, packlistTitle, candidates);
        return match ? [scheduleMap.get(match)].filter(Boolean) : [];
    }

    /**
     * Check whether a packlist tab would match a schedule row if suffix words were stripped.
     * Returns the matched row and its computed identifier without auto-linking.
     * Called by diagnosePacklistAttachment to surface a suggestion for the user to confirm.
     * @param {Object} deps
     * @param {string} packlistTitle
     * @param {Array} [scheduleData]
     * @returns {Promise<{row:Object, computedIdentifier:string}|null>}
     */
    static async findSuffixVariantSuggestion(deps, packlistTitle, scheduleData = null) {
        if (!packlistTitle) return null;

        const words = packlistTitle.trim().split(/\s+/);
        const yearIndex = words.findIndex(w => /^\d{4}$/.test(w));
        const minWords = yearIndex >= 0 ? yearIndex + 2 : 1;
        if (words.length <= minWords) return null;

        let data = scheduleData;
        if (!data) {
            const mapping = await deps.call(ProductionUtils.GetMappingFromProductionSchedule);
            data = await deps.call(Database.getData, 'PROD_SCHED', 'Production Schedule', mapping);
        }

        const { scheduleMap, candidates } = await _buildYearFilteredScheduleMap(deps, packlistTitle, data);
        if (candidates.length === 0) return null;

        for (let count = words.length - 1; count >= minWords; count--) {
            const candidate = words.slice(0, count).join(' ');
            const match = await deps.call(ProductionUtils.findBestProjectIdentifierMatch, candidate, candidates);
            if (match) {
                const row = scheduleMap.get(match);
                return row ? { row, computedIdentifier: match } : null;
            }
        }

        return null;
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
        const row = rows[0] ? { ...rows[0] } : null;
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
     * Diagnose why a packlist tab is not attached to any schedule row.
     * Returns an attachment status object for use in the packlist overview UI.
     * - { attached: true } when a schedule row is found
     * - { attached: false, hasIdentifierParts: false } when the title has no CLIENT YEAR SHOW structure (custom packlist)
     * - { attached: false, hasIdentifierParts: true, clientIssue, showIssue } when the title parses but no schedule row
     *   matches; clientIssue/showIssue are clickable-alert payloads (same shape as checkReferenceNameState) or null
     * @param {Object} deps
     * @param {string} identifier - Packlist tab title
     * @returns {Promise<{attached:boolean, hasIdentifierParts:boolean, clientIssue:Object|null, showIssue:Object|null}>}
     */
    static async diagnosePacklistAttachment(deps, identifier) {
        if (!identifier) return { attached: false, hasIdentifierParts: false };

        const overrides = await deps.call(ProductionUtils.getNameOverrides);
        if (_findOverride(overrides, normalizeText(identifier).toLowerCase())) {
            return { attached: true, hasIdentifierParts: true };
        }

        const row = await deps.call(ProductionUtils.getShowDetails, identifier);
        if (row) return { attached: true, hasIdentifierParts: true };

        const parts = _parseIdentifierParts(identifier);
        if (!parts) return { attached: false, hasIdentifierParts: false };

        // Check if suffix stripping would find a match — surface as suggestion for the user to confirm
        const suggestion = await deps.call(ProductionUtils.findSuffixVariantSuggestion, identifier);
        if (suggestion) {
            return {
                attached: false,
                hasIdentifierParts: true,
                suggestedMatch: suggestion.computedIdentifier
            };
        }

        const [clientIssue, showIssue] = await Promise.all([
            deps.call(ProductionUtils.checkReferenceNameState, parts.client, 'client'),
            deps.call(ProductionUtils.checkReferenceNameState, parts.show, 'show')
        ]);

        return {
            attached: false,
            hasIdentifierParts: true,
            clientIssue: clientIssue || null,
            showIssue: showIssue || null
        };
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

        const overrides = await deps.call(ProductionUtils.getNameOverrides);
        const computedForOverride = scheduleRow.Identifier ||
            await deps.call(ProductionUtils.computeIdentifier, scheduleRow.Show, scheduleRow.Client, scheduleRow.Year);
        if (computedForOverride) {
            const override = _findOverride(overrides, normalizeText(computedForOverride).toLowerCase());
            if (override !== undefined) {
                if (_isIgnoreOverride(override)) return [];
                const packNorm = normalizeText(override.packlist).toLowerCase();
                const matchedTab = tabs.find(t => normalizeText(t.title).toLowerCase() === packNorm);
                return matchedTab ? [matchedTab] : [];
            }
        }

        // Try the stored Identifier first (fast path for normal shows).
        // If it matches nothing, fall back to computeIdentifier — the stored value
        // may be stale or may omit the client name when the client is not in the index.
        const storedIdentifier = scheduleRow.Identifier;
        if (storedIdentifier) {
            const results = await deps.call(ProductionUtils.findAllPackListTabsForShow, storedIdentifier, tabs);
            if (results.length > 0) return results;
        }

        const computedIdentifier = await deps.call(
            ProductionUtils.computeIdentifier, scheduleRow.Show, scheduleRow.Client, scheduleRow.Year
        );
        if (!computedIdentifier) return [];
        return deps.call(ProductionUtils.findAllPackListTabsForShow, computedIdentifier, tabs);
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
        try { return toUSDateString(_calculateShipDate(row)); } catch (e) { return null; }
    }

    static async normalizeStartDate(deps, row) {
        try { return toUSDateString(parseDate(row['S. Start'], true, row.Year)); } catch (e) { return null; }
    }

    static async normalizeEndDate(deps, row) {
        try { return toUSDateString(parseDate(row['S. End'], true, row.Year)); } catch (e) { return null; }
    }


    /**
     * Resolve the best matching project identifier candidate.
     * Matching order: exact -> case-insensitive -> normalized -> fuzzy/abbreviation fallback.
     * @param {string} identifier
     * @param {string[]} candidates
     * @returns {string|null}
     */
    static async findBestProjectIdentifierMatch(deps, identifier, candidates = []) {
        const rawIdentifier = normalizeText(identifier);
        if (!rawIdentifier || !Array.isArray(candidates) || candidates.length === 0) {
            return null;
        }

        const cleanCandidates = candidates
            .map(candidate => normalizeText(candidate))
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

        const normalizedIdentifier = normalizeMatchKey(rawIdentifier);
        const normalizedMatch = cleanCandidates.find(candidate => normalizeMatchKey(candidate) === normalizedIdentifier);
        if (normalizedMatch) return normalizedMatch;

        // Component-level resolution: parse year out of identifiers, resolve client/show via index
        // Both query AND candidate parts are resolved to canonical form before comparing, so
        // abbreviated tab names like "AUSTAL 2026 SNA" match canonical "AUSTAL USA 2026 SURFACE NAVY".
        if (deps) {
            const queryParts = _parseIdentifierParts(rawIdentifier);
            if (queryParts) {
                const refData = await deps.call(ProductionUtils.computeIdentifierReferenceData);

                const resolvedQueryClient = _resolveRefPart(queryParts.client, refData.clients.names, refData.clients.abbrs);
                const resolvedQueryShow = _resolveRefPart(queryParts.show, refData.shows.names, refData.shows.abbrs, 2.5);
                const resolvedQueryNormalized = normalizeMatchKey(`${resolvedQueryClient} ${queryParts.year} ${resolvedQueryShow}`);

                for (const candidate of cleanCandidates) {
                    const candidateParts = _parseIdentifierParts(candidate);
                    if (!candidateParts || candidateParts.year !== queryParts.year) continue;
                    const resolvedClient = _resolveRefPart(candidateParts.client, refData.clients.names, refData.clients.abbrs);
                    const resolvedShow = _resolveRefPart(candidateParts.show, refData.shows.names, refData.shows.abbrs, 2.5);
                    const resolvedCandidate = `${resolvedClient} ${candidateParts.year} ${resolvedShow}`.trim();
                    if (normalizeMatchKey(resolvedCandidate) === resolvedQueryNormalized) return candidate;
                }
            }
        }

        // Fuzzy fallback with year filtering
        // IMPORTANT: Always prefer matches within the same year to avoid cross-year mismatches
        try {
            const buildAbbrevSet = (id) => {
                const clean = normalizeText(id);
                if (!clean) return [];
                const v = new Set([clean, normalizeMatchKey(clean)]);
                _guessAbbreviations(clean).forEach(g => { if (g) { v.add(g); v.add(normalizeMatchKey(g)); } });
                return Array.from(v).filter(Boolean);
            };
            const fuzzyThreshold = rawIdentifier.length > 14 ? 3 : 2;
            const queryParts = _parseIdentifierParts(rawIdentifier);

            if (queryParts) {
                const sameYearCandidates = cleanCandidates.filter(c => {
                    const p = _parseIdentifierParts(c);
                    return p && p.year === queryParts.year;
                });
                if (sameYearCandidates.length > 0) {
                    const match = GetTopFuzzyMatch(rawIdentifier, sameYearCandidates, sameYearCandidates.map(c => buildAbbrevSet(c).join(', ')), fuzzyThreshold);
                    if (match) return match;
                }
            }

            const match = GetTopFuzzyMatch(rawIdentifier, cleanCandidates, cleanCandidates.map(c => buildAbbrevSet(c).join(', ')), fuzzyThreshold);
            if (match) {
                const matchParts = _parseIdentifierParts(match);
                if (queryParts && matchParts && queryParts.year !== matchParts.year) {
                    console.warn(`[production-utils] Cross-year fuzzy match: "${rawIdentifier}" (${queryParts.year}) -> "${match}" (${matchParts.year})`);
                }
            }
            return match;
        } catch (error) {
            return null;
        }
    }

    
    /**
     * Aggregate all client/show name mismatches from the production schedule and all
     * packlist tabs. Deduplicates by rawValue + referenceType so that the same missing
     * name found in multiple sources is represented once with a merged sources list.
     * @param {Object} deps
     * @returns {Promise<Array<{rawValue:string, referenceType:'client'|'show', status:string, bestMatch:string|null, sources:Array<{sourceType:'schedule'|'packlist', identifier:string}>}>>}
     */
    static async getMissingIndexReferences(deps) {
        const mapping = await deps.call(ProductionUtils.GetMappingFromProductionSchedule);
        const scheduleRows = await deps.call(Database.getData, 'PROD_SCHED', 'Production Schedule', mapping);

        const allTabs = await deps.call(Database.getTabs, 'PACK_LISTS');
        const packlistTabs = allTabs.filter(tab => tab.title && !tab.title.startsWith('_'));

        const issueMap = new Map(); // key: `${rawValue}::${referenceType}`

        const addToMap = (issue, source) => {
            const key = `${issue.rawValue}::${issue.referenceType}`;
            if (!issueMap.has(key)) {
                issueMap.set(key, {
                    rawValue: issue.rawValue,
                    referenceType: issue.referenceType,
                    status: issue.status,
                    bestMatch: issue.bestMatch || null,
                    sources: []
                });
            }
            const entry = issueMap.get(key);
            const isDuplicate = entry.sources.some(
                s => s.sourceType === source.sourceType && s.identifier === source.identifier
            );
            if (!isDuplicate) {
                entry.sources.push(source);
            }
        };

        const scheduleResults = await Promise.all(
            scheduleRows.map(row => Promise.all([
                deps.call(ProductionUtils.checkReferenceNameState, row.Client || '', 'client', row),
                deps.call(ProductionUtils.checkReferenceNameState, row.Show || '', 'show', row)
            ]).then(([clientIssue, showIssue]) => ({ row, clientIssue, showIssue })))
        );

        for (const { row, clientIssue, showIssue } of scheduleResults) {
            const identifier = [row.Client, row.Year, row.Show].filter(Boolean).join(' ');
            if (clientIssue) addToMap(clientIssue, { sourceType: 'schedule', identifier });
            if (showIssue) addToMap(showIssue, { sourceType: 'schedule', identifier });
        }

        const packlistResults = await Promise.all(
            packlistTabs.map(tab =>
                deps.call(ProductionUtils.diagnosePacklistAttachment, tab.title)
                    .then(attachment => ({ tab, attachment }))
            )
        );

        for (const { tab, attachment } of packlistResults) {
            if (!attachment || attachment.attached || !attachment.hasIdentifierParts) continue;
            if (attachment.clientIssue) addToMap(attachment.clientIssue, { sourceType: 'packlist', identifier: tab.title });
            if (attachment.showIssue) addToMap(attachment.showIssue, { sourceType: 'packlist', identifier: tab.title });
        }

        return Array.from(issueMap.values()).sort((a, b) => {
            if (a.referenceType !== b.referenceType) return a.referenceType === 'client' ? -1 : 1;
            return a.rawValue.localeCompare(b.rawValue);
        }).map(entry => ({ ...entry, resolution: '' }));
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
        const results = await deps.call(ProductionUtils.findAllPackListTabsForShow, identifier, tabs);
        return results[0] ?? null;
    }

    /**
     * Read all name override mappings from CACHE/NameOverrides.
     * Returns empty array if the tab does not exist yet.
     * @param {Object} deps
     * @returns {Promise<Array<{schedule:string, packlist:string}>>}
     */
    static async getNameOverrides(deps) {
        try {
            const data = await deps.call(Database.getData, 'CACHE', 'NameOverrides', { schedule: 'Schedule', packlist: 'Packlist' });
            if (!Array.isArray(data)) return [];
            return data.map(r => ({
                schedule: String(r.schedule || '').trim(),
                packlist: String(r.packlist || '').trim()
            }));
        } catch (e) {
            return [];
        }
    }

    /**
     * Append a new row to CACHE/NameOverrides linking a schedule identifier to a packlist tab.
     * Pass an empty string for either side to create a "permanently ignore" entry.
     * Mutation — uncached.
     * @param {string} scheduleId - Computed schedule identifier (or '' to ignore)
     * @param {string} packlistId - Packlist tab name (or '' to ignore)
     * @returns {Promise<void>}
     */
    static async addNameOverride(scheduleId, packlistId) {
        await Database.appendSheetRow('CACHE', 'NameOverrides', [
            String(scheduleId || '').trim(),
            String(packlistId || '').trim()
        ]);
    }

    /**
     * Get all computed schedule identifiers, sorted alphabetically.
     * @param {Object} deps
     * @returns {Promise<string[]>}
     */
    static async getAllScheduleIdentifiers(deps) {
        const mapping = await deps.call(ProductionUtils.GetMappingFromProductionSchedule);
        const scheduleRows = await deps.call(Database.getData, 'PROD_SCHED', 'Production Schedule', mapping);
        const identifiers = new Map();
        for (const row of scheduleRows) {
            if (!row.Show || !row.Client || !row.Year) continue;
            const identifier = await deps.call(ProductionUtils.computeIdentifier, row.Show, row.Client, row.Year);
            if (identifier) identifiers.set(identifier, true);
        }
        return Array.from(identifiers.keys()).sort();
    }

    /**
     * Get all non-template packlist tab names that are NOT currently attached to any schedule row.
     * Filters out packlists that have overrides or successfully match to schedule rows.
     * Used for override modals to prevent overriding existing valid matches.
     * @param {Object} deps
     * @returns {Promise<string[]>}
     */
    static async getUnattachedPacklistTabNames(deps) {
        const allTabs = await deps.call(Database.getTabs, 'PACK_LISTS');
        const nonTemplateTabs = allTabs.filter(tab => tab.title && !tab.title.startsWith('_'));
        
        // Check attachment status for each packlist
        const attachmentResults = await Promise.all(
            nonTemplateTabs.map(tab =>
                deps.call(ProductionUtils.diagnosePacklistAttachment, tab.title)
                    .then(attachment => ({ title: tab.title, attached: attachment.attached }))
            )
        );
        
        // Return only unattached packlists, sorted
        return attachmentResults
            .filter(result => !result.attached)
            .map(result => result.title)
            .sort();
    }

    /** Finds all packlist tabs matching identifier, including suffix variants (e.g. "SNA MEETING ROOM"). */
    static async findAllPackListTabsForShow(deps, identifier, tabs) {
        if (!identifier || !Array.isArray(tabs)) return [];

        const titleToTab = new Map();
        const titles = [];

        tabs.forEach((tab) => {
            const title = normalizeText(tab?.title);
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
        'upsertReferenceEntry',
        'addCustomReferenceEntry',
        'addNameOverride'
    ],
    ['computeIdentifier']
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
        const NINE_MONTHS_MS = 9 * 30 * 24 * 60 * 60 * 1000;
        if (sStart && ship >= sStart && (ship - sStart) > NINE_MONTHS_MS) {
            // Ship is more than 9 months after show start — likely a year boundary issue
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
        // If return is before dates and both are in the same year,
        // check if moving return to next year makes more sense
        const sEnd = parseDate(row['S. End'], true, year) || parseDate(row['S. Start'], true, year);
        const NINE_MONTHS_MS = 9 * 30 * 24 * 60 * 60 * 1000;
        if (sEnd && ret <= sEnd && (sEnd - ret) > NINE_MONTHS_MS) {
            // Return is more than 9 months before show end — likely a year boundary issue
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

function _splitAbbreviations(value) {
    return String(value || '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
}

function _parseIdentifierParts(identifier) {
    const match = String(identifier || '').trim().match(/^(.+?)\s+(\d{4})\s+(.+)$/);
    if (!match) return null;
    return { client: match[1].trim(), year: match[2], show: match[3].trim() };
}

function _mergeAbbreviations(existingText, nextToken) {
    const tokens = _splitAbbreviations(existingText);
    const normalizedTokens = new Set(tokens.map(token => normalizeMatchKey(token)));
    if (!normalizedTokens.has(normalizeMatchKey(nextToken))) {
        tokens.push(nextToken);
    }
    return tokens.join(', ');
}

function _rankReferenceCandidates(rawValue, indexData, guessedAbbreviations = []) {
    const rawNorm = normalizeMatchKey(rawValue);
    const rawUpper = normalizeText(rawValue).toUpperCase();
    const guessedSet = new Set((guessedAbbreviations || []).map(normalizeMatchKey));

    const scored = (indexData || []).map(entry => {
        const nameNorm = normalizeMatchKey(entry.name);
        const abbrNorms = (entry.abbreviations || []).map(normalizeMatchKey);

        // Levenshtein edit distance between rawNorm and nameNorm
        const s = rawNorm, t = nameNorm, m = s.length, n = t.length;
        let nameDistance;
        if (m === 0) { nameDistance = n; }
        else if (n === 0) { nameDistance = m; }
        else {
            const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
            for (let i = 0; i <= m; i++) dp[i][0] = i;
            for (let j = 0; j <= n; j++) dp[0][j] = j;
            for (let i = 1; i <= m; i++)
                for (let j = 1; j <= n; j++)
                    dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+(s[i-1]===t[j-1]?0:1));
            nameDistance = dp[m][n];
        }

        const editScore = 1 - (nameDistance / Math.max(m, n, 1));
        const startsScore = nameNorm.startsWith(rawNorm) || rawNorm.startsWith(nameNorm) ? 0.2 : 0;
        const guessedAbbrMatch = abbrNorms.some(abbr => guessedSet.has(abbr)) ? 0.35 : 0;
        const containsRawAsAbbr = abbrNorms.includes(rawNorm) ? 0.45 : 0;

        // Token overlap between rawUpper and entry name
        const tLeft = new Set(rawUpper.split(/\s+/).filter(Boolean));
        const tRight = new Set(entry.name.toUpperCase().split(/\s+/).filter(Boolean));
        const tCommon = (tLeft.size && tRight.size) ? Array.from(tLeft).filter(tok => tRight.has(tok)).length : 0;
        const tokenOverlap = (tLeft.size && tRight.size ? tCommon / Math.max(tLeft.size, tRight.size) : 0) * 0.25;

        return {
            name: entry.name,
            score: editScore + startsScore + guessedAbbrMatch + containsRawAsAbbr + tokenOverlap,
            reason: containsRawAsAbbr ? 'already close to existing abbreviation' : guessedAbbrMatch ? 'matches guessed abbreviation pattern' : 'fuzzy name similarity'
        };
    });

    return scored.sort((a, b) => b.score - a.score);
}

function _guessAbbreviations(rawValue) {
    const cleaned = normalizeText(rawValue);
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

// Finds the first override where either field case-insensitively equals identifierLower.
function _findOverride(overrides, identifierLower) {
    return overrides.find(o => {
        const s = normalizeText(o.schedule || '').toLowerCase();
        const p = normalizeText(o.packlist || '').toLowerCase();
        return (s && s === identifierLower) || (p && p === identifierLower);
    });
}

// Returns true if the override marks either side as permanently ignored.
function _isIgnoreOverride(override) {
    return override.schedule === IGNORE_KEYWORD || override.packlist === IGNORE_KEYWORD;
}

// Fuzzy-resolves a ref part (client or show) against an index; returns the raw value on failure.
function _resolveRefPart(value, names, abbrs, threshold = undefined) {
    try {
        return GetTopFuzzyMatch(value, names, abbrs, threshold) || value;
    } catch (e) {
        return value;
    }
}

// Builds a year-filtered identifier→row map from schedule data, using the year parsed from title.
async function _buildYearFilteredScheduleMap(deps, title, scheduleData) {
    const parts = _parseIdentifierParts(title);
    const targetYear = parts ? parts.year : null;
    const filtered = targetYear
        ? scheduleData.filter(row => String(parseInt(row.Year, 10)) === targetYear)
        : scheduleData;
    const scheduleMap = new Map();
    for (const row of filtered) {
        if (!row.Show || !row.Client || !row.Year) continue;
        const computed = await deps.call(ProductionUtils.computeIdentifier, row.Show, row.Client, row.Year);
        if (computed && !scheduleMap.has(computed)) scheduleMap.set(computed, row);
    }
    return { scheduleMap, candidates: Array.from(scheduleMap.keys()) };
}