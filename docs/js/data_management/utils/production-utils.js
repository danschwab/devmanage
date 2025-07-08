import { Database, CacheManager, GetTopFuzzyMatch, parseDate } from '../../index.js';

/**
 * Utility functions for production schedule operations
 */
export class ProductionUtils {
    /**
     * Get overlapping shows based on parameters
     * @param {string|Object} parameters - Project identifier or date range parameters
     * @param {string} [trackingId] - Optional tracking ID for dependency tracking
     * @returns {Promise<string[]>} Array of overlapping project identifiers
     */
    static async getOverlappingShows(parameters, trackingId = null) {
        // Generate cache key
        let cacheKey;
        if (typeof parameters === 'string' || parameters.identifier) {
            const identifier = parameters.identifier || parameters;
            cacheKey = `overlapping:${identifier}`;
        } else {
            const startStr = parameters.startDate ? new Date(parameters.startDate).toISOString() : 'null';
            const endStr = parameters.endDate ? new Date(parameters.endDate).toISOString() : 'null';
            const yearStr = parameters.year || 'current';
            cacheKey = `overlapping:date:${startStr}:${endStr}:${yearStr}`;
        }
        
        // Check cache first
        const cachedValue = CacheManager.get(
            CacheManager.NAMESPACES.PROD_SCHEDULE, 
            cacheKey, 
            trackingId
        );
        
        if (cachedValue !== null) {
            return cachedValue;
        }
        
        try {
            // Fetch production schedule data directly from Database
            const tabName = "ProductionSchedule";
            const data = await Database.getData('PROD_SCHED', `${tabName}!A:J`, true, trackingId);
            const headers = data[0];

            // Build index maps for show/client/year to identifier for fast lookup
            const idxShowName = headers.findIndex(h => h.toLowerCase() === "show name" || h.toLowerCase() === "show");
            const idxClient = headers.findIndex(h => h.toLowerCase() === "client");
            const idxYear = headers.findIndex(h => h.toLowerCase() === "year");
            const idxShip = headers.findIndex(h => h.toLowerCase() === "ship");
            const idxReturn = headers.findIndex(h => h.toLowerCase() === "expected return date");
            const idxSStart = headers.findIndex(h => h.toLowerCase() === "s. start");
            const idxSEnd = headers.findIndex(h => h.toLowerCase() === "s. end");

            // Precompute all identifiers for all rows - these accesses will be automatically tracked
            const identifierCache = {};
            for (const row of data) {
                const showName = row[idxShowName];
                const client = row[idxClient];
                const yearVal = row[idxYear];
                if (showName && client && yearVal) {
                    const key = `${showName}|||${client}|||${yearVal}`;
                    identifierCache[key] = await this.computeIdentifier(showName, client, yearVal);
                }
            }

            let year, startDate, endDate;

            if (typeof parameters === "string" || parameters.identifier) {
                const identifier = parameters.identifier || parameters;
                // Find the row with the matching identifier (use precomputed cache)
                let foundRow = null;
                for (const row of data) {
                    const showName = row[idxShowName];
                    const client = row[idxClient];
                    const yearVal = row[idxYear];
                    const key = `${showName}|||${client}|||${yearVal}`;
                    if (identifierCache[key] === identifier) {
                        foundRow = row;
                        break;
                    }
                }
                if (!foundRow) {
                    console.warn(`Show ${identifier} not found in schedule`);
                    return [];
                }
                year = foundRow[idxYear];
                let ship = parseDate(foundRow[idxShip]);
                let ret = parseDate(foundRow[idxReturn]);
                if (!ship) {
                    let sStart = parseDate(foundRow[idxSStart]);
                    ship = sStart ? new Date(sStart.getTime() - 10 * 86400000) : null;
                }
                if (!ret) {
                    let sEnd = parseDate(foundRow[idxSEnd]);
                    ret = sEnd ? new Date(sEnd.getTime() + 10 * 86400000) : null;
                }
                if (ship && ship.getFullYear() != year) {
                    ship.setFullYear(Number(year));
                }
                if (ret && ret.getFullYear() != year) {
                    ret.setFullYear(Number(year));
                }
                if (ship && ret && ret <= ship) {
                    ret.setFullYear(ret.getFullYear() + 1);
                }
                startDate = ship;
                endDate = ret;
            } else {
                startDate = parseDate(parameters.startDate);
                endDate = parseDate(parameters.endDate);
                if (!parameters.year) {
                    year = startDate?.getFullYear();
                } else {
                    year = parameters.year;
                }
            }

            if (!year || !startDate || !endDate) {
                return [];
            }

            // Precompute all row date ranges and identifiers
            const rowInfos = [];
            for (const row of data) {
                if (!row[idxYear] || row[idxYear] != year) continue;
                const showName = row[idxShowName];
                const client = row[idxClient];
                const yearVal = row[idxYear];
                const key = `${showName}|||${client}|||${yearVal}`;
                const computedIdentifier = identifierCache[key];
                let ship = parseDate(row[idxShip]) ||
                    (parseDate(row[idxSStart]) ?
                        new Date(parseDate(row[idxSStart]).getTime() - 10 * 86400000) :
                        null);
                let ret = parseDate(row[idxReturn]) ||
                    (parseDate(row[idxSEnd]) ?
                        new Date(parseDate(row[idxSEnd]).getTime() + 10 * 86400000) :
                        null);
                if (ship && ship.getFullYear() != year) {
                    ship.setFullYear(Number(year));
                }
                if (ret && ret.getFullYear() != year) {
                    ret.setFullYear(Number(year));
                }
                if (ship && ret && ret <= ship) {
                    ret.setFullYear(ret.getFullYear() + 1);
                }
                if (!ship || !ret) continue;
                rowInfos.push({
                    identifier: computedIdentifier,
                    ship,
                    ret
                });
            }

            // Find overlaps using precomputed info
            const overlaps = [];
            for (const info of rowInfos) {
                if (info.ret >= startDate && info.ship <= endDate) {
                    overlaps.push(info.identifier);
                }
            }

            // Cache the result
            CacheManager.set(
                CacheManager.NAMESPACES.PROD_SCHEDULE,
                cacheKey,
                overlaps,
                CacheManager.EXPIRATIONS.MEDIUM,
                [],
                trackingId
            );
            
            return overlaps;
        } catch (error) {
            console.error('Failed to check overlapping shows:', error);
            return [];
        }
    }

    /**
     * Compute the "Identifier" value for a production schedule row
     * @param {string} showName - Show name
     * @param {string} clientName - Client name
     * @param {string} year - Production year
     * @param {string} [trackingId] - Optional tracking ID for dependency tracking
     * @returns {Promise<string>} The computed identifier string
     */
    static async computeIdentifier(showName, clientName, year, trackingId = null) {
        // Generate cache key
        const cacheKey = `identifier:${showName}:${clientName}:${year}`;
        
        // Check cache first
        const cachedValue = CacheManager.get(
            CacheManager.NAMESPACES.FUZZY_MATCHING, 
            cacheKey, 
            trackingId
        );
        
        if (cachedValue !== null) {
            return cachedValue;
        }
        
        // If showName is blank, return blank
        if (!showName || !showName.trim()) {
            return '';
        }

        // Get reference data
        const referenceData = await this._getReferenceData(trackingId);
        
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
        const identifier = `${clientMatch} ${year || ''} ${showMatch}`.trim();
        
        // Cache the result
        CacheManager.set(
            CacheManager.NAMESPACES.FUZZY_MATCHING,
            cacheKey,
            identifier,
            CacheManager.EXPIRATIONS.VERY_LONG,
            [],
            trackingId
        );
        
        return identifier;
    }
    
    /**
     * Helper method to get fuzzy matching reference data
     * @param {string} [trackingId] - Optional tracking ID for dependency tracking
     * @returns {Promise<Object>} Reference data for fuzzy matching
     * @private
     */
    static async _getReferenceData(trackingId = null) {
        // Generate cache key
        const cacheKey = 'reference_data';
        
        // Check cache first
        const cachedValue = CacheManager.get(
            CacheManager.NAMESPACES.FUZZY_MATCHING, 
            cacheKey, 
            trackingId
        );
        
        if (cachedValue !== null) {
            return cachedValue;
        }
        
        // Fetch reference data directly from Database
        const clientsData = await Database.getData('PROD_SCHED', 'Clients!A2:B', true, trackingId);
        const showsData = await Database.getData('PROD_SCHED', 'Shows!A2:B', true, trackingId);
        
        const referenceData = {
            clients: {
                names: clientsData.map(row => row[0] || ''),
                abbrs: clientsData.map(row => row[1] || '')
            },
            shows: {
                names: showsData.map(row => row[0] || ''),
                abbrs: showsData.map(row => row[1] || '')
            }
        };
        
        // Cache the result
        CacheManager.set(
            CacheManager.NAMESPACES.FUZZY_MATCHING,
            cacheKey,
            referenceData,
            CacheManager.EXPIRATIONS.VERY_LONG,
            [],
            trackingId
        );
        
        return referenceData;
    }
}