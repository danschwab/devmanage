/**
 * Expected work: pure helpers for the expected work report (no data access, no cached calls).
 * Requests.getExpectedWork reads the shows (Requests.getProjectionShows, shared with the inventory
 * projection) and passes them to projectWork.
 *
 * The model, on the inventory projection's steps (utils/inventory-projection.js, projectMeasure):
 * - Hours: each category takes its small-booth hours for a show below `largeSqft` square feet
 *   (and for a show without a size), its large-booth hours from there up (workHours).
 * - Months: the inventory projection's (ProjectionFutureYears); a show's work counts in the month
 *   it ships.
 * - Each category's hours are a measure of the shows, carried forward as the projection carries
 *   square feet: the larger of the hours booked and the same month last year's hours (averaged
 *   over ProjectionHistoryYears), times the trend through each past year's hours and
 *   ProjectionGrowthFactor. A category's trend follows its own hours, so more small booths raise
 *   work that small booths take most more than work that large booths take most.
 */
import { projectMeasure } from './inventory-projection.js';

/** The work categories, with the preference ID part and default hours (small, large booth) */
export const WORK_CATEGORIES = Object.freeze([
    { key: 'boothDesign', label: 'Booth Design', id: 'BoothDesign', small: 4, large: 16 },
    { key: 'boothEngineering', label: 'Booth Engineering', id: 'BoothEngineering', small: 2, large: 12 },
    { key: 'elevations', label: 'Elevations', id: 'Elevations', small: 2, large: 8 },
    { key: 'panels', label: 'Panels', id: 'Panels', small: 4, large: 24 },
    { key: 'setup', label: 'Setup', id: 'Setup', small: 4, large: 16 }
]);

/** Preference rows (CACHE/Preferences, page reports/expected-work): Work<id>SmallHours,
 *  Work<id>LargeHours per category, and the size a large booth starts at */
export const WORK_LARGE_BOOTH = Object.freeze({ id: 'WorkLargeBoothSqft', default: 400, min: 0 });

/** The page whose menu shows the work preference rows */
export const WORK_PAGE = 'reports/expected-work';

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * The work settings from preference rows ({ id, value }); a missing, invalid or negative value
 * takes its default (hours) or minimum.
 * @param {Array<{id: string, value: string}>} preferences
 * @returns {{ largeSqft: number, categories: Array<{key, label, small: number, large: number}> }}
 */
export function resolveWorkSettings(preferences) {
    const rows = Array.isArray(preferences) ? preferences : [];
    const read = (id, fallback, min = 0) => {
        const value = parseFloat(rows.find(row => row?.id === id)?.value);
        return Number.isFinite(value) ? Math.max(min, value) : fallback;
    };
    return {
        largeSqft: read(WORK_LARGE_BOOTH.id, WORK_LARGE_BOOTH.default, WORK_LARGE_BOOTH.min),
        categories: WORK_CATEGORIES.map(({ key, label, id, small, large }) => ({
            key,
            label,
            small: read(`Work${id}SmallHours`, small),
            large: read(`Work${id}LargeHours`, large)
        }))
    };
}

/**
 * A category's hours for one show.
 * @param {{small: number, large: number}} category
 * @param {number} sqft - The show's square feet; 0 without a size (a small booth)
 * @param {number} largeSqft - Where a large booth starts
 * @returns {number}
 */
export function workHours(category, sqft, largeSqft) {
    return sqft >= largeSqft ? category.large : category.small;
}

/**
 * The expected work, month by month (see the model above).
 * @param {Object} input
 * @param {string[]} input.months - The future months, in order
 * @param {Array<{month, sqft}>} input.scheduledShows - Booked shows shipping in the projected months
 * @param {Array<{ship, end, month, sqft}>} input.pastShows - Past shows, by the month they shipped
 * @param {Object} work - resolveWorkSettings
 * @param {Object} settings - resolveProjectionSettings
 * @returns {Array<{month: string, bookedShows: number, bookedLarge: number,
 *          hours: Object<string, {booked: number, expected: number}>, total: {booked: number, expected: number}}>}
 *          hours by category key: booked, those of the shows on the schedule; expected, with the
 *          shows not booked yet
 */
export function projectWork({ months, scheduledShows, pastShows }, work, settings) {
    const perCategory = work.categories.map(category => ({
        category,
        rows: projectMeasure({ months, scheduledShows, pastShows, measure: sqft => workHours(category, sqft, work.largeSqft) }, settings).rows
    }));
    return months.map((month, i) => {
        const booked = scheduledShows.filter(show => show.month === month);
        const hours = {};
        const total = { booked: 0, expected: 0 };
        for (const { category, rows } of perCategory) {
            const row = rows[i];
            hours[category.key] = { booked: round1(row.scheduledSqft), expected: round1(row.projectedSqft) };
            total.booked += row.scheduledSqft;
            total.expected += row.projectedSqft;
        }
        return {
            month,
            bookedShows: booked.length,
            bookedLarge: booked.filter(show => show.sqft >= work.largeSqft).length,
            hours,
            total: { booked: round1(total.booked), expected: round1(total.expected) }
        };
    });
}
