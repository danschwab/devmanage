/**
 * Buckets (views-and-renderers-plan §4.6): rows grouped by one field, for any renderer that
 * summarizes many rows in one place (bucket cards, bucketed charts). Pure: no Vue, no DOM.
 *
 *   bucketKey(value, unit)                   the bucket a value falls in
 *   bucketRows(rows, by, { unit, until, keys })  [{ key, rows }]
 *   bucketLabel(key, unit)                   the bucket as text
 *   aggregate(buckets, spec)                 one number per bucket
 *
 * Units: none groups by the value itself, in the order keys are first seen (seeded `keys` first,
 * kept even when empty). A date unit ('day', 'month', 'year') groups by the date's day, month or
 * year (YYYY-MM-DD, YYYY-MM, YYYY), sorts the buckets, and fills the gaps between the first and
 * the last (and the seeded keys) with empty buckets, so a time axis has no holes. With a date unit,
 * `until` names a second date field: a row then lasts from its `by` date to that one and falls in
 * every bucket between (a stock level held until the next change, a show out from ship to return).
 */
import { parseDate, toISODateString } from '../../../data_management/utils/helpers.js';

export const BUCKET_UNITS = ['day', 'month', 'year'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The bucket a value falls in: the value itself without a unit (blank is none), its date's day,
 * month or year with one (null when it isn't a date).
 * @param {*} value
 * @param {string} [unit]
 * @returns {*} the key, or null for no bucket
 */
export function bucketKey(value, unit) {
    if (value === undefined || value === null || value === '') return null;
    if (!unit) return value;
    const iso = /^\d{4}-\d{2}-\d{2}/.test(String(value)) ? String(value).slice(0, 10) : toISODateString(parseDate(value));
    if (!iso) return null;
    return unit === 'year' ? iso.slice(0, 4) : unit === 'month' ? iso.slice(0, 7) : iso;
}

// The date unit's key after `key` (one day, month or year on)
function nextKey(key, unit) {
    if (unit === 'year') return String(Number(key) + 1);
    if (unit === 'month') {
        const [y, m] = key.split('-').map(Number);
        return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    }
    const day = new Date(`${key}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1);
    return day.toISOString().slice(0, 10);
}

/**
 * Rows grouped by row[by] (see units above).
 * @param {Object[]} rows
 * @param {string} by - The field to group by
 * @param {{ unit?: string, until?: string, keys?: Array }} [opts] - until: the field a row lasts
 *        to (date units; a row without one, or ending before it starts, falls in its first bucket
 *        only); keys: buckets that exist even with no rows
 * @returns {Array<{ key: *, rows: Object[] }>}
 */
export function bucketRows(rows, by, { unit = null, until = null, keys = [] } = {}) {
    const groups = new Map();
    const add = (key, row) => {
        if (!groups.has(key)) groups.set(key, []);
        if (row) groups.get(key).push(row);
    };
    for (const key of keys) {
        const k = unit ? bucketKey(key, unit) : key;
        if (k !== null) add(k, null);
    }
    for (const row of rows || []) {
        const key = bucketKey(row?.[by], unit);
        if (key === null) continue;
        const last = unit && until ? bucketKey(row[until], unit) : null;
        add(key, row);
        for (let k = key; last && k < last;) {
            k = nextKey(k, unit);
            add(k, row);
        }
    }
    if (!unit) return [...groups].map(([key, members]) => ({ key, rows: members }));
    const sorted = [...groups.keys()].sort();
    const out = [];
    if (!sorted.length) return out;
    for (let key = sorted[0]; key <= sorted[sorted.length - 1]; key = nextKey(key, unit)) {
        out.push({ key, rows: groups.get(key) || [] });
    }
    return out;
}

/**
 * A bucket key as text: 'Jul 2025' for a month, '7/10/2025' for a day; otherwise the key.
 * @param {*} key
 * @param {string} [unit]
 * @returns {string}
 */
export function bucketLabel(key, unit) {
    if (unit === 'month') return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
    if (unit === 'day') return `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}/${key.slice(0, 4)}`;
    return String(key);
}

const toNumber = (value) => {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

/**
 * One number per bucket:
 *   { count: true }  the rows in it
 *   { sum: key }     the rows' numbers added up (blank and non-numbers left out)
 *   { last: key }    the last row's number: a level, like stock, so an empty bucket keeps the
 *                    bucket before's (null before the first)
 * @param {Array<{ rows: Object[] }>} buckets
 * @param {{ count?: boolean, sum?: string, last?: string }} spec
 * @returns {Array<number|null>}
 */
export function aggregate(buckets, spec) {
    if (spec.count) return buckets.map(b => b.rows.length);
    if (spec.sum) return buckets.map(b => b.rows.reduce((total, row) => total + (toNumber(row[spec.sum]) ?? 0), 0));
    if (spec.last) {
        let level = null;
        return buckets.map(b => {
            for (const row of b.rows) {
                const n = toNumber(row[spec.last]);
                if (n !== null) level = n;
            }
            return level;
        });
    }
    return buckets.map(() => null);
}
