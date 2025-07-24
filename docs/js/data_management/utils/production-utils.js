import { Database, GetTopFuzzyMatch, parseDate, wrapMethods } from '../../index.js';

/**
 * Utility functions for production schedule operations
 */
class productionUtils {
    /**
     * Get overlapping shows based on parameters
     * @param {string|Object} parameters - Project identifier or date range parameters
     * @returns {Promise<string[]>} Array of overlapping project identifiers
     */
    static async getOverlappingShows(parameters) {
        const tabName = "ProductionSchedule";
        const data = await Database.getData('PROD_SCHED', `${tabName}!A:J`);
        const headers = data[0];
        const idxShowName = headers.findIndex(h => h.toLowerCase() === "show name" || h.toLowerCase() === "show");
        const idxClient = headers.findIndex(h => h.toLowerCase() === "client");
        const idxYear = headers.findIndex(h => h.toLowerCase() === "year");
        const idxShip = headers.findIndex(h => h.toLowerCase() === "ship");
        const idxReturn = headers.findIndex(h => h.toLowerCase() === "expected return date");
        const idxSStart = headers.findIndex(h => h.toLowerCase() === "s. start");
        const idxSEnd = headers.findIndex(h => h.toLowerCase() === "s. end");
        const identifierCache = {};
        for (const row of data) {
            const showName = row[idxShowName];
            const client = row[idxClient];
            const yearVal = row[idxYear];
            if (showName && client && yearVal) {
                const key = `${showName}|||${client}|||${yearVal}`;
                identifierCache[key] = await productionUtils.computeIdentifier(showName, client, yearVal);
            }
        }
        let year, startDate, endDate;
        if (typeof parameters === "string" || parameters.identifier) {
            const identifier = parameters.identifier || parameters;
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
            if (!foundRow) return [];
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
            if (ship && ship.getFullYear() != year) ship.setFullYear(Number(year));
            if (ret && ret.getFullYear() != year) ret.setFullYear(Number(year));
            if (ship && ret && ret <= ship) ret.setFullYear(ret.getFullYear() + 1);
            startDate = ship;
            endDate = ret;
        } else {
            startDate = parseDate(parameters.startDate);
            endDate = parseDate(parameters.endDate);
            year = parameters.year || startDate?.getFullYear();
        }
        if (!year || !startDate || !endDate) return [];
        const rowInfos = [];
        for (const row of data) {
            if (!row[idxYear] || row[idxYear] != year) continue;
            const showName = row[idxShowName];
            const client = row[idxClient];
            const yearVal = row[idxYear];
            const key = `${showName}|||${client}|||${yearVal}`;
            const computedIdentifier = identifierCache[key];
            let ship = parseDate(row[idxShip]) ||
                (parseDate(row[idxSStart]) ? new Date(parseDate(row[idxSStart]).getTime() - 10 * 86400000) : null);
            let ret = parseDate(row[idxReturn]) ||
                (parseDate(row[idxSEnd]) ? new Date(parseDate(row[idxSEnd]).getTime() + 10 * 86400000) : null);
            if (ship && ship.getFullYear() != year) ship.setFullYear(Number(year));
            if (ret && ret.getFullYear() != year) ret.setFullYear(Number(year));
            if (ship && ret && ret <= ship) ret.setFullYear(ret.getFullYear() + 1);
            if (!ship || !ret) continue;
            rowInfos.push({ identifier: computedIdentifier, ship, ret });
        }
        const overlaps = [];
        for (const info of rowInfos) {
            if (info.ret >= startDate && info.ship <= endDate) {
                overlaps.push(info.identifier);
            }
        }
        return overlaps;
    }
    /**
     * Compute the "Identifier" value for a production schedule row
     * @param {string} showName - Show name
     * @param {string} clientName - Client name
     * @param {string} year - Production year
     * @returns {Promise<string>} The computed identifier string
     */
    static async computeIdentifier(showName, clientName, year) {
        // If showName is blank, return blank
        if (!showName || !showName.trim()) {
            return '';
        }

        // Get reference data
        const referenceData = await productionUtils._getReferenceData();
        
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
     * @returns {Promise<Object>} Reference data for fuzzy matching
     * @private
     */
    static async _getReferenceData() {
        const clientsData = await Database.getData('PROD_SCHED', 'Clients!A2:B');
        const showsData = await Database.getData('PROD_SCHED', 'Shows!A2:B');
        return {
            clients: {
                names: clientsData.map(row => row[0] || ''),
                abbrs: clientsData.map(row => row[1] || '')
            },
            shows: {
                names: showsData.map(row => row[0] || ''),
                abbrs: showsData.map(row => row[1] || '')
            }
        };
    }
}

export const ProductionUtils = wrapMethods(productionUtils, 'production_utils');