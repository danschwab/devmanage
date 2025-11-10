import { Database, parseDate, wrapMethods, searchFilter, GetTopFuzzyMatch } from '../index.js';

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
        const tabName = "ProductionSchedule";
        
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
     * @param {string|Object} parameters - Project identifier or date range parameters
     * @returns {Promise<string[]>} Array of overlapping project identifiers
     */
    static async getOverlappingShows(deps, parameters = null, searchParams = null) {
        console.log('[production-utils] getOverlappingShows called with:', parameters);
        const tabName = "ProductionSchedule";
        
        // Get dynamic mapping from ProductionSchedule headers
        const mapping = await deps.call(ProductionUtils.GetMappingFromProductionSchedule);
        
        let data = await deps.call(Database.getData, 'PROD_SCHED', tabName, mapping);
        console.log('[production-utils] Loaded schedule data:', data);

        if (searchParams) {
            data = searchFilter(data, searchParams);
        }

        if (!parameters) {
            console.log('[production-utils] No parameters provided, returning all data');
            return data;
        }
        let year, startDate, endDate;
        if (typeof parameters === "string" || parameters.identifier) {
            const identifier = parameters.identifier || parameters;
            let foundRow = null;
            for (const row of data) {
                const showName = row.Show;
                const client = row.Client;
                const yearVal = row.Year;
                if (showName && client && yearVal) {
                    const computedIdentifier = await deps.call(ProductionUtils.computeIdentifier, showName, client, yearVal);
                    if (computedIdentifier === identifier) {
                        foundRow = row;
                        break;
                    }
                }
            }
            if (!foundRow) {
                console.log('[production-utils] No row found for identifier:', identifier);
                return [];
            }
            year = foundRow.Year;
            // Use shared date calculation helpers
            let ship = _calculateShipDate(foundRow);
            let ret = _calculateReturnDate(foundRow, ship);
            
            // Ensure return date is after ship date
            if (ship && ret && ret <= ship) {
                ret.setFullYear(ret.getFullYear() + 1);
            }
            
            startDate = ship;
            endDate = ret;
            console.log(`[production-utils] Identifier mode: year=${year}, startDate=${startDate}, endDate=${endDate}`);
            // If startDate exists but no endDate, assume 30 days after startDate
            if (startDate && !endDate) {
                endDate = new Date(startDate.getTime() + 30 * 86400000);
                console.log(`[production-utils] No endDate found, assuming 30 days after startDate: endDate=${endDate}`);
            }
        } else {
            // Handle relative day offsets (e.g., startDateOffset: -30 means 30 days ago)
            if (typeof parameters.startDateOffset === 'number') {
                const today = new Date();
                startDate = new Date(today.getTime() + parameters.startDateOffset * 86400000);
                console.log(`[production-utils] Using startDateOffset ${parameters.startDateOffset}: startDate=${startDate}`);
            } else {
                startDate = parseDate(parameters.startDate, true, parameters.year);
            }
            
            if (typeof parameters.endDateOffset === 'number') {
                const today = new Date();
                endDate = new Date(today.getTime() + parameters.endDateOffset * 86400000);
                console.log(`[production-utils] Using endDateOffset ${parameters.endDateOffset}: endDate=${endDate}`);
            } else {
                endDate = parseDate(parameters.endDate, true, parameters.year);
            }
            
            year = parameters.year || startDate?.getFullYear();
            // If startDate exists but no endDate, assume 30 days after startDate
            if (startDate && !endDate) {
                endDate = new Date(startDate.getTime() + 30 * 86400000);
                console.log(`[production-utils] No endDate found, assuming 30 days after startDate: endDate=${endDate}`);
            }
            console.log(`[production-utils] Date range mode: year=${year}, startDate=${startDate}, endDate=${endDate}`);
        }
        
        if (!startDate || !endDate) {
            console.log('[production-utils] Missing startDate/endDate, returning empty array');
            return [];
        }
        
        // When using offsets, we need to check multiple years
        const startYear = startDate.getFullYear();
        const endYear = endDate.getFullYear();
        const yearsToCheck = [];
        for (let y = startYear; y <= endYear; y++) {
            yearsToCheck.push(y);
        }
        
        // Filter data for overlapping shows
        const filtered = data.filter(row => {
            if (!row.Year || !yearsToCheck.includes(parseInt(row.Year))) return false;
            
            // If byShowDate flag is set, filter by exact show date instead of overlap range
            if (parameters.byShowDate) {
                // Try to get show date from S. Start field
                let showDate = parseDate(row['S. Start'], true, row.Year);
                
                // If show date not available, try other date fields to infer it
                if (!showDate) {
                    // Try ship date and work backwards
                    const ship = _calculateShipDate(row);
                    if (ship) {
                        // Typical show is ~7-14 days after ship
                        showDate = new Date(ship.getTime() + 10 * 86400000);
                    }
                }
                
                if (!showDate) return false;
                
                // Show date must fall within the specified date range
                return (showDate >= startDate && showDate <= endDate);
            }
            
            // Default: Use overlap logic (ship to return range)
            let ship = _calculateShipDate(row);
            let ret = _calculateReturnDate(row, ship);
            
            // Ensure return date is after ship date
            if (ship && ret && ret <= ship) {
                ret.setFullYear(ret.getFullYear() + 1);
            }
            
            if (!ship || !ret) return false;
            return (ret >= startDate && ship <= endDate);
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
        // If showName is blank, return blank
        if (!showName || !showName.trim()) {
            return '';
        }

        // Get reference data
        const referenceData = await deps.call(ProductionUtils.computeIdentifierReferenceData);
        
        // Fuzzy match client 
        let clientMatch = '';
        try {
            clientMatch = GetTopFuzzyMatch(
                clientName,
                referenceData.clients.names,
                referenceData.clients.abbrs
            );
        } catch (e) {
            clientMatch = clientName || '';
        }

        // Fuzzy match show
        let showMatch = '';
        try {
            showMatch = GetTopFuzzyMatch(
                showName,
                referenceData.shows.names,
                referenceData.shows.abbrs,
                2.5
            );
        } catch (e) {
            showMatch = showName || '';
        }

        // Compose identifier
        return `${clientMatch} ${year || ''} ${showMatch}`.trim();
    }

    /**
     * Helper method to get fuzzy matching reference data
     * @param {Object} deps - Dependency decorator for tracking calls
     * @returns {Promise<Object>} Reference data for fuzzy matching
     * @private
     */
    static async computeIdentifierReferenceData(deps) {
        const clientsData = await deps.call(Database.getData, 'PROD_SCHED', 'Clients', { name: 'Clients', abbr: 'Abbreviations' });
        const showsData = await deps.call(Database.getData, 'PROD_SCHED', 'Shows', { name: 'Shows', abbr: 'Abbreviations' });
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
     * Get show details by project identifier
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} identifier - Project identifier (e.g., "LOCKHEED MARTIN 2025 NGAUS")
     * @returns {Promise<Object|null>} Show details object or null if not found
     */
    static async getShowDetails(deps, identifier) {
        if (!identifier) return null;

        const tabName = "ProductionSchedule";
        
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

export const ProductionUtils = wrapMethods(productionUtils_uncached, 'production_utils');



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