import { formatText } from './fieldFormat.js';

// Series colours in order for series whose view names none: theme colour names (theme.css
// --color-<name>)
export const CHART_COLORS = ['blue', 'green', 'orange', 'purple', 'red', 'gray'];

/**
 * The chart renderer's data (views-and-renderers-plan §4.6): one point per row, labelled by the
 * view's x field as text, and one series per series key, its values the rows' numbers (a blank or
 * non-number is a gap). A series is labelled and coloured by its style (label, color: a theme
 * colour name) or its field label and the next colour no series names; chart.dashed lists the
 * series drawn dashed. Pure: the renderer turns the colour names into colours.
 * @param {Object[]} rows
 * @param {Object} resolved - ResolvedView of a chart layout
 * @returns {{ type: string, labels: string[], yLabel: string,
 *            series: Array<{ key, label, values: Array<number|null>, color: string, dashed: boolean }> }}
 */
export function rowsToChart(rows, resolved) {
    const chart = resolved.chart;
    const style = (key) => resolved.style[key] || {};
    const named = new Set(chart.series.map(key => style(key).color).filter(Boolean));
    const free = CHART_COLORS.filter(color => !named.has(color));
    let next = 0;
    const number = (value) => {
        if (value === '' || value == null) return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    };
    return {
        type: chart.type,
        yLabel: chart.yLabel,
        labels: rows.map(row => formatText(row[chart.x], resolved.fieldMap.get(chart.x))),
        series: chart.series.map(key => ({
            key,
            label: style(key).label ?? resolved.fieldMap.get(key)?.label ?? key,
            values: rows.map(row => number(row[key])),
            color: style(key).color || (free.length ? free[next++ % free.length] : CHART_COLORS[0]),
            dashed: chart.dashed.includes(key)
        }))
    };
}
