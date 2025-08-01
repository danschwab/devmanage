import { Database, parseDate, wrapMethods } from '../index.js';
import { Analytics } from './analytics.js';

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
        const mapping = {
            showName: "Show Name",
            client: "Client",
            year: "Year",
            ship: "Ship",
            expectedReturnDate: "Expected Return Date",
            sStart: "S. Start",
            sEnd: "S. End"
        };
        const data = await Database.getData('PROD_SCHED', tabName, mapping);
        // ...existing code...
        let year, startDate, endDate;
        if (typeof parameters === "string" || parameters.identifier) {
            const identifier = parameters.identifier || parameters;
            let foundRow = null;
            for (const row of data) {
                const showName = row.showName;
                const client = row.client;
                const yearVal = row.year;
                if (showName && client && yearVal) {
                    const computedIdentifier = await Analytics.computeIdentifier(showName, client, yearVal);
                    if (computedIdentifier === identifier) {
                        foundRow = row;
                        break;
                    }
                }
            }
            if (!foundRow) return [];
            year = foundRow.year;
            let ship = parseDate(foundRow.ship);
            let ret = parseDate(foundRow.expectedReturnDate);
            if (!ship) {
                let sStart = parseDate(foundRow.sStart);
                ship = sStart ? new Date(sStart.getTime() - 10 * 86400000) : null;
            }
            if (!ret) {
                let sEnd = parseDate(foundRow.sEnd);
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
            if (!row.year || row.year != year) continue;
            const showName = row.showName;
            const client = row.client;
            const yearVal = row.year;
            let computedIdentifier = '';
            if (showName && client && yearVal) {
                computedIdentifier = await Analytics.computeIdentifier(showName, client, yearVal);
            }
            let ship = parseDate(row.ship) ||
                (parseDate(row.sStart) ? new Date(parseDate(row.sStart).getTime() - 10 * 86400000) : null);
            let ret = parseDate(row.expectedReturnDate) ||
                (parseDate(row.sEnd) ? new Date(parseDate(row.sEnd).getTime() + 10 * 86400000) : null);
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
    // ...existing code...
}

export const ProductionUtils = wrapMethods(productionUtils, 'production_utils');