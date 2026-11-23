/**
 * Expected work: pure helpers for the expected work report (no data access, no cached calls).
 * Requests.getExpectedWork reads the shows (Requests.getProjectionShows, shared with the inventory
 * projection) and passes them to projectWork.
 *
 * The model, on the inventory projection's steps (utils/inventory-projection.js, projectMeasure):
 * - Hours: each category's hours are set at two booth sizes, a small booth (`smallSqft`, a 20x20)
 *   and a large one (`largeSqft`, a 40x40). A booth between the two takes hours in proportion to
 *   its size; a smaller booth, or a show without a size, the small hours; a larger one the large
 *   hours (workHours).
 * - Months: the inventory projection's (ProjectionFutureYears). A category's work for a show falls
 *   its own number of days before the show ships (`offsetDays`; negative is after), and counts in
 *   the month that day falls in (workMonth). Work falling before this month is past, even for a
 *   booked show; work for shows shipping after the last month isn't read, and last year's figures
 *   stand in for it.
 * - Each category's hours are a measure of the shows, carried forward as the projection carries
 *   square feet: the larger of the hours booked and the same month last year's hours (averaged
 *   over ProjectionHistoryYears), times the trend through each past year's hours and
 *   ProjectionGrowthFactor. A category's trend follows its own hours, so more small booths raise
 *   work that small booths take most more than work that large booths take most.
 * - Total control: the control categories' hours (every one but booth design) added up month by
 *   month, each category's in the month its own days before shipping put them in.
 * - Done: a booked show's work in a category is done once its schedule checkbox is checked (Elev,
 *   Panels, Setups; `done` lists a show's checked ones). Setups checked means all its work is done.
 *   Done hours come off the month's booked and expected hours (the month's volume still holds
 *   them, so last year's figures don't add them back); past shows count in full as history.
 */
import { projectMeasure, monthOf } from './inventory-projection.js';

/** The work categories, with the preference ID part, default hours (small, large booth), whether
 *  the category counts in the total control, and the schedule checkbox marking it done (none yet
 *  for design and engineering: done with Setups) */
export const WORK_CATEGORIES = Object.freeze([
    { key: 'boothDesign', label: 'Booth Design', id: 'BoothDesign', small: 4, large: 16, control: false, doneColumn: null },
    { key: 'boothEngineering', label: 'Booth Engineering', id: 'BoothEngineering', small: 2, large: 12, control: true, doneColumn: null },
    { key: 'elevations', label: 'Elevations', id: 'Elevations', small: 2, large: 8, control: true, doneColumn: 'Elev' },
    { key: 'panels', label: 'Panels', id: 'Panels', small: 4, large: 24, control: true, doneColumn: 'Panels' },
    { key: 'setup', label: 'Setup', id: 'Setup', small: 4, large: 16, control: true, doneColumn: 'Setups' }
]);

/** The schedule checkbox that marks all of a show's work done */
export const WORK_ALL_DONE_COLUMN = 'Setups';

/** The schedule checkbox columns finished work reads (ProductionUtils.getShowWorkDone) */
export const WORK_DONE_COLUMNS = Object.freeze([...new Set([...WORK_CATEGORIES.map(c => c.doneColumn).filter(Boolean), WORK_ALL_DONE_COLUMN])]);

/**
 * Whether a show's work in a category is done: its checkbox, or the all-done one, is checked.
 * @param {{doneColumn: string|null}} category
 * @param {string[]} [checked] - The show's checked work columns
 * @returns {boolean}
 */
export function workDone(category, checked = []) {
    return checked.includes(WORK_ALL_DONE_COLUMN) || (!!category.doneColumn && checked.includes(category.doneColumn));
}

/** Preference rows (CACHE/Preferences, page reports/expected-work): per category Work<id>SmallHours,
 *  Work<id>LargeHours and Work<id>OffsetDays (days before shipping, default 0), and the two booth
 *  sizes the hours are set at */
export const WORK_BOOTH_SIZES = Object.freeze({
    small: { id: 'WorkSmallBoothSqft', default: 400 },
    large: { id: 'WorkLargeBoothSqft', default: 1600 }
});

/** The page whose menu shows the work preference rows */
export const WORK_PAGE = 'reports/expected-work';

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * The work settings from preference rows ({ id, value }); a missing or invalid value takes its
 * default, hours and sizes below 0 are 0, and days are whole (negative: after shipping).
 * @param {Array<{id: string, value: string}>} preferences
 * @returns {{ smallSqft: number, largeSqft: number,
 *            categories: Array<{key, label, control: boolean, doneColumn: string|null, small: number, large: number, offsetDays: number}> }}
 */
export function resolveWorkSettings(preferences) {
    const rows = Array.isArray(preferences) ? preferences : [];
    const read = (id, fallback, min = 0) => {
        const value = parseFloat(rows.find(row => row?.id === id)?.value);
        return Number.isFinite(value) ? Math.max(min, value) : fallback;
    };
    return {
        smallSqft: read(WORK_BOOTH_SIZES.small.id, WORK_BOOTH_SIZES.small.default),
        largeSqft: read(WORK_BOOTH_SIZES.large.id, WORK_BOOTH_SIZES.large.default),
        categories: WORK_CATEGORIES.map(({ key, label, id, small, large, control, doneColumn }) => ({
            key,
            label,
            control,
            doneColumn,
            small: read(`Work${id}SmallHours`, small),
            large: read(`Work${id}LargeHours`, large),
            offsetDays: Math.round(read(`Work${id}OffsetDays`, 0, -Infinity))
        }))
    };
}

/**
 * A category's hours for one show: its small hours up to the small booth size, its large hours from
 * the large size, in proportion to the size in between.
 * @param {{small: number, large: number}} category
 * @param {number} sqft - The show's square feet; 0 without a size (a small booth)
 * @param {{smallSqft: number, largeSqft: number}} sizes - resolveWorkSettings
 * @returns {number}
 */
export function workHours(category, sqft, { smallSqft, largeSqft }) {
    if (!(sqft > smallSqft)) return category.small;
    if (sqft >= largeSqft) return category.large;
    return category.small + (category.large - category.small) * (sqft - smallSqft) / (largeSqft - smallSqft);
}

/**
 * The month a show's work falls in: `offsetDays` before it ships (a show without a ship date keeps
 * its month).
 * @param {{ship?: string, month: string}} show
 * @param {number} offsetDays
 * @returns {string} YYYY-MM
 */
export function workMonth(show, offsetDays) {
    if (!offsetDays || !/^\d{4}-\d{2}-\d{2}/.test(show.ship || '')) return show.month;
    const day = new Date(`${show.ship.slice(0, 10)}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() - offsetDays);
    return monthOf(day.toISOString().slice(0, 10));
}

/**
 * The expected work, month by month (see the model above).
 * @param {Object} input
 * @param {string[]} input.months - The future months, in order, from this month
 * @param {Array<{ship, month, sqft, done?: string[]}>} input.scheduledShows - Booked shows shipping in
 *        the projected months, with their checked work columns
 * @param {Array<{ship, end, month, sqft, done?: string[]}>} input.pastShows - Past shows, by the month they shipped
 * @param {Object} work - resolveWorkSettings
 * @param {Object} settings - resolveProjectionSettings
 * @returns {Array<{month: string, bookedShows: number, bookedLarge: number,
 *          hours: Object<string, {booked, expected, done}>, control: {booked, expected, done}}>}
 *          bookedShows and bookedLarge (from the large size up): the booked shows shipping that
 *          month, but those with all their work done. hours by category key: booked, the work still
 *          to do falling that month for the shows on the schedule; expected, with the shows not
 *          booked yet; done, the booked work already done. control: the control categories' hours
 *          added up
 */
export function projectWork({ months, scheduledShows, pastShows }, work, settings) {
    const thisMonth = months[0];
    const shows = [...scheduledShows, ...pastShows];
    const perCategory = work.categories.map(category => {
        // The shows by the month this category's work falls in: from this month booked, before it past
        const shifted = shows.map(show => ({ ...show, month: workMonth(show, category.offsetDays) }));
        const booked = shifted.filter(show => show.month >= thisMonth);
        const done = {};
        for (const show of booked) {
            if (workDone(category, show.done)) done[show.month] = (done[show.month] || 0) + workHours(category, show.sqft, work);
        }
        return {
            category,
            done,
            rows: projectMeasure({
                months,
                scheduledShows: booked,
                pastShows: shifted.filter(show => show.month < thisMonth),
                measure: sqft => workHours(category, sqft, work)
            }, settings).rows
        };
    });
    const allDone = (show) => (show.done || []).includes(WORK_ALL_DONE_COLUMN);
    return months.map((month, i) => {
        const booked = scheduledShows.filter(show => show.month === month && !allDone(show));
        const hours = {};
        const control = { booked: 0, expected: 0, done: 0 };
        for (const { category, rows, done } of perCategory) {
            const row = rows[i];
            const finished = done[month] || 0;
            const value = { booked: Math.max(0, row.scheduledSqft - finished), expected: Math.max(0, row.projectedSqft - finished), done: finished };
            hours[category.key] = { booked: round1(value.booked), expected: round1(value.expected), done: round1(value.done) };
            if (!category.control) continue;
            control.booked += value.booked;
            control.expected += value.expected;
            control.done += value.done;
        }
        return {
            month,
            bookedShows: booked.length,
            bookedLarge: booked.filter(show => show.sqft >= work.largeSqft).length,
            hours,
            control: { booked: round1(control.booked), expected: round1(control.expected), done: round1(control.done) }
        };
    });
}
