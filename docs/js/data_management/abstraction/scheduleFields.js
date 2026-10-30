/**
 * Production Schedule field definitions (views-and-renderers-plan §3, §4.1).
 *
 * Fields describe what each Schedule column IS: label, data type, format, sortability.
 * They are shared by every page that shows Schedule rows (the Schedule page and the design
 * queue). Presentation (which columns show, widths, colours) belongs to each page's views.
 *
 * The sheet's headers are dynamic, so fields are built from the loaded headers. The known
 * columns are always present, so views can reference them before data loads.
 *
 * Pure: no Vue, no DOM.
 */

/** Columns every Schedule view can rely on, in the sheet's usual order. */
export const SCHEDULE_KNOWN_COLUMNS = Object.freeze([
    'Show', 'Client', 'Year', 'City', 'Size', 'S. Start', 'S. End', 'Ship', 'Recieved'
]);

/** Synthetic field for the packlist cell (no sheet data; the page decorates it). */
export const PACKLIST_FIELD_KEY = 'packlist';

const LABELS = {
    'S. Start': 'Start Date',
    'S. End': 'End Date',
    'Booth#': 'Booth #',
    'Ship': 'Ship Date'
};

const SORTABLE = new Set(['Show', 'Client', 'Ship', 'City', 'Size', 'S. Start',
    'Start Date', 'End Date', 'Load In', 'Load Out', 'Event Start', 'Event End']);

/** Human label for a sheet header (moved from ScheduleTable.formatColumnLabel). */
export function scheduleLabel(header) {
    if (LABELS[header]) return LABELS[header];
    if (['Year', 'Show', 'Client', 'City', 'Location'].includes(header)) return header;
    return String(header)
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]/g, ' ')
        .replace(/\.([a-zA-Z])/g, '. $1')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

function isDateHeader(key) {
    return ['date', 'start', 'end', 'ship', 'due', 'deadline', 'created', 'updated', 'modified', 'time', 'return']
        .some(k => key.includes(k));
}
function isNumberHeader(key) {
    return ['qty', 'quantity'].some(k => key.includes(k)) || /^\d+$/.test(key);
}
function isCurrencyHeader(key) {
    return ['price', 'cost', 'amount', 'fee', 'rate', 'budget', 'expense', 'revenue', 'total'].some(k => key.includes(k));
}

/** FieldDef for one Schedule header. */
export function scheduleField(header) {
    const key = header.toLowerCase();
    const field = { key: header, label: scheduleLabel(header), sortable: SORTABLE.has(header) };
    if (isDateHeader(key)) {
        field.format = 'date';
        field.type = 'date';
    } else if (isNumberHeader(key)) {
        field.format = 'number';
        field.type = 'number';
    } else if (isCurrencyHeader(key)) {
        field.format = 'currency';
    }
    return field;
}

/**
 * Build Schedule fields from the loaded rows' headers.
 * @param {Object[]} rows Schedule rows (headers from the first row)
 * @param {{ packlist?: boolean }} [opts] add the synthetic packlist field
 * @returns {Object[]} FieldDef[]
 */
export function buildScheduleFields(rows, opts = {}) {
    const { packlist = true } = opts;
    const headers = [];
    const seen = new Set();
    const add = (h) => { if (h && !seen.has(h) && h !== 'AppData') { seen.add(h); headers.push(h); } };
    const first = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (first) Object.keys(first).forEach(add);
    SCHEDULE_KNOWN_COLUMNS.forEach(add);
    const fields = headers.map(scheduleField);
    if (packlist) fields.push({ key: PACKLIST_FIELD_KEY, label: 'Packlist', sortable: false });
    return fields;
}
