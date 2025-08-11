import { Database, parseDate, wrapMethods } from '../index.js';
import { Analytics } from './analytics.js';
import { searchFilter } from '../utils/searchFilter.js';

/**
 * Utility functions for production schedule operations
 */
class productionUtils {
    /**
     * Get overlapping shows based on parameters
     * @param {string|Object} parameters - Project identifier or date range parameters
     * @returns {Promise<string[]>} Array of overlapping project identifiers
     */
    static async getOverlappingShows(parameters = null, searchParams = null) {
        console.log('[production-utils] getOverlappingShows called with:', parameters);
        const tabName = "ProductionSchedule";
        const mapping = {
            Show: "Show",
            Client: "Client",
            Year: "Year",
            City: "City",
            'Booth#': 'Booth#',
            'S. Start': 'S. Start',
            'S. End': 'S. End',
            Ship: 'Ship'
        };
        let data = await Database.getData('PROD_SCHED', tabName, mapping);
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
                    const computedIdentifier = await Analytics.computeIdentifier(showName, client, yearVal);
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
            if (ship && ship.getFullYear() != year) ship.setFullYear(Number(year));
            if (ret && ret.getFullYear() != year) ret.setFullYear(Number(year));
            if (ship && ret && ret <= ship) ret.setFullYear(ret.getFullYear() + 1);
            startDate = ship;
            endDate = ret;
            console.log(`[production-utils] Identifier mode: year=${year}, startDate=${startDate}, endDate=${endDate}`);
        } else {
            startDate = parseDate(parameters.startDate, true, parameters.year);
            endDate = parseDate(parameters.endDate, true, parameters.year);
            year = parameters.year || startDate?.getFullYear();
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
            if (ship && ship.getFullYear() != row.Year) ship.setFullYear(Number(row.Year));
            if (ret && ret.getFullYear() != row.Year) ret.setFullYear(Number(row.Year));
            if (ship && ret && ret <= ship) ret.setFullYear(ret.getFullYear() + 1);
            if (!ship || !ret) return false;
            return (ret >= startDate && ship <= endDate);
        });
        console.log(`[production-utils] Filtered overlapping shows:`, filtered);
        return filtered;
    }
    // ...existing code...
}

export const ProductionUtils = wrapMethods(productionUtils, 'production_utils');