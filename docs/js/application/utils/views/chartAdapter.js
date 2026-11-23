import { formatText } from './fieldFormat.js';
import { bucketRows, bucketLabel, aggregate } from './buckets.js';

// Series colours in order for series whose view names none: theme colour names (theme.css
// --color-<name>)
export const CHART_COLORS = ['blue', 'green', 'orange', 'purple', 'red', 'gray'];

const AGG_LABELS = { count: 'Count' };

/**
 * The chart renderer's data (views-and-renderers-plan §4.6).
 * - Points: one per row, labelled by the view's x field as text; or, with chart.bucket, one per
 *   bucket of rows (buckets.js: by a field's value, or its date's day, month or year with the gaps
 *   filled; with `until`, a row in every bucket from its date to that field's), labelled by the
 *   bucket.
 * - Series: a row value per point (a blank or non-number is a gap), or per bucket the rows' count,
 *   sum or last value (aggregate). Labelled and coloured by the series' own label and color, else
 *   its key's style (label, color: a theme colour name), else its field label and the next colour
 *   no series names. dashed, and axis: 'left' or 'right' (a second scale).
 * Pure: the renderer turns the colour names into colours.
 * @param {Object[]} rows
 * @param {Object} resolved - ResolvedView of a chart layout
 * @returns {{ type: string, labels: string[], yLabel: string, y2Label: string, stepped: boolean,
 *            series: Array<{ key, label, values: Array<number|null>, color: string, dashed: boolean, axis: string }> }}
 */
export function rowsToChart(rows, resolved) {
    const chart = resolved.chart;
    const style = (key) => (key ? resolved.style[key] || {} : {});
    const colorOf = (s) => s.color || style(s.key).color;
    const named = new Set(chart.series.map(colorOf).filter(Boolean));
    const free = CHART_COLORS.filter(color => !named.has(color));
    let next = 0;
    const number = (value) => {
        if (value === '' || value == null) return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    };

    let labels;
    let valuesOf;
    if (chart.bucket) {
        const { by, until, unit } = chart.bucket;
        const buckets = bucketRows(rows, by, { unit, until });
        labels = buckets.map(b => (unit ? bucketLabel(b.key, unit) : formatText(b.key, resolved.fieldMap.get(by))));
        valuesOf = (s) => aggregate(buckets, { [s.agg]: s.agg === 'count' ? true : s.key });
    } else {
        labels = rows.map(row => formatText(row[chart.x], resolved.fieldMap.get(chart.x)));
        valuesOf = (s) => rows.map(row => number(row[s.key]));
    }

    return {
        type: chart.type,
        yLabel: chart.yLabel,
        y2Label: chart.y2Label,
        stepped: chart.stepped,
        labels,
        series: chart.series.map(s => ({
            key: s.id,
            label: s.label ?? style(s.key).label ?? (s.key ? resolved.fieldMap.get(s.key)?.label ?? s.key : AGG_LABELS[s.agg]),
            values: valuesOf(s),
            color: colorOf(s) || (free.length ? free[next++ % free.length] : CHART_COLORS[0]),
            dashed: s.dashed,
            axis: s.axis
        }))
    };
}
