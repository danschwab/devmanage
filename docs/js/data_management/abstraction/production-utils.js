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
            let ship = parseDate(foundRow.Ship, true, year);
            let ret = parseDate(foundRow['Expected Return Date'], true, year);
            if (!ship) {
                let sStart = parseDate(foundRow['S. Start'], true, year);
                ship = sStart ? new Date(sStart.getTime() - 10 * 86400000) : null;
            }
            if (!ret) {
                let sEnd = parseDate(foundRow['S. End'], true, year);
                ret = sEnd ? new Date(sEnd.getTime() + 10 * 86400000) : null;
            }
            
            // Additional fallback: if we still have no return date but have S. Start, use S. Start + 1 month
            if (!ret && !ship) {
                let sStart = parseDate(foundRow['S. Start'], true, year);
                if (sStart) {
                    ship = new Date(sStart.getTime() - 10 * 86400000); // 10 days before show start
                    ret = new Date(sStart.getTime() + 30 * 86400000); // 30 days after show start
                    console.log(`[production-utils] Using S. Start fallback: ship=${ship}, ret=${ret}`);
                }
            }
            
            if (ship && ship.getFullYear() != year) ship.setFullYear(Number(year));
            if (ret && ret.getFullYear() != year) ret.setFullYear(Number(year));
            if (ship && ret && ret <= ship) ret.setFullYear(ret.getFullYear() + 1);
            startDate = ship;
            endDate = ret;
            console.log(`[production-utils] Identifier mode: year=${year}, startDate=${startDate}, endDate=${endDate}`);
            // If startDate exists but no endDate, assume 30 days after startDate
            if (startDate && !endDate) {
                endDate = new Date(startDate.getTime() + 30 * 86400000);
                console.log(`[production-utils] No endDate found, assuming 30 days after startDate: endDate=${endDate}`);
            }
        } else {
            startDate = parseDate(parameters.startDate, true, parameters.year);
            endDate = parseDate(parameters.endDate, true, parameters.year);
            year = parameters.year || startDate?.getFullYear();
            // If startDate exists but no endDate, assume 30 days after startDate
            if (startDate && !endDate) {
                endDate = new Date(startDate.getTime() + 30 * 86400000);
                console.log(`[production-utils] No endDate found, assuming 30 days after startDate: endDate=${endDate}`);
            }
            console.log(`[production-utils] Date range mode: year=${year}, startDate=${startDate}, endDate=${endDate}`);
        }
        
        if (!year || !startDate || !endDate) {
            console.log('[production-utils] Missing year/startDate/endDate, returning empty array');
            return [];
        }
        // Filter data for overlapping shows
        const filtered = data.filter(row => {
            if (!row.Year || row.Year != year) return false;
            let ship = parseDate(row.Ship, true, row.Year) ||
                (parseDate(row['S. Start'], true, row.Year) ? new Date(parseDate(row['S. Start'], true, row.Year).getTime() - 10 * 86400000) : null);
            let ret = parseDate(row['Expected Return Date'], true, row.Year) ||
                (parseDate(row['S. End'], true, row.Year) ? new Date(parseDate(row['S. End'], true, row.Year).getTime() + 10 * 86400000) : null);
            
            // Additional fallback: if we still have no ship/return dates but have S. Start, use S. Start + 1 month
            if (!ship && !ret) {
                let sStart = parseDate(row['S. Start'], true, row.Year);
                if (sStart) {
                    ship = new Date(sStart.getTime() - 10 * 86400000); // 10 days before show start
                    ret = new Date(sStart.getTime() + 30 * 86400000); // 30 days after show start
                    console.log(`[production-utils] Using S. Start fallback for ${row.Identifier || row.Show}: ship=${ship}, ret=${ret}`);
                }
            }
            
            // Fallback: if we have ship date but no return date, assume one month after ship date
            if (ship && !ret) {
                ret = new Date(ship.getTime() + 30 * 86400000); // Add 30 days
                console.log(`[production-utils] No return date for ${row.Identifier || row.Show}, assuming one month after ship: ${ret}`);
            }
            
            if (ship && ship.getFullYear() != row.Year) ship.setFullYear(Number(row.Year));
            if (ret && ret.getFullYear() != row.Year) ret.setFullYear(Number(row.Year));
            if (ship && ret && ret <= ship) ret.setFullYear(ret.getFullYear() + 1);
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

}

export const ProductionUtils = wrapMethods(productionUtils_uncached, 'production_utils');