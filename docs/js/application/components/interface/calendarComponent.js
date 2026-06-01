import { html, parseDate, LoadingBarComponent, NavigationRegistry } from '../../index.js';
import { useSearch } from '../../utils/useSearch.js';
import { useStickyHeader } from '../../utils/useStickyHeader.js';

export const CalendarLayoutToggle = {
    name: 'CalendarLayoutToggle',
    inject: ['appContext'],
    props: {
        containerPath: { type: String, required: true },
        navigateToPath: { type: Function, required: true }
    },
    computed: {
        isCalendarView() {
            const params = NavigationRegistry.getNavigationParameters(this.containerPath);
            return params.layout === 'calendar';
        },
        togglePath() {
            const cleanPath = this.containerPath.split('?')[0];
            const params = { ...NavigationRegistry.getNavigationParameters(this.containerPath) };
            if (this.isCalendarView) {
                delete params.layout;
            } else {
                params.layout = 'calendar';
            }
            return NavigationRegistry.buildPath(cleanPath, params);
        }
    },
    methods: {
        toggle() {
            const cleanPath = this.containerPath.split('?')[0];
            const isOnDashboard = this.appContext?.currentPath?.split('?')[0].split('/')[0] === 'dashboard';
            if (isOnDashboard) {
                NavigationRegistry.dashboardRegistry.updatePath(cleanPath, this.togglePath);
            } else {
                this.navigateToPath(this.togglePath);
            }
        }
    },
    template: html`
        <button
            class="white button-symbol"
            :title="isCalendarView ? 'Switch to table view' : 'Switch to calendar view'"
            @click="toggle()"
        >
            <span class="material-symbols-outlined">{{ isCalendarView ? 'table' : 'calendar_month' }}</span>
            <!--{{ isCalendarView ? 'Table' : 'Calendar' }}-->
        </button>
    `
};

export const CalendarComponent = {
    name: 'CalendarComponent',
    components: { LoadingBarComponent },
    props: {
        data: { type: Array, default: () => [] },
        columns: { type: Array, default: () => [] },
        isLoading: { type: Boolean, default: false },
        isAnalyzing: { type: Boolean, default: false },
        loadingProgress: { type: Number, default: 0 },
        loadingMessage: { type: String, default: '' },
        error: { type: String, default: null },
        title: { type: String, default: '' },
        emptyMessage: { type: String, default: 'No events to display.' },
        parentSearchValue: { type: String, default: '' },
        showRefresh: { type: Boolean, default: false },
        eventStartColumn: { type: String, required: true },
        eventEndColumn: { type: String, required: true },
        weekStart: { type: String, default: 'sunday' },
        yearColumn: { type: String, default: null },
        chipActions: { type: Function, default: null },
        chipColorClass: { type: Function, default: null }
    },
    emits: ['refresh', 'event-click'],
    setup(props) {
        const search = useSearch({
            formatValue: null,
            syncWithUrl: false,
            navigationRegistry: NavigationRegistry
        });
        return { search };
    },
    data() {
        return {
            stickyActive: false,
            stickyTop: 0,
            stickyLeft: 0,
            stickyWidth: 0,
            stickyHeight: 0,
            hoveredKey: null
        };
    },
    computed: {
        dayNames() {
            const base = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            if (this.weekStart === 'saturday') {
                return [...base.slice(6), ...base.slice(0, 6)];
            }
            return base;
        },
        weekStartDayIndex() {
            // 0=Sunday, 6=Saturday
            return this.weekStart === 'saturday' ? 6 : 0;
        },
        firstRowColumns() {
            return (this.columns || []).filter(c => c.firstRow);
        },
        secondRowColumns() {
            return (this.columns || []).filter(c => c.secondRow);
        },
        parsedEvents() {
            if (!this.data || this.data.length === 0) return [];
            return this.data
                .map((row, idx) => {
                    const defaultYear = this.yearColumn ? (row[this.yearColumn] || null) : null;
                    const start = parseDate(row[this.eventStartColumn], true, defaultYear);
                    const end = parseDate(row[this.eventEndColumn], true, defaultYear) || start;
                    if (!start) return null;
                    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
                    const e = end
                        ? new Date(end.getFullYear(), end.getMonth(), end.getDate())
                        : new Date(s);
                    return { row, chipKey: idx, start: s, end: e < s ? s : e };
                })
                .filter(Boolean);
        },
        calendarWeeks() {
            if (this.parsedEvents.length === 0) return [];

            const wsd = this.weekStartDayIndex;

            let minDate = this.parsedEvents[0].start;
            let maxDate = this.parsedEvents[0].end;
            this.parsedEvents.forEach(e => {
                if (e.start < minDate) minDate = e.start;
                if (e.end > maxDate) maxDate = e.end;
            });

            const firstDay = this._getWeekStart(minDate, wsd);
            const lastDay = this._getWeekEnd(maxDate, wsd);

            const weeks = [];
            let current = new Date(firstDay);

            while (current <= lastDay) {
                const weekDays = [];
                for (let d = 0; d < 7; d++) {
                    weekDays.push(new Date(current));
                    current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
                }

                const weekStart = weekDays[0];
                const weekEnd = weekDays[6];

                // Build segments for events that overlap this week
                const segments = [];
                for (const event of this.parsedEvents) {
                    if (event.end < weekStart || event.start > weekEnd) continue;

                    const segStartDate = event.start < weekStart ? weekStart : event.start;
                    const segEndDate = event.end > weekEnd ? weekEnd : event.end;

                    const startIdx = weekDays.findIndex(d => this._sameDay(d, segStartDate));
                    const endIdx = weekDays.findIndex(d => this._sameDay(d, segEndDate));

                    segments.push({
                        row: event.row,
                        chipKey: event.chipKey,
                        startIdx: startIdx >= 0 ? startIdx : 0,
                        endIdx: endIdx >= 0 ? endIdx : 6,
                        isStart: this._sameDay(event.start, segStartDate),
                        isEnd: this._sameDay(event.end, segEndDate)
                    });
                }

                // Sort by start day, longest first within same start
                segments.sort((a, b) => {
                    if (a.startIdx !== b.startIdx) return a.startIdx - b.startIdx;
                    return (b.endIdx - b.startIdx) - (a.endIdx - a.startIdx);
                });

                // Greedy lane assignment (first-fit interval scheduling)
                const lanes = [];
                for (const seg of segments) {
                    let placed = false;
                    for (const lane of lanes) {
                        const overlaps = lane.some(
                            s => !(s.endIdx < seg.startIdx || s.startIdx > seg.endIdx)
                        );
                        if (!overlaps) {
                            lane.push(seg);
                            placed = true;
                            break;
                        }
                    }
                    if (!placed) {
                        lanes.push([seg]);
                    }
                }

                let monthBoundaryIdx = -1;
                if (weeks.length > 0) {
                    const prevLastDay = weeks[weeks.length - 1].weekDays[6];
                    if (weekDays[0].getMonth() !== prevLastDay.getMonth()) {
                        monthBoundaryIdx = 0;
                    } else {
                        for (let i = 1; i < 7; i++) {
                            if (weekDays[i].getMonth() !== weekDays[i - 1].getMonth()) {
                                monthBoundaryIdx = i;
                                break;
                            }
                        }
                    }
                }
                weeks.push({ weekDays, lanes, isMonthBoundary: monthBoundaryIdx >= 0, monthBoundaryIdx });
            }

            weeks.forEach((week, i) => {
                const prev = weeks[i - 1];
                week.monthAfterBoundaryIdx = (prev && prev.isMonthBoundary && prev.monthBoundaryIdx > 0) ? prev.monthBoundaryIdx : -1;
            });
            const maxLanes = weeks.length > 0 ? Math.max(1, ...weeks.map(w => w.lanes.length)) : 0;
            return weeks.map(w => ({ ...w, paddingLanes: maxLanes - w.lanes.length }));
        },
        isEmpty() {
            return !this.isLoading && !this.isAnalyzing && (!this.data || this.data.length === 0);
        }
    },
    mounted() {
        if (this.parentSearchValue) {
            this.search.searchValue.value = this.parentSearchValue;
        }
        this._stickyHeader = useStickyHeader({
            getStickyEl: () => this.$el?.querySelector('.calendar-sticky-top'),
            getSpacerEl: () => this.$el?.querySelector('.calendar-sticky-spacer'),
            getContainerEl: () => [
                this.$el,
                this.$el?.closest('.container'),
            ].filter(Boolean),
            getIsActive: () => this.stickyActive,
            onActivate: (navBottom) => {
                const stickyEl = this.$el?.querySelector('.calendar-sticky-top');
                const rect = this.$el?.getBoundingClientRect();
                this.stickyHeight = stickyEl ? stickyEl.offsetHeight : 0;
                this.stickyActive = true;
                this.stickyTop = navBottom;
                this.stickyLeft = rect ? rect.left : 0;
                this.stickyWidth = rect ? rect.width : 0;
            },
            onDeactivate: () => {
                this.stickyActive = false;
            },
        });
        this._stickyHeader.setup();
    },
    beforeUnmount() {
        this._stickyHeader?.teardown();
    },
    watch: {
        parentSearchValue(val) {
            if (val !== this.search.searchValue.value) {
                this.search.searchValue.value = val || '';
            }
        }
    },
    methods: {
        _getWeekStart(date, weekStartDay) {
            const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            let diff = d.getDay() - weekStartDay;
            if (diff < 0) diff += 7;
            d.setDate(d.getDate() - diff);
            return d;
        },
        _getWeekEnd(date, weekStartDay) {
            const start = this._getWeekStart(date, weekStartDay);
            return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
        },
        _sameDay(a, b) {
            return (
                a.getFullYear() === b.getFullYear() &&
                a.getMonth() === b.getMonth() &&
                a.getDate() === b.getDate()
            );
        },
        isToday(date) {
            return this._sameDay(date, new Date());
        },
        isFirstOfMonth(date) {
            return date.getDate() === 1;
        },
        showYear(day, wIdx, dayIdx) {
            return (wIdx === 0 && dayIdx === 0) || (day.getDate() === 1 && day.getMonth() === 0);
        },
        monthAbbr(date) {
            return date.toLocaleDateString('en-US', { month: 'short' });
        },
        chipGridColumn(seg) {
            return `${seg.startIdx + 1} / ${seg.endIdx + 2}`;
        },
        chipClasses(seg) {
            const cls = ['clickable'];
            if (!seg.isStart) cls.push('chip-continuation');
            if (!seg.isEnd) cls.push('chip-continues');
            if (seg.row && seg.row.AppData && seg.row.AppData._analyzing) cls.push('analyzing');
            const colorCls = this.chipColorClass ? this.chipColorClass(seg.row) : '';
            cls.push(colorCls || 'blue');
            if (this.hoveredKey !== null && this.hoveredKey === seg.chipKey) cls.push('hovered');
            return cls;
        },
        chipTitle(row) {
            return [...this.firstRowColumns, ...this.secondRowColumns]
                .map(col => row[col.key])
                .filter(Boolean)
                .join(' — ');
        },
        handleEventClick(row) {
            this.$emit('event-click', row);
        },
        handleKeyDown(event, row) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.handleEventClick(row);
            }
        },
        handleRefresh() {
            this.$emit('refresh');
        },
        getChipInlineCards(row, colKey) {
            if (!this.chipActions) return [];
            try {
                return (this.chipActions(row) || []).filter(c => c.colKey === colKey);
            } catch (e) {
                return [];
            }
        },
        getChipEndCards(row) {
            if (!this.chipActions) return [];
            try {
                return (this.chipActions(row) || []).filter(c => !c.colKey);
            } catch (e) {
                return [];
            }
        }
    },
    template: html`
        <div class="calendar-container">

            <!-- Error Banner -->
            <div v-if="error" class="content-header red">
                <span>Error: {{ error }}</span>
            </div>

            <!-- Spacer: prevents layout jump when header becomes fixed -->
            <div class="calendar-sticky-spacer" :style="{ height: stickyActive ? stickyHeight + 'px' : '0' }" aria-hidden="true"></div>

            <!-- Sticky: filter header + day-of-week row -->
            <div class="calendar-sticky-top" :style="stickyActive ? { position: 'fixed', top: stickyTop + 'px', left: stickyLeft + 'px', width: stickyWidth + 'px', zIndex: '500' } : {}">
                <div class="content-header">
                    <slot name="header-area"></slot>
                    <div class="spacer"></div>
                    <div class="button-bar">
                        <div class="input-container">
                            <input
                                type="text"
                                v-model="search.searchValue.value"
                                @blur="search.handleBlur"
                                @keydown.esc="search.clearSearch"
                                placeholder="Find..."
                                class="search-input"
                            />
                            <button
                                v-if="search.searchValue.value"
                                @mousedown="search.clearSearch"
                                class="column-button"
                                title="Clear search"
                            >🗙</button>
                        </div>
                        <button
                            v-if="showRefresh"
                            @click="handleRefresh"
                            :disabled="isLoading"
                        >{{ isLoading ? 'Loading...' : 'Refresh' }}</button>
                    </div>
                    <LoadingBarComponent
                        :is-loading="isLoading"
                        :is-analyzing="isAnalyzing"
                        :percent-complete="loadingProgress"
                        class="embedded"
                    />
                </div>
                <div v-if="calendarWeeks.length > 0" class="calendar-dow-header">
                    <div v-for="name in dayNames" :key="name" class="calendar-dow-cell">{{ name }}</div>
                </div>
            </div>

            <!-- Weeks -->
            <div class="calendar-weeks-container">
                <div
                    v-for="(week, wIdx) in calendarWeeks"
                    :key="week.weekDays[0].toISOString()"
                    :class="['calendar-week', { 'month-boundary': week.isMonthBoundary, 'month-after-boundary': week.monthAfterBoundaryIdx > 0 }]"
                >
                    <!-- Date number row -->
                    <div class="calendar-date-row">
                        <div
                            v-for="(day, dayIdx) in week.weekDays"
                            :key="day.toISOString()"
                            :class="{ 'calendar-date-cell': true, 'month-old': (week.isMonthBoundary && dayIdx < week.monthBoundaryIdx) || (week.monthAfterBoundaryIdx > 0 && dayIdx >= week.monthAfterBoundaryIdx), 'month-new': (week.isMonthBoundary && dayIdx >= week.monthBoundaryIdx) || (week.monthAfterBoundaryIdx > 0 && dayIdx < week.monthAfterBoundaryIdx), 'month-last-old': week.isMonthBoundary && week.monthBoundaryIdx > 0 && dayIdx === week.monthBoundaryIdx - 1 }"
                        >
                            <span :class="['calendar-date-number', { today: isToday(day) }]">{{ day.getDate() }}</span>
                            <span v-if="isFirstOfMonth(day) || (wIdx === 0 && dayIdx === 0)" class="calendar-month-label">{{ monthAbbr(day) }}</span>
                            <span v-if="showYear(day, wIdx, dayIdx)" class="calendar-year-label">{{ day.getFullYear() }}</span>
                        </div>
                    </div>

                    <!-- Event lanes -->
                    <div
                        v-for="(lane, laneIdx) in week.lanes"
                        :key="laneIdx"
                        class="calendar-lane-row"
                    >
                        <div v-for="n in 7" :key="'bg' + n" :class="{ 'calendar-grid-bg-cell': true, 'month-last-old': week.isMonthBoundary && week.monthBoundaryIdx > 0 && (n - 1) === week.monthBoundaryIdx - 1, 'cal-bg-last': n === 7 }" :style="{ gridColumn: n, gridRow: '1' }" aria-hidden="true"></div>
                        <div
                            v-for="seg in lane"
                            :key="seg.row[eventStartColumn] + '-' + seg.row[eventEndColumn] + '-' + seg.startIdx"
                            :class="['calendar-chip', ...chipClasses(seg)]"
                            :style="{ gridColumn: chipGridColumn(seg), gridRow: '1' }"
                            :title="chipTitle(seg.row)"
                            tabindex="0"
                            @mouseenter="hoveredKey = seg.chipKey"
                            @mouseleave="hoveredKey = null"
                            @click="handleEventClick(seg.row)"
                            @keydown="handleKeyDown($event, seg.row)"
                        >
                            <div class="chip-text">
                                <span v-if="firstRowColumns.length > 0" class="chip-first-row">
                                    <template v-for="(col, colIdx) in firstRowColumns" :key="col.key">
                                        <span v-if="colIdx > 0" class="chip-sep"> | </span>
                                        <span class="chip-val" v-html="search.highlightRawText(seg.row[col.key] != null && seg.row[col.key] !== '' ? String(seg.row[col.key]) : '')"></span>
                                        <span v-for="card in getChipInlineCards(seg.row, col.key)" :key="card.message" :class="['card', card.color || card.class, { 'clickable': card.action && !card.disabled }]" :title="card.title || null" @click.stop="card.action && !card.disabled ? card.action() : null" v-html="card.message"></span>
                                    </template>
                                </span>
                                <span v-if="secondRowColumns.length > 0" class="chip-second-row">
                                    <template v-for="(col, colIdx) in secondRowColumns" :key="col.key">
                                        <span v-if="colIdx > 0" class="chip-sep"> | </span>
                                        <span class="chip-val" v-html="search.highlightRawText(seg.row[col.key] != null && seg.row[col.key] !== '' ? String(seg.row[col.key]) : '')"></span>
                                        <span v-for="card in getChipInlineCards(seg.row, col.key)" :key="card.message" :class="['card', card.color || card.class, { 'clickable': card.action && !card.disabled }]" :title="card.title || null" @click.stop="card.action && !card.disabled ? card.action() : null" v-html="card.message"></span>
                                    </template>
                                </span>
                            </div>
                            <div v-if="seg.isEnd && chipActions" class="chip-actions hide-when-narrow">
                                <button
                                    v-for="card in getChipEndCards(seg.row)"
                                    :key="card.message"
                                    :class="['card', card.color || card.class, { 'clickable': card.action && !card.disabled }]"
                                    :title="card.title || null"
                                    @click.stop="card.action && !card.disabled ? card.action() : null"
                                    v-html="card.message"
                                ></button>
                            </div>
                        </div>
                    </div>

                    <!-- Padding lanes to equalize week heights -->
                    <div
                        v-for="p in week.paddingLanes"
                        :key="'pad-' + p"
                        class="calendar-lane-row calendar-lane-padding"
                        aria-hidden="true"
                    >
                        <div v-for="n in 7" :key="'bgp' + n" :class="{ 'calendar-grid-bg-cell': true, 'month-last-old': week.isMonthBoundary && week.monthBoundaryIdx > 0 && (n - 1) === week.monthBoundaryIdx - 1, 'cal-bg-last': n === 7 }" :style="{ gridColumn: n, gridRow: '1' }" aria-hidden="true"></div>
                    </div>
                </div>
            </div>

            <!-- Loading/empty states -->
            <div v-if="isLoading && (!data || data.length === 0)" class="loading-message">
                <img src="assets/loading.gif" alt="Loading..." />
                <p>{{ loadingMessage || 'Loading...' }}</p>
            </div>
            <p v-else-if="isEmpty" class="empty-message">{{ emptyMessage }}</p>
        </div>
    `
};
