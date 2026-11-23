import { html } from '../../index.js';
import { rowsToChart } from '../../utils/views/chartAdapter.js';
import { ContentHeaderComponent } from './contentHeaderComponent.js';

// Chart.js (js/vendor, the UMD build: window.Chart), loaded the first time a chart draws so pages
// without one don't pay for it
let chartLibrary = null;
function loadChartLibrary() {
    if (window.Chart) return Promise.resolve(window.Chart);
    chartLibrary ??= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('../../../vendor/chart.umd.min.js', import.meta.url).href;
        script.onload = () => resolve(window.Chart);
        script.onerror = () => {
            chartLibrary = null;
            script.remove();
            reject(new Error('The chart library did not load. Refresh to try again.'));
        };
        document.head.appendChild(script);
    });
    return chartLibrary;
}

// A theme property (theme.css) as the colour it is now (light or dark)
const cssColor = (property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim();
// A theme colour name (--color-<name>)
const themeColor = (name) => cssColor(`--color-${name}`) || name;

/**
 * ChartComponent — the chart renderer (views-and-renderers-plan §4.6). Same contract as the other
 * renderers: `resolved` (a chart layout's ResolvedView) and `data` (rows), plus the shared header
 * (view switch, refresh, header-area slot) and loading state. The chart adapter (rowsToChart) gives
 * the points and series; this draws them with Chart.js: one point per row along x, a line (or bar)
 * per series, a legend that hides a series on click, and a tooltip listing every series at a point.
 * It redraws when the rows or the view change and when the light or dark theme changes. No search,
 * sort or row action: the chart has no rows to pick.
 */
export const ChartComponent = {
    name: 'ChartComponent',
    components: { ContentHeaderComponent },
    props: {
        resolved: { type: Object, required: true },
        data: { type: Array, default: () => [] },
        isLoading: { type: Boolean, default: false },
        isAnalyzing: { type: Boolean, default: false },
        loadingProgress: { type: Number, default: -1 },
        loadingMessage: { type: String, default: 'Loading...' },
        emptyMessage: { type: String, default: 'Nothing to chart' },
        showHeader: { type: Boolean, default: true },
        showRefresh: { type: Boolean, default: false },
        viewSelect: { type: Object, default: null },
        // The page's title, as the other renderers take it (unused: kept off the root's tooltip)
        title: { type: String, default: '' }
    },
    emits: ['refresh'],
    data() {
        return { loadError: null };
    },
    computed: {
        theme() {
            return this.resolved.theme || 'gray';
        },
        chartData() {
            return rowsToChart(this.data, this.resolved);
        },
        hasPoints() {
            return this.data.length > 0 && this.chartData.series.length > 0;
        }
    },
    watch: {
        chartData() {
            this.draw();
        }
    },
    mounted() {
        // The theme is html[data-theme] or the system's colour scheme
        this._themeObserver = new MutationObserver(() => this.draw());
        this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        this._schemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
        this._onScheme = () => this.draw();
        this._schemeQuery?.addEventListener?.('change', this._onScheme);
        this.draw();
    },
    beforeUnmount() {
        this._unmounted = true;
        this._themeObserver?.disconnect();
        this._schemeQuery?.removeEventListener?.('change', this._onScheme);
        this._chart?.destroy();
        this._chart = null;
    },
    methods: {
        // Draw anew (the chart object is never reactive); series hidden from the legend stay hidden
        async draw() {
            if (!this.hasPoints) return;
            let Chart;
            try {
                Chart = await loadChartLibrary();
                this.loadError = null;
            } catch (error) {
                this.loadError = error.message;
                return;
            }
            const canvas = this.$refs.canvas;
            if (this._unmounted || !canvas || !this.hasPoints) return;
            const hidden = new Set((this._chart?.data.datasets || []).filter((_, i) => !this._chart.isDatasetVisible(i)).map(set => set.label));
            this._chart?.destroy();
            const { type, labels, series, yLabel, y2Label, stepped } = this.chartData;
            const hasRight = series.some(s => s.axis === 'right');
            // Many points (a day per point over months) draw as a line without dots or x grid lines
            const dense = labels.length > 60;
            const pointRadius = dense ? 0 : 3;
            const text = themeColor('text');
            const grid = themeColor('border');
            const font = { family: getComputedStyle(document.body).fontFamily };
            this._chart = new Chart(canvas, {
                type,
                data: {
                    labels,
                    datasets: series.map(s => ({
                        label: s.label,
                        data: s.values,
                        borderColor: themeColor(s.color),
                        backgroundColor: themeColor(s.color),
                        borderDash: s.dashed ? [6, 4] : [],
                        borderWidth: 2,
                        pointRadius,
                        // A level (stepped) holds its value until the next point
                        ...(stepped ? { stepped: 'after' } : { cubicInterpolationMode: 'monotone' }),
                        yAxisID: s.axis === 'right' ? 'y2' : 'y',
                        hidden: hidden.has(s.label)
                    }))
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    // Drawn at once: no animated change
                    animation: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { position: 'bottom', labels: { color: text, font, usePointStyle: true } },
                        // The hover bubble: the page's opaque background (white in light mode), a
                        // border-colour border and text-colour text
                        tooltip: {
                            backgroundColor: cssColor('--background-color') || '#fff',
                            borderColor: grid,
                            borderWidth: 1,
                            titleColor: text,
                            bodyColor: text,
                            titleFont: font,
                            bodyFont: font,
                            callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y == null ? '—' : ctx.parsed.y.toLocaleString()}` }
                        }
                    },
                    scales: {
                        x: { ticks: { color: text, font }, grid: { color: grid, display: !dense } },
                        y: {
                            beginAtZero: true,
                            ticks: { color: text, font },
                            grid: { color: grid },
                            title: { display: !!yLabel, text: yLabel, color: text, font }
                        },
                        // The second scale, for series on the right axis; its grid lines would
                        // cross the first's
                        ...(hasRight ? {
                            y2: {
                                position: 'right',
                                beginAtZero: true,
                                ticks: { color: text, font },
                                grid: { drawOnChartArea: false },
                                title: { display: !!y2Label, text: y2Label, color: text, font }
                            }
                        } : {})
                    }
                }
            });
        }
    },
    template: html`
        <div class="chart-view">
            <ContentHeaderComponent
                v-if="showHeader"
                :theme="theme"
                :show-refresh="showRefresh"
                :is-loading="isLoading"
                :view-select="viewSelect"
                :embedded-loading="true"
                :is-analyzing="isAnalyzing"
                :loading-progress="loadingProgress"
                @refresh="$emit('refresh')"
            >
                <template #header-area><slot name="header-area"></slot></template>
            </ContentHeaderComponent>
            <div v-show="hasPoints && !loadError" class="chart-container"><canvas ref="canvas"></canvas></div>
            <div v-if="(isLoading || isAnalyzing) && !hasPoints" class="loading-message">
                <p>{{ loadingMessage || 'Loading...' }}</p>
            </div>
            <p v-else-if="loadError" class="empty-message">{{ loadError }}</p>
            <p v-else-if="!hasPoints" class="empty-message">{{ emptyMessage }}</p>
        </div>
    `
};
