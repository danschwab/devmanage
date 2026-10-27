# Views System & Unified Renderers: Refactor Plan

**Status:** proposal for review · **Branch:** `views-system` · **Date:** 2026-10-26

Refactor `TableComponent`, `CalendarComponent` and `CardsComponent` into interchangeable **renderers** of the same row data, driven by a **data-only views system**. The system has to ship with no feature loss. It also has to leave room for each renderer to reach parity later in three areas: what data is visible, how it adapts to small and large containers, and how cell content is composed.

Related notes: [notes.md](notes.md) (TODO items L79–82, L126, L131–135, L138–139), [calendar-view-feature.md](calendar-view-feature.md), [item-grouping-implementation.md](item-grouping-implementation.md), [memory-optimization-analysis.md](memory-optimization-analysis.md).

---

## Contents

1. [Goals, non-goals, ship criteria](#1-goals-non-goals-ship-criteria)
2. [Current state](#2-current-state)
3. [Target architecture](#3-target-architecture)
4. [Specification](#4-specification)
5. [Per-page migration](#5-per-page-migration)
6. [Phased delivery](#6-phased-delivery)
7. [Challenges](#7-challenges)
8. [Feature parity matrix](#8-feature-parity-matrix)
9. [No-feature-loss verification checklist](#9-no-feature-loss-verification-checklist)
10. [Open questions and unresolved problems](#10-open-questions-and-unresolved-problems)

---

## 1. Goals, non-goals, ship criteria

### Goals

- **One data contract for every renderer.** Each renderer takes `rows` plus `fields` plus a resolved view. Calendar and cards stop being special cases with their own data shapes.
- **Views are plain data.** A view is a serializable object that says which layout to use, which fields are visible and where, and how the layout adapts when narrow. Views can be defined in code now and stored per user later.
- **Renderers stay presentational.** All view logic lives in pure functions that are unit-tested in [tests.js](../js/tests/tests.js). `TableComponent` (5,087 lines) does not learn about views.
- **Parity can grow per renderer over time.** Data visibility (shown / details / hidden), small/large adaptation (narrow variants), and modularity (stacks, cell components, decorations) are each one shared concept that every renderer interprets.

### Non-goals (for this refactor)

- Filters and row selection inside views. Saved searches stay the mechanism for choosing rows, and views only control presentation. The URL carries both, so a dashboard card is a saved search plus a view.
- Layout switching for editing tables (`InventoryTable`, `PacklistTable`). They get views for column visibility and print only.
- A drag-and-drop column editor, team-shared views, or user-created layouts. These are deferred to Phase 5 and the open questions.
- Replacing the CSS container-query styling. CSS keeps handling purely visual responsiveness.

### Ship criteria

- **No feature loss.** Everything in the [feature inventory](#22-renderer-feature-inventory) and the [verification checklist](#9-no-feature-loss-verification-checklist) still works on every page that has it today.
- **Old links keep working.** Existing URLs, bookmarks and dashboard card paths (`?layout=calendar`, `?view=categories`) resolve to the equivalent view.
- **Visual shifts are allowed if they help.** The intended ones are listed in [§6.7](#67-intended-visual-shifts).
- **Each phase ships on its own.** No phase leaves a page half-migrated.

---

## 2. Current state

### 2.1 Renderers

|                  | `TableComponent` ([tableComponent.js](../js/application/components/interface/tableComponent.js))                                                                                                                       | `CalendarComponent` ([calendarComponent.js](../js/application/components/interface/calendarComponent.js)) | `CardsComponent` ([cardsComponent.js](../js/application/components/interface/cardsComponent.js))                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Size             | 5,087 lines, including about 1,360 lines of shared selection/drag/clipboard state (`tableRowSelectionState`)                                                                                                           | 492 lines                                                                                                 | 617 lines                                                                                                                                                                                                         |
| Data input       | `data`, `originalData`, `columns`                                                                                                                                                                                      | `data`, `columns`                                                                                         | `items: [{ id, title, content, contentFooter, footerActions, cardClass, hiddenSearchData, AppData }]`                                                                                                             |
| Props            | 39 (see 2.2)                                                                                                                                                                                                           | 25                                                                                                        | 23                                                                                                                                                                                                                |
| Emits            | `refresh`, `cell-edit`, `new-row`, `on-save`, `inner-table-dirty`, `row-move`, `row-options`                                                                                                                           | `refresh`, `event-click`                                                                                  | `refresh`, `toggle-pin`                                                                                                                                                                                           |
| Slots            | default (non-editable cell), `header-area`, `cell-extra`, `details-cell`, `row-details`, `row-detail-rows`, `selection-actions`                                                                                        | `header-area`                                                                                             | default (wraps everything), `header-area`                                                                                                                                                                         |
| Field flags read | `key label labelHtml title width font format editable sortable autoColor type cellClass columnClass allowHide details stackUnder sticky colspan`                                                                       | `key firstRow secondRow` (plus `colKey` on action cards)                                                  | none                                                                                                                                                                                                              |
| Search           | `useSearch`. Filters or navigates over `columns` not in `hideSet`. Details-only matches light up the details button (`hasDetailsSearchMatch`, [L4552](../js/application/components/interface/tableComponent.js#L4552)) | `useSearch`. Highlight only, never hides                                                                  | Its own filter over `title/content/contentFooter`, then `hiddenSearchData`. Shows the matched hidden fields when the term is over 3 chars ([L180](../js/application/components/interface/cardsComponent.js#L180)) |
| Sticky header    | `useStickyHeader`, plus a cloned `<thead>` with manual `translateX` fixes                                                                                                                                              | `useStickyHeader`                                                                                         | `useStickyHeader`                                                                                                                                                                                                 |
| Value formatting | `formatCellValue` ([L2892](../js/application/components/interface/tableComponent.js#L2892)): date, currency, number                                                                                                    | none. Chips show raw values                                                                               | none. Consumers preformat HTML strings                                                                                                                                                                            |

### 2.2 Renderer feature inventory

This list defines "no feature loss." Every item maps to a row in §9.

**Table**

- Header: `header-area` slot, search box with hide-rows toggle and match navigation, New Item, Save, Refresh/Discard, Undo/Redo, view toggle, loading/analysis bar.
- Sticky header clone with column-width mirroring and horizontal-scroll sync.
- Sticky columns (`sticky: 'start'|'end'`), with offsets computed from measured widths ([L2426–2471](../js/application/components/interface/tableComponent.js#L2426)).
- Stacked columns (`stackUnder`), with a two-row `<thead>` and `rowspan` ([L2159](../js/application/components/interface/tableComponent.js#L2159), [L4712](../js/application/components/interface/tableComponent.js#L4712)).
- `colspan` column clipping (`mainTableColumns`, [L2125](../js/application/components/interface/tableComponent.js#L2125)). Used by PacklistTable's nested item table.
- Hiding: the `hideColumns` prop, ad-hoc per-column hide via `handleHideColumn` ([L2885](../js/application/components/interface/tableComponent.js#L2885), reset on refresh), and always-hidden `AppData`, `EditHistory`, `MetaData`.
- Details: `allowDetails`, `forceDetails`, `rowDetailsVisible`; auto details grid from `details: true` fields; `row-details` and `row-detail-rows` slots; `details-cell` slot.
- Sorting: per-column `sortable`, table-wide `sortable`, `defaultSortColumn/Direction`, item-like comparison for `type: 'item'`.
- Editing: contenteditable text cells, number inputs, `external-edit` format, revert-to-original, original-value hints, dirty tracking, undo/redo snapshots with 5 s idle, "unsaved changes" footer.
- Rows: new row (`newRow`, `showNewRowButton`, footer click), drag handle, drag/drop between tables (`dragId`, `dragLabel`, `allowDropOnto`), multi-select and shift-select, selection bubble with actions slot, delete/restore, cut/copy/paste including OS clipboard TSV, row groups (`hideGroupMembers`, `groupVisibilityOverride`, group master toggles), nested inner tables (`inner-table-dirty`, `parentSearchValue`).
- States: error banner, analyzing row class, marked-for-deletion class, row metadata classes, empty-drop-target row, footer ("Showing x of y", Show all).
- Mobile: `theadActive` tap-to-show column buttons.

**Calendar**

- Week rows with month labels, `weekStart`, `yearColumn`, sticky day-of-week header, today highlight.
- Event chips spanning start→end that split at week boundaries, with `firstRow` (bold) and `secondRow` lines.
- `chipColorClass(row)`, `chipActions(row)` → inline cards (by `colKey`) and end-of-chip cards (`hide-when-narrow`).
- `event-click` (the parent opens the detail modal), `analyzing` chip state, keyboard Enter/Space, search highlight, header-area slot, refresh, view toggle, loading bar, error, empty message.
- Narrow CSS: grid compression and chip font size (`@container container-component (width < 600px)`).

**Cards**

- Header: header-area slot, search box with navigate mode (`hideCardsOnSearch=false`) or filter mode, sort select (`showSort`, `sortColumns`, default sort), refresh, view toggle, loading bar.
- Card: title (highlighted), pin button (`showPinButtons`, `pinnedItems`, `toggle-pin`), `content` and `contentFooter` HTML (highlighted), `footerActions` buttons, `cardClass` colour, analyzing state, keyboard access, `onItemClick`.
- Hidden-field deep search with a matched-fields display, the "Showing x of y cards / Show all" card, and empty/loading states.
- Narrow CSS: cards stack full width.

### 2.3 Consumers

There are 17 renderer instances on 12 pages.

| Page component                                                                                                                                                                                                                                                        | Renderer(s)                              | Notable usage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ScheduleTable.js](../js/application/components/content/ScheduleTable.js) (inside [ScheduleContent.js](../js/application/components/content/ScheduleContent.js))                                                                                                      | table ↔ calendar                         | Columns built from sheet headers ([L67](../js/application/components/content/ScheduleTable.js#L67)) with `details`, `stackUnder`, `whenSmall`, `firstRow/secondRow`. `#row-details`. `#cell-extra` renders ship-date, transship, packlist and index-issue cards ([L877](../js/application/components/content/ScheduleTable.js#L877)). `chipActionsProvider` rebuilds packlist and index cards for the calendar ([L190](../js/application/components/content/ScheduleTable.js#L190)). `handleCalendarEventClick` defines an inline detail-modal component ([L676](../js/application/components/content/ScheduleTable.js#L676)). Layout comes from `ScheduleContent.isCalendarView` via the `calendarView` prop. |
| [InventoryItemTimeline.js](../js/application/components/content/InventoryItemTimeline.js)                                                                                                                                                                             | table ↔ calendar                         | Derived `calendarStart/calendarEnd` built from the next row's date (`calendarData`). `chipColorClass` from autoColor of quantity. Header-area date filter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [InventoryItemReport.js](../js/application/components/content/InventoryItemReport.js)                                                                                                                                                                                 | table ↔ calendar                         | Separate `calendarColumns` and `calendarData`. Table uses `hide-columns`, `hide-group-members`, and a `#default` cell slot for `image`, `itemId`, `minQty`, `overlappingShows`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [InventoryContent.js](../js/application/components/content/InventoryContent.js) + [InventoryOverviewTable.js](../js/application/components/content/InventoryOverviewTable.js)                                                                                         | cards ↔ table (`?view=categories`)       | Category cards come from `categoriesStore` (tab list), with `_hiddenSearchData` analysis ([L181](../js/application/components/content/InventoryContent.js#L181), [L277](../js/application/components/content/InventoryContent.js#L277)) plus autosave/lock state, footer Save action and cardClass. The overview table is `getAllInventoryData` with `details` fields, sticky `image`, a `#default` cell for `tab` (purple button) and `image`, and `#details-cell` for timeline navigation.                                                                                                                                                                                                                   |
| [PacklistContent.js](../js/application/components/content/PacklistContent.js)                                                                                                                                                                                         | cards                                    | `formatPacklistCard` ([L741](../js/application/components/content/PacklistContent.js#L741)): ship date or description HTML, lock/unsaved footer, link-to-schedule and index-issue actions, pins, pinned-only and unlinked-only subpages, sort by ship date.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [ReportsContent.js](../js/application/components/content/ReportsContent.js)                                                                                                                                                                                           | cards                                    | Static menu of three items. Not row data.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [InventoryTable.js](../js/application/components/content/InventoryTable.js)                                                                                                                                                                                           | table (editing)                          | Editable, new row, locks, `forceDetails`, `rowDetailsVisible`, `#row-detail-rows`, `#default` for `image` and `_navigate`. `handleCellEdit` maps `colIdx` through its own `this.columns` (see challenge C1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [PacklistTable.js](../js/application/components/content/PacklistTable.js)                                                                                                                                                                                             | table ×3 (crates, nested items, summary) | Draggable crates with nested item tables rendered through the default slot. `colspan` item headers. Hard-coded `hiddenColumns` ([L154](../js/application/components/content/PacklistTable.js#L154)) temporarily changed by `handlePrint` ([L1294](../js/application/components/content/PacklistTable.js#L1294)). Inner `@cell-edit` maps `itemHeaders[itemColIdx]`.                                                                                                                                                                                                                                                                                                                                            |
| [PacklistItemsSummary.js](../js/application/components/content/PacklistItemsSummary.js), [ShowInventoryReport.js](../js/application/components/content/ShowInventoryReport.js), [IndexMismatchReport.js](../js/application/components/content/IndexMismatchReport.js) | table (read-only)                        | `#default` cell slots. Dynamic `show_*` fields (ShowInventoryReport). Fallback cells reimplemented per page, sometimes without search highlighting.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### 2.4 Existing view-like mechanisms

| Mechanism                                 | Where                                                                                                                                         | Limitation                                                                                                                                                                                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ViewChangeComponent`                     | [navigationComponents.js:603](../js/application/components/interface/navigationComponents.js#L603)                                            | Cycles through values of one URL parameter. Shows an icon only, with no names. On the dashboard it calls `dashboardRegistry.updatePath` instead of navigating.                                                                                                        |
| `?layout=calendar`                        | Schedule, Timeline, ItemReport                                                                                                                | Each page reads it separately (`isCalendarView`).                                                                                                                                                                                                                     |
| `?view=categories`                        | Inventory                                                                                                                                     | Uses the name `view`, which collides with the schedule filter's `?view=all` (show-all, [filterComponents.js](../js/application/components/interface/filterComponents.js)).                                                                                            |
| `hideColumns`, `hiddenColumns`, `details` | Table                                                                                                                                         | Fixed per page in code. Ad-hoc hides are lost on refresh.                                                                                                                                                                                                             |
| `firstRow/secondRow`                      | Calendar                                                                                                                                      | Calendar-only flags placed on the shared column objects.                                                                                                                                                                                                              |
| `whenSmall`                               | ScheduleTable                                                                                                                                 | **Dead config.** Added in 8c03261 (a `ResizeObserver` on the table root at 640px, merging `whenSmall` into `resolvedColumns`) and removed the same day in aff6f47 ("fixing overscroll"). Nothing reads it now.                                                        |
| Narrow CSS                                | [styles.css](../css/styles.css)                                                                                                               | Container queries at 600px on `.container` and `.modal > .content`, a media query at 800px, a `matchMedia('(max-width: 768px)')` in [useStickyHeader.js:174](../js/application/utils/useStickyHeader.js#L174), and the nav `isMobileView` at 800px. Four breakpoints. |
| Print                                     | PacklistTable                                                                                                                                 | Imperative toggle of `hiddenColumns`, restored after 100 ms.                                                                                                                                                                                                          |
| Saved searches                            | `getUserData/storeUserData` via `getReactiveStore` ([filterComponents.js:97](../js/application/components/interface/filterComponents.js#L97)) | Already a working per-user persistence pattern to copy.                                                                                                                                                                                                               |
| Dashboard                                 | `DashboardRegistry` stores full paths with parameters                                                                                         | Any view held in the URL can be pinned without extra work.                                                                                                                                                                                                            |

### 2.5 Defects found during the survey

Fix these in Phase 0. Several would otherwise turn into migration bugs.

- **D1:** Inventory categories pass `:analysis-progress` to `CardsComponent`, but the prop is `loadingProgress`, so the progress bar never moves ([InventoryContent.js:396](../js/application/components/content/InventoryContent.js#L396)).
- **D2:** `readonly` (IndexMismatch, ItemReport, ItemsSummary, ShowInventory, Timeline) and `external-dirty-state` (InventoryTable) are not `TableComponent` props. They fall through to the root DOM element and do nothing.
- **D3:** `whenSmall` is dead config (see 2.4).
- **D4:** The `cell-edit` contract is index-based. The table emits the `mainTableColumns` index, but `InventoryTable.handleCellEdit` resolves it through its own unfiltered `this.columns[colIdx]` ([InventoryTable.js:1084](../js/application/components/content/InventoryTable.js#L1084)). This is only correct while no `details`, `stackUnder` or `colspan` field comes before an editable field. `dirtyCells` is keyed by the same index (`[rowIndex][colIndex]`).
- **D5:** The Schedule builds its action cards two ways: the `#cell-extra` template for the table and `chipActionsProvider` for the calendar. Ship-date and transship cards never appear on calendar chips.
- **D6:** Custom `#default` cell slots replace the renderer's fallback for every non-editable field. Each page reimplements the fallback, and some (for example `IndexMismatchReport`) drop search highlighting.
- **D7:** The inventory data is loaded twice: `getAllInventoryData` for the overview, and `getInventoryHiddenSearchData` once per tab ([api.js:337](../js/data_management/api.js#L337)), which fetches each full tab only to build search strings.

---

## 3. Target architecture

```
 Page component (owns data + domain logic; unchanged responsibilities)
 ├─ rows        ← reactive store data (+ derived fields, computed once)
 ├─ fields      ← field definitions: what each key IS (label, format, type, sortable, editable, cell…)
 ├─ views       ← view definitions: how to SHOW the rows (data only)
 └─ hooks       ← decorations(row, key), groupDecorations(key, rows), onRowClick(row)
        │
        ▼
 <DataView>  (new, thin)
 ├─ currentViewId  ← URL ?display=… (legacy params mapped) → default
 ├─ narrow         ← useNarrow()  (nearest container-component, one breakpoint)
 ├─ resolved       ← resolveView(fields, view, { narrow, print })   ← pure, tested
 ├─ renderer pick  ← layout: 'table' | 'calendar' | 'cards'
 ├─ slot forwarding (#cell, #header-area, table-only slots)
 └─ attrs forwarding (renderer-specific props like draggable)
        │
        ▼
 Renderers (presentational)
 ├─ TableComponent     ← resolved fields → existing column-flag format
 ├─ CalendarComponent  ← resolved fields + calendar options
 └─ CardsComponent     ← items produced by rowsToCards / groupRowsToCards (pure, tested)

 Shared building blocks (extracted, used by all three)
 ContentHeaderComponent · ViewSelectComponent · RowDetailsComponent
 formatValue() · matchRow() · cell registry · decoration cards · useNarrow() · BREAKPOINTS
```

**Separation of concerns:**

- A **field** says what the data is. It is owned by the page and identical across views.
- A **view** says where each field appears. It is data and can be persisted.
- `resolveView` is the only place the two meet.
- Placement flags that live on columns today (`details`, `stackUnder`, `sticky`, `firstRow`, `secondRow`, `whenSmall`) move into views. `resolveView` writes them back onto the resolved column objects, so in Phase 1 the renderers keep reading the flags they already understand.

**Files**

| File                                                                 | Purpose                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `docs/js/application/utils/views/resolveView.js`                     | `resolveView`, `normalizeSlot`, key-pattern matching, variant merge                  |
| `docs/js/application/utils/views/cardsAdapter.js`                    | `rowsToCards`, `groupRowsToCards`                                                    |
| `docs/js/application/utils/views/fieldFormat.js`                     | `formatValue` (moved from `TableComponent.formatCellValue`) and the autoColor lookup |
| `docs/js/application/utils/views/searchMatch.js`                     | `matchRow` (generalizes `useSearch.matchesRow` plus the cards hidden-field logic)    |
| `docs/js/application/utils/useNarrow.js`                             | `useNarrow()` composable and the `BREAKPOINTS` constant                              |
| `docs/js/application/components/interface/dataViewComponent.js`      | `DataView` wrapper                                                                   |
| `docs/js/application/components/interface/contentHeaderComponent.js` | Shared header (extracted from all three renderers)                                   |
| `docs/js/application/components/interface/rowDetailsComponent.js`    | Shared key/value details grid (table expand and calendar/cards modal)                |
| `docs/js/application/components/interface/cells.js`                  | Cell registry (`image`, `itemId`, `navigate`, …)                                     |

View definitions live as a `const` at the top of each page component, as `viewModes` does today. Move them to a separate file only when two pages share them.

---

## 4. Specification

### 4.1 Field definition (page-owned)

```js
/**
 * @typedef {Object} FieldDef
 * @property {string}  key
 * @property {string}  [label]
 * @property {string}  [labelHtml]     header HTML (e.g. icon)
 * @property {string}  [title]         header tooltip
 * @property {'date'|'currency'|'number'|'external-edit'|string} [format]
 * @property {string}  [type]          sort/compare semantics, e.g. 'item'
 * @property {boolean} [sortable]
 * @property {boolean} [editable]      table only; never inside a stack child (validated)
 * @property {boolean} [autoColor]
 * @property {number}  [width]
 * @property {string}  [font]          'narrow' …
 * @property {string|Function} [cellClass]
 * @property {string}  [columnClass]
 * @property {boolean} [allowHide]
 * @property {number}  [colspan]       table only; PacklistTable nested item header
 * @property {string}  [cell]          'slot' → page #cell template; '<name>' → cell registry; absent → formatted text
 */
```

These are exactly the field-level properties consumers use today; the inventory in §2.1 is complete for the table. Placement properties are **not** part of a field: `details`, `stackUnder`, `sticky`, `firstRow`, `secondRow`, `whenSmall`. During migration, `resolveView` tolerates them on fields with a console warning so pages can move one at a time.

### 4.2 View definition (data only)

```js
/**
 * @typedef {string|string[]} Line      one key, or keys shown inline on one line (joined " | " in chips)
 * @typedef {string|Line[]}   Slot      one key, or a stack of lines (top → bottom)
 *
 * @typedef {Object} ViewDef
 * @property {string}  id                 stable, URL-safe; used in ?display=
 * @property {string}  name               shown in the view menu
 * @property {string}  [icon]             material symbol for the toggle button
 * @property {'table'|'calendar'|'cards'} layout
 *
 * // Data visibility (all layouts)
 * @property {Slot[]}  [columns]          shown fields, in order. Table: one entry per column.
 *                                        Defaults to every field not in details/hidden.
 * @property {string[]|'rest'} [details='rest']   fields in expand row / detail modal; 'rest' = all not shown & not hidden
 * @property {string[]} [hidden]          never shown, never searched
 * @property {'details'|'hidden'} [unlisted='details']  where fields not mentioned anywhere go
 * @property {{key:string, dir:'asc'|'desc'}} [sort]   default sort (renderers' existing default-sort props)
 *
 * // Layout sections (each renderer reads only its own)
 * @property {{ sticky?: {start?:string[], end?:string[]}, hideRowsOnSearch?: boolean }} [table]
 * @property {{ start:string, end:string, weekStart?:'sunday'|'saturday', yearColumn?:string, chip:Line[] }} [calendar]
 * @property {{ groupBy?:string, card:Line[], footer?:Line[], hideOnSearch?:boolean }} [cards]
 *
 * // Variants: partial ViewDefs merged when a condition holds
 * @property {{ narrow?: Partial<ViewDef>, print?: Partial<ViewDef> }} [variants]
 */
```

**Key patterns.** Any key list accepts a trailing `*` (`'show_*'`), using the same rule as `matchesPagePattern` in [preferencesComponent.js](../js/application/components/interface/preferencesComponent.js). Needed for ShowInventoryReport's dynamic columns.

**Merge rule for variants.** Objects merge deeply, and arrays **replace**. When narrow and print both apply, they merge in that order (print wins).

**Validation** (dev console warnings, never throws):

- Unknown keys are ignored. Sheet headers change, so they can't be errors.
- A key appearing in more than one of `columns`, `details` and `hidden` is resolved by first wins, in that order.
- `editable` fields inside a stack child are rendered read-only and produce a warning.
- `calendar.start`/`end` must resolve to an existing field, otherwise the view falls back to the page default.

### 4.3 Page registration

```js
const SCHEDULE_VIEWS = {
  default: "table",
  legacy: { layout: { calendar: "calendar" } }, // ?layout=calendar → ?display=calendar
  views: [
    {
      id: "table",
      name: "Schedule",
      icon: "table",
      layout: "table",
      columns: [
        "Show",
        "Client",
        ["Ship", "Recieved"],
        ["S. Start", "S. End"],
        "City",
        "Size",
        "packlist",
      ],
      table: {},
      variants: {
        narrow: {
          columns: [
            ["Show", "Client"],
            ["Ship", "Recieved"],
            ["S. Start", "S. End"],
            "packlist",
          ],
        },
      },
    },
    {
      id: "calendar",
      name: "Calendar",
      icon: "calendar_month",
      layout: "calendar",
      calendar: {
        start: "S. Start",
        end: "S. End",
        weekStart: "sunday",
        yearColumn: "Year",
        chip: [
          ["Show", "Client"],
          ["City", "Size"],
        ],
      },
    },
  ],
};
```

The Phase 1 Schedule views must reproduce today's layout exactly. Today, `details` is every header except `Show, Client, Ship, City, Size, S. Start, S. End, Recieved`, which is `details: 'rest'` with those columns listed. The `narrow` variant restores what `whenSmall` was meant to do.

### 4.4 `resolveView(fields, view, { narrow, print })`

This is a pure function. It returns `{ layout, columns: ResolvedColumn[], details: FieldDef[], hidden: Set, calendar, cards, sort }`.

1. Merge variants (`narrow`, then `print`) into the view.
2. Expand key patterns against `fields`.
3. Assign each field to a tier: shown (in `columns`), details, or hidden. Unlisted fields go to `view.unlisted`.
4. Build `ResolvedColumn[]` in `columns` order. For a stack, the first key is the **parent**, and later lines are children. Phase 1 output is in the **legacy flag format**: children get `stackUnder: parentKey`, details fields get `details: true`, sticky fields get `sticky`, chip lines get `firstRow`/`secondRow`. Unchanged renderers keep working.
5. Phase 3 output adds `stack: Line[]` on the parent, and the table switches to it (see 4.8).
6. Always hide `AppData`, `EditHistory` and `MetaData`. They also stay in the table's `hideSet`.

**Index stability.** The table keeps hidden columns in `mainTableColumns` (it uses `v-show`), so indices stay stable when columns are hidden. View-driven reordering and stacking do change indices, which is why Phase 0 makes editing key-based (C1).

### 4.5 Visibility tiers and search semantics

| Tier    | Table                       | Calendar     | Cards                                          | Searched? | Match indicator                                                                                      |
| ------- | --------------------------- | ------------ | ---------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| shown   | column / stack line         | chip line    | card line                                      | yes       | highlight                                                                                            |
| details | expand row (`details` grid) | detail modal | detail modal (new), or the matched-fields list | yes       | table: details button glows (exists). Cards: matched-fields list (exists). Calendar: chip glow (new) |
| hidden  | not rendered                | not rendered | not rendered                                   | **no**    | n/a                                                                                                  |

`matchRow(row, { shown, details }, words)` returns `{ matched: boolean, shownMatch: boolean, detailMatches: [{ key, label, value }] }`. All three renderers use it:

- **Table:** replaces the filter at [L2206](../js/application/components/interface/tableComponent.js#L2206) and `hasDetailsSearchMatch`.
- **Cards:** replaces the `visibleCards` matching and `_matchedHiddenFields`.
- **Calendar:** marks chips whose only match is in details.
- `useSearch.matchesRow` becomes a thin wrapper around it.

**Behaviour change to accept:** a field a page hides today with `hideColumns` should be put in `hidden`, not left to fall into `details`. Otherwise it becomes searchable. The per-page migration (§5) lists each case.

### 4.6 Cards adapter

```js
rowsToCards(rows, resolved, { decorations, rowKey });
// one card per row
// → [{ id, title, content, contentFooter, footerActions, cardClass, searchFields, AppData, row }]

groupRowsToCards(rows, resolved, { groupBy, groupKeys, groupDecorations });
// one card per distinct row[groupBy]; groupKeys seeds the list so empty groups still appear
// → same item shape; searchFields = member rows' shown+details values (replaces hiddenSearchData)
```

- **Mapping:** `cards.card[0]` → `title`, remaining `card` lines → `content`, `cards.footer` lines → `contentFooter`.
- **Escaping:** lines are formatted with `formatValue` and HTML-escaped. HTML only comes from cell renderers or decorations, never from raw data. Today consumers build HTML strings by hand.
- **Decorations** come from page hooks (§4.9). They supply `footerActions`, `cardClass` and status text such as "Locked for edit by" or "Unsaved changes".
- **Items mode stays.** `CardsComponent` keeps accepting hand-built `items` for real menus (Reports). The adapter produces the same shape, so the renderer needs only a small change: use `searchFields` for matching (via `matchRow`) instead of `hiddenSearchData`.

**Naming:** `groupBy` is the card grouping. It is unrelated to the table's packlist row groups (`hideGroupMembers`, `MetaData` groups). The docs and code comments must keep the two apart. See Q14.

### 4.7 Calendar mapping

- `calendar.start/end/weekStart/yearColumn` → the existing props `eventStartColumn`, `eventEndColumn`, `weekStart`, `yearColumn`.
- `calendar.chip` → `firstRow` (line 0) and `secondRow` (line 1) in Phase 1. Phase 3 replaces the two flags with `chipLines: Line[][]`, so chips can show any number of lines. Line 0 is bold, and each line is joined with `|` and truncated as today.
- Chip values go through `formatValue` (new; fixes raw dates and numbers on chips).
- **Derived fields** (Timeline's `calendarStart/calendarEnd`, ItemReport's date range) are computed by the page and added to **every** row, not just a calendar-only copy. The calendar view then names them like any other field, and the table can show them if a view asks. ItemReport's separate `calendarColumns` becomes a view.
- **Detail modal:** `CalendarComponent` still emits `event-click`, and `DataView` handles it by default. It opens `RowDetailsComponent` with `details` plus `shown` fields, followed by the row's decoration cards, which replaces Schedule's inline `DetailModalComponent`. Pages can override this with `onRowClick` (ItemReport navigates to the item page instead).

### 4.8 Stacks (N-high), sticky, and the table header

**Phase 1:** the legacy `stackUnder` output keeps today's two-row header.

**Phase 3:** a parent-owned stack.

- **Data:** the resolved parent column carries `stack: Line[]` (line 0 is itself). `stackedColumnMap`, `theadRow2Columns` and `rowspan` are removed.
- **Header:** one `<tr>`. A stacked `<th>` renders its labels as a vertical flex list. Each label is its own sort button, so stacks of 3 or more work. The sticky-header clone mirrors this, and because there is a single header row, `_stickyStartLeft`/`_stickyEndRight` and the clone width logic lose the second-row special cases.
- **Body:** line 0 renders through the normal cell path, including editing. Lines 1+ render through the read-only cell path (formatted, highlighted, `cell` registry or slot), as stacked children do today. Inline lines (`['City','Size']`) render in one row separated by `·`.
- **Sticky:** `view.table.sticky.start/end` lists **slot parents**. The resolver sets `sticky` on the parent's resolved column. Only `theadRow1Columns` (now simply the columns) take part in offset math, as today.
- **Mobile `theadActive`:** the tap-to-show column buttons attach to each label in the stack rather than to the `<th>`.

### 4.9 Modularity: cells, decorations, slots

There are three mechanisms, from most to least reusable:

1. **Cell registry** (`field.cell = '<name>'`). A component receives `{ row, field, value, renderer, density, search }`.
   - `density` is `'full'` for table cells and card content, and `'compact'` for chips and stacked children.
   - Initial registry, deduplicated from five pages: `image` (`ItemImageComponent` at 32px full, 20px compact or hidden), `itemId`, `navigate` (☷ button).
   - A cell that has nothing to show at `compact` density returns nothing, and the renderer falls back to formatted text.
2. **Page slot** (`field.cell = 'slot'`). The page's `#cell="{ row, field, renderer, density }"` template is called for that field only. Other fields keep the renderer's fallback, which fixes D6.
   - Table: `#cell` is tried first for `cell: 'slot'` fields. The legacy default slot keeps working until every page has migrated.
   - Calendar and cards only call `#cell` for fields that are on a chip or card line.
3. **Decorations** `decorations(row, key) → Card[]`, where `Card = { message, class, title, disabled, action }`. This is the one API behind today's `#cell-extra` card content and `chipActions`.
   - `key = null` means row-level decorations: end-of-chip, card footer actions, details modal button bar.
   - Table: rendered after the cell content (where `#cell-extra` sits). `#cell-extra` stays for markup that isn't a card (PacklistTable group toggles).
   - Calendar: inline on the chip line that contains `key`, or at the chip end for `null`. Hidden when narrow, as now.
   - Cards: row-level decorations become `footerActions`. Field-level ones render after the line.
   - Group cards use `groupDecorations(groupKey, rows)`. This is where Inventory's Save/autosave/lock state goes.

### 4.10 Narrow and small/large

```js
// utils/useNarrow.js
export const BREAKPOINTS = { narrowEnter: 600, narrowExit: 640 };   // container width, px
export function useNarrow(elRef) → Ref<boolean>
```

- **What it observes:** the nearest ancestor with `container-type: inline-size` (`.container`, `.modal > .content`), which is the same element the CSS container queries use. JS and CSS therefore always agree, and the observed width doesn't depend on the renderer's content. That is the likely cause of the aff6f47 rollback (C6).
- **Hysteresis:** narrow below 600, wide again above 640.
- **Initial value:** read synchronously in `mounted` before the first render that depends on it. Until it is known, `DataView` renders the wide variant.
- **What each tool handles:** structural changes (which fields, stacks, sticky) use `variants.narrow`. Purely visual changes (font size, hide-when-narrow, grid compression) stay in CSS.
- **Dashboard cards** are where narrow matters most (cards live in `.container`, which is narrow on the dashboard). Phase 1 verification covers dashboard cards explicitly.

### 4.11 URL, switcher, dashboard

- **Parameter:** `?display=<viewId>` on the container path. Absent means the page default. Unknown ids fall back to the default with a console warning (old dashboard paths, renamed views).
- **Legacy mapping:** in `DataView` only, read-side. `?layout=calendar` and `?view=categories` resolve to view ids. When the user switches views, the legacy parameter is removed (`buildPathWithCurrentParams` with `undefined`) and `display` is written. `?view=all` (schedule show-all) is a filter parameter and is left alone.
- **`ViewSelectComponent`** replaces `ViewChangeComponent`:
  - 2 views: the same icon toggle as today, showing the next view's icon and name as the tooltip.
  - 3 or more: a button with the current view's name that opens a menu.
  - It keeps the dashboard branch (`NavigationRegistry.dashboardRegistry.updatePath(cleanPath, newPath)` when on the dashboard).
  - Phase 5 adds a "Customize…" entry.
- **Ad-hoc column hide** (`handleHideColumn`) stays session-only and is reset on refresh, as today (Q9).

### 4.12 Print

`variants.print` is applied while `DataView` is in print mode. PacklistTable's `handlePrint` sets a reactive `printing` flag on its `DataView` instead of changing `hiddenColumns`, so the restore timeout is no longer needed. Printing in other renderers is out of scope.

### 4.13 Shared header

`ContentHeaderComponent` is extracted from all three renderers:

- **Contents:** `header-area` slot, spacer, `SearchBoxComponent`, refresh/discard, `ViewSelectComponent`, `LoadingBarComponent`, and an `#actions` slot for renderer-specific buttons (table: New Item, Save, Undo/Redo; cards: sort select).
- **Sticky behaviour:** stays in each renderer, because the table must also clone `<thead>` inside the same fixed wrapper. The header component is only the content of the sticky wrapper.

---

## 5. Per-page migration

| Page                                                           | Phase | Views shipped                                                       | Specific work                                                                                                                                                                                                                                                                                                                                                                                      | Risk                                          |
| -------------------------------------------------------------- | ----- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| ScheduleTable                                                  | 1     | `table`, `calendar` (identical to today). Narrow variant in Phase 3 | Move placement flags out of the `columns()` computed into views. Merge `#cell-extra` cards and `chipActionsProvider` into `decorations(row, key)` (`getShipDateCards`, `getTransshipCards`, `getPacklistCards`, `getIndexIssueCards`). Delete the inline `DetailModalComponent` in favour of the default handler. Remove the `calendarView` prop and `ScheduleContent.isCalendarView`/`viewModes`. | Medium: dynamic headers, the most decorations |
| InventoryItemTimeline                                          | 1     | `table`, `calendar`                                                 | Add derived `calendarStart/End` to all rows. `chipColorClass` stays a calendar prop passed through `DataView` attrs (Q11).                                                                                                                                                                                                                                                                         | Low                                           |
| InventoryItemReport                                            | 1     | `table`, `calendar`                                                 | `calendarColumns` becomes the calendar view's `chip`. `calendarData` date logic becomes derived fields. `hide-columns` becomes `hidden`. `#default` becomes `cell: 'slot'` and the registry (`image`, `itemId`). `onRowClick` navigates to the item page.                                                                                                                                          | Medium                                        |
| Inventory categories + overview                                | 2     | `items` (table), `categories` (cards, `groupBy: 'tab'`)             | `groupKeys` from `categoriesStore`. `groupDecorations` for autosave/lock/Save/cardClass. Retire `_hiddenSearchData` analysis and `getInventoryHiddenSearchData` once verified (C8). `tab` cell becomes `cell: 'slot'` (purple button), `image` comes from the registry. `#details-cell` stays as a table-only slot. Legacy `?view=categories`.                                                     | High: data path change                        |
| PacklistContent cards                                          | 2     | `cards` only (row cards)                                            | `formatPacklistCard` becomes `decorations` (lock, unsaved, link and index actions) plus card lines (`title`, ship date, description). Pins, pinned-only and unlinked-only stay page logic: they filter rows before `DataView`. Sort select stays (`view.sort` sets the default).                                                                                                                   | Medium                                        |
| ReportsContent                                                 | none  | n/a                                                                 | Stays in items mode.                                                                                                                                                                                                                                                                                                                                                                               | none                                          |
| PacklistItemsSummary, ShowInventoryReport, IndexMismatchReport | 3     | one table view each (no switcher)                                   | `hide-columns` becomes `hidden`. `#default` becomes `cell: 'slot'` plus registry. `show_*` patterns. The view switcher appears only if there are 2 or more views.                                                                                                                                                                                                                                  | Low                                           |
| InventoryTable                                                 | 4     | one table view                                                      | Key-based edit contract (Phase 0) is the prerequisite. `forceDetails`, `rowDetailsVisible` and `#row-detail-rows` stay table props/slots.                                                                                                                                                                                                                                                          | Medium: editing                               |
| PacklistTable (crates, items, summary)                         | 4     | one table view plus `print` variant                                 | The nested item table's columns come from a view (`hidden: ['Pack','Check','Extracted Item','Extracted Qty']`, `print` variant un-hides Pack/Check). `colspan` stays a field property. No layout switching.                                                                                                                                                                                        | High: drag, nesting, grouping, clipboard      |

---

## 6. Phased delivery

Each phase ships on its own, and every page keeps working throughout.

### Phase 0: Groundwork (no intended visible change)

1. **Key-based edit contract (C1).**
   - `cell-edit` emits `(rowIndex, colIndex, value, columnKey)`, adding the key as a 4th argument so existing handlers don't break.
   - `dirtyCells` is keyed `[rowIndex][columnKey]`.
   - Revert/hint lookups use the key.
   - `InventoryTable`, `InventoryOverviewTable` and `PacklistTable` handlers switch to the key.
   - Fixes D4.
2. **Extract `formatValue` and the autoColor lookup** to `fieldFormat.js`. `TableComponent.formatCellValue` delegates to it.
3. **Extract `matchRow`.** Table and cards use it. `useSearch.matchesRow` wraps it.
4. **Extract `ContentHeaderComponent` and `RowDetailsComponent`.** The table's expand grid and Schedule's modal use `RowDetailsComponent`.
5. **Add `useNarrow` and `BREAKPOINTS`.** Not used by any page yet.
6. **Fix D1 and D2.** Delete D3 (`whenSmall`) only after its intent is captured in the Schedule narrow variant in Phase 3; until then leave a comment.
7. **Tests:** `formatValue`, `matchRow` (AND logic, shown/details/hidden tiers, detailMatches), and the key-based dirty logic, if it is extracted as a pure helper.

### Phase 1: View engine plus table/calendar pages

1. `resolveView` with legacy flag output, patterns, tiers, variant merge, validation, and tests.
2. `DataView`: URL read and legacy mapping, `useNarrow`, resolve, renderer pick, `$attrs` and slot forwarding, the default `event-click` modal, `decorations` plumbing.
3. `ViewSelectComponent` replaces `ViewChangeComponent` on migrated pages. The old component stays until Phase 2 finishes.
4. Calendar: `formatValue` on chips, `decorations` replace `chipActions` (the prop is kept as an alias until all three pages migrate), details-match chip glow.
5. Migrate Schedule, Timeline and ItemReport (§5).
6. Verify §9 on desktop, narrow (dashboard card and modal) and print.

### Phase 2: Cards as a renderer

1. `rowsToCards` and `groupRowsToCards` with tests (empty groups, `groupKeys` seeding, `searchFields`, escaping).
2. `CardsComponent` matches through `matchRow` on `searchFields`. Items mode keeps working (`searchFields` absent → title/content/footer).
3. Migrate PacklistContent (row cards), then Inventory categories (group cards). Keep `_hiddenSearchData` behind a flag until load and memory are measured (C8).
4. Remove `ViewChangeComponent`.

### Phase 3: Table layout features

1. Parent-owned N-high stacks (4.8), the single-row header, and sticky-clone simplification.
2. `variants.narrow` on Schedule. Remove `whenSmall`.
3. `view.table.sticky`, moving `sticky` off fields.
4. Calendar `chipLines` (N lines).
5. Migrate the read-only report tables.
6. Unify breakpoints: point `useStickyHeader`'s 768 and the nav/media 800 at `BREAKPOINTS`, or document why they differ (Q8).

### Phase 4: Editing tables

1. InventoryTable: view-driven visibility.
2. PacklistTable: view-driven visibility for the nested item table plus the `print` variant.

### Phase 5: Customization and new views

1. "Customize…" modal: checkboxes for shown/details/hidden, up/down order, stack builder (indent/outdent a field under the one above), no drag-and-drop.
2. Per-user overrides stored as `{ baseViewId, columns, details, hidden, … }`, using `storeUserData(email, 'views_<page>')` with a `getReactiveStore` modelled on saved searches. Overrides reference built-in ids, so code updates still reach users who never customized.
3. New views: design queue, ship/return calendar (Q4).

### 6.7 Intended visual shifts

- Calendar chips show formatted dates and numbers.
- Calendar chips gain the ship-date and transship badges that only tables show today (D5).
- The view switcher shows a name or menu when there are more than two views.
- Fallback cells on report pages gain search highlighting (D6).
- Stacked headers render as labels inside one header cell (Phase 3).
- Schedule on narrow containers stacks Client under Show, as `whenSmall` intended.
- Category cards may appear slightly later on first load if they come from the overview store (C8).
- Detail-only search matches glow on calendar chips.

---

## 7. Challenges

Each entry gives the problem, why it matters, the approach, and the risk that remains.

**C1. The edit contract is column-index based.**

- _Problem:_ `cell-edit` emits a `mainTableColumns` index, `dirtyCells` is keyed by it, and consumers map it back through their own lists (`this.columns[colIdx]`, `itemHeaders[itemColIdx]`). Views reorder, stack and remove columns, so indices shift.
- _Approach:_ Phase 0 key-based contract (4th argument plus key-keyed `dirtyCells`).
- _Residual risk:_ PacklistTable's nested tables have their own dirty propagation (`inner-table-dirty`, `nestedTableDirtyCells`), which needs the same treatment. The `[-1]` row-level sentinel at [L3303](../js/application/components/interface/tableComponent.js#L3303) must keep its meaning.

**C2. `TableComponent` size and entanglement.**

- _Problem:_ sticky clones, stacks, details, editing, drag, clipboard and groups all read `columns`/`mainTableColumns`/`theadRow1Columns`.
- _Approach:_ Phase 1 changes no table internals, because the legacy flag output makes views invisible to the table. Phase 3 changes only stack and header code, behind the `stack` property, and keeps the legacy `stackUnder` path until every page has migrated.
- _Residual risk:_ the sticky-clone width mirroring (`stickyColumnWidths`, `getCloneStickyThStyle`) is the most fragile code involved.

**C3. Slot and attribute forwarding through `DataView`.**

- _Problem:_ pages use about a dozen table-only props (`draggable`, `newRow`, `dragId`, …), table-only slots, and a cell slot whose name differs by renderer. Templates are compiled at runtime with the global Vue build (the `html` tag).
- _Approach:_
  - `inheritAttrs: false` and `v-bind="$attrs"` on the chosen renderer.
  - Slots forwarded with `<template v-for="(_, name) in $slots" #[name]="scope"><slot :name="name" v-bind="scope || {}"/></template>`, which the runtime compiler supports.
  - Renderer-specific props that don't apply to the current layout are ignored, so the page passes one set.
- _Residual risk:_ the extra component layer per instance matters for nested PacklistTable tables, which is why they don't use `DataView` and get views directly via `resolveView` (Phase 4).

**C4. Dynamic and pattern fields.**

- _Problem:_ Schedule fields come from sheet headers, and ShowInventoryReport adds `show_*`.
- _Approach:_ unknown keys are ignored, unlisted fields go to `unlisted`, and lists support patterns. Per-user overrides (Phase 5) keep stale keys harmlessly.
- _Residual risk:_ a renamed sheet header silently moves a field into details. Acceptable, but log it in dev.

**C5. Derived fields.**

- _Problem:_ the calendar needs start/end values that don't exist in the raw rows (Timeline derives end dates from the next row).
- _Approach:_ pages derive these once onto all rows.
- _Residual risk:_ derived fields must not reach save paths. The stores' save functions operate on store data, so derived fields belong in a computed copy, not on `store.data`. Timeline already does this with a mapped copy. Note the system rule in [notes.md](notes.md) that dates must never be passed into reactive-store save/load calls.

**C6. Narrow detection loop and timing.**

- _Problem:_ the previous attempt observed the table root at 640px and was rolled back. Changing structure on narrow can change the observed width and cause oscillation or scroll jumps.
- _Approach:_ observe the container ancestor (not affected by content), use hysteresis, and read synchronously on mount.
- _Residual risk:_ modals size to content (`min-width: var(--page-width-card)`), so a modal's container width can depend on what it contains. Verify the timeline and report modals, and pin the modal content width if needed.

**C7. Sticky × stack × narrow.**

- _Problem:_ sticky offsets are summed from measured widths, stacks change widths, and narrow variants change both.
- _Approach:_ measure after every resolved-column change (the existing `visibleColumns` watcher calls `_measureColWidths`; extend it to the resolved view id and narrow flag). Narrow variants should normally drop sticky columns.

**C8. Group cards data path (Inventory).**

- _Problem:_ categories built from `getAllInventoryData` must wait for all items before the first paint, while today the tab list shows immediately and search data fills in progressively.
- _Approach:_ render group cards from `groupKeys` (the tab list) immediately with empty `searchFields`, then fill them as overview rows arrive. Keep `_hiddenSearchData` behind a flag until measured.
- _Residual risk:_ memory and eviction policy ([memory-optimization-analysis.md](memory-optimization-analysis.md)). Holding all inventory rows for the categories page could conflict with planned store eviction. `groupRowsToCards` over thousands of rows on every analysis tick needs memoizing by group (C13).

**C9. Group-level state that isn't in rows.**

- _Problem:_ autosave, unsaved changes, locks and the Save action are per tab, not per item.
- _Approach:_ `groupDecorations(groupKey, rows)` reads `categoriesStore` metadata, which stays for this purpose.

**C10. Search semantics change.**

- _Problem:_ today `hideColumns` fields are unsearchable, `details` fields are searchable, and card hidden data is a fixed set (item#, description, notes).
- _Approach:_ explicit tiers. Each migration maps `hideColumns` → `hidden` and verifies search results before and after on the same data.
- _Residual risk:_ inventory category search will match more fields (every shown and details field of every item) than the three it matches today. That is better recall, but more noise. Decide with users (Q6).

**C11. Detail modal parity.**

- _Problem:_ Schedule's calendar modal shows all non-empty fields plus action cards. ItemReport navigates instead. Table expand also supports `#row-details` and `#row-detail-rows` custom content.
- _Approach:_ `RowDetailsComponent` plus decorations as the default; `onRowClick` override; custom detail slots stay table-only for now (Q12).

**C12. The dashboard and URL compatibility.**

- _Problem:_ pinned dashboard paths contain `?layout=calendar` and `?view=categories`. The view switcher behaves differently on the dashboard.
- _Approach:_ read-side legacy mapping kept indefinitely, `ViewSelect` keeps the `updatePath` branch, and unknown ids fall back to the default.
- _Residual risk:_ view ids become a public contract once pinned, so define a rename policy (Q13).

**C13. Reactivity and performance.**

- _Problem:_ `resolveView` is cheap, but adapters run over every row whenever `store.data` changes. Analysis updates rows progressively (`AppData`), and `isAnalyzing`/`analysisProgress` are read as reactivity triggers in today's computeds (`categoryList`, `availablePacklists`).
- _Approach:_ keep those explicit dependency reads in the page computeds that feed `DataView`, memoize per row (WeakMap keyed by row object) and per group, and avoid deep watchers on rows.

**C14. Keyboard, accessibility and the analyzing state.**

- _Problem:_ cards and chips have Enter/Space handling and `analyzing` classes, and the table has search-result navigation.
- _Approach:_ no change in renderers. Adapters must pass `AppData` through so `isCardAnalyzing` keeps working.

**C15. Testing.**

- _Problem:_ [tests.js](../js/tests/tests.js) is a console suite against FakeGoogle with no component harness.
- _Approach:_ all new logic is in pure functions, which are fully unit-tested. Renderer and page behaviour is verified manually with §9. Add FakeGoogle fixtures for a narrow-width check if feasible.

**C16. Undo and layout switching.**

- _Problem:_ switching views is a URL change. If it remounts the table, undo capture state (`hasUndoCaptured`, idle timer) and expanded rows reset.
- _Approach:_ `DataView` keeps the renderer mounted across same-layout view changes (only resolved columns change). Layout changes remount, as today's `v-if` does. Verify that the undo registry is keyed by route (`currentRouteKey`) and survives the change.

---

## 8. Feature parity matrix

Legend: ✅ today · 🟢 after this refactor · 🔵 possible later (unblocked by the design) · — not applicable

| Feature                             | Table                        | Calendar                      | Cards                           |
| ----------------------------------- | ---------------------------- | ----------------------------- | ------------------------------- |
| Shown / details / hidden tiers      | ✅ (ad hoc) → 🟢 view-driven | 🟢 (modal = details)          | 🟢 (row and group cards)        |
| Search filter                       | ✅                           | — (highlight only, by design) | ✅                              |
| Search navigate                     | ✅                           | ✅ highlight                  | ✅                              |
| Details-only match indicator        | ✅                           | 🟢 chip glow                  | ✅ → 🟢 via `matchRow`          |
| Value formatting                    | ✅                           | 🟢                            | 🟢 (adapter)                    |
| Stacks                              | ✅ 2-high → 🟢 N-high (Ph3)  | ✅ 2 lines → 🟢 N lines (Ph3) | 🟢 card lines                   |
| Narrow variant                      | CSS only → 🟢                | CSS only → 🟢                 | CSS only → 🟢                   |
| Sticky columns / header             | ✅                           | header ✅                     | header ✅                       |
| Cell registry / slot                | slot ✅ → 🟢                 | 🟢 compact                    | 🟢                              |
| Decorations                         | `#cell-extra` ✅ → 🟢        | `chipActions` ✅ → 🟢         | `footerActions` ✅ → 🟢         |
| Row click / detail                  | expand ✅                    | modal ✅ → 🟢 shared          | `onItemClick` ✅ / 🔵 modal     |
| Sort                                | ✅ headers                   | —                             | ✅ select; default from view 🟢 |
| Grouping                            | packlist row groups ✅       | —                             | 🟢 `groupBy`                    |
| Pinning                             | —                            | —                             | ✅                              |
| Editing, drag, clipboard, selection | ✅                           | —                             | —                               |
| Print variant                       | 🟢 (packlist)                | 🔵                            | 🔵                              |
| User customization                  | 🔵 Ph5                       | 🔵 Ph5                        | 🔵 Ph5                          |

---

## 9. No-feature-loss verification checklist

Run this per migrated page on: desktop width; a narrow dashboard card; inside a modal, where the page can be opened in one; and print, where applicable.

**All renderers**

- [ ] Header-area content (filters) renders and works; refresh; loading and analysis bar progresses (Inventory: D1 fixed)
- [ ] Search: highlight, navigate (next/prev, count), filter mode, Show all, URL sync of `searchTerm`, and search preserved when navigating into a category
- [ ] View switch: URL updates, back/forward works, dashboard card updates its stored path, legacy `?layout=calendar` and `?view=categories` links open the right view
- [ ] Analyzing state classes; error banner; empty message; keyboard Enter/Space on chips and cards

**Table**

- [ ] Column order, sticky start/end (overview `image`), horizontal scroll with the sticky-header clone aligned
- [ ] Stacked cells and headers; sort on every sortable field including stacked lines; default sort; `type: 'item'` ordering
- [ ] Details: toggle, auto grid, `#row-details`, `#row-detail-rows`, `#details-cell`, `forceDetails`, `rowDetailsVisible`, details-match glow
- [ ] Hiding: `hidden` fields absent and unsearchable; ad-hoc header hide and reset on refresh
- [ ] Editing: text, number, external-edit, revert, original hint, dirty markers in the right cells after reorder, Save, Discard, undo/redo, unsaved footer, locks (InventoryTable)
- [ ] Rows: new row (button and footer), drag/drop between crates, drop-onto, multi/shift select, selection bubble actions, delete/restore, cut/copy/paste (in-app and OS TSV), group create/toggle/visibility override, nested table dirty propagation
- [ ] Mobile tap-to-show column buttons; footer counts
- [ ] Packlist print shows Pack/Check and restores afterwards

**Calendar**

- [ ] Spans and week splits; month labels; year column; week start; today highlight; sticky day header
- [ ] Chip lines and colours (`chipColorClass`); inline and end decorations; end decorations hidden when narrow
- [ ] Detail modal content and actions (Schedule); navigation on click (ItemReport)

**Cards**

- [ ] Inventory: every category including empty ones; cardClass; unsaved/lock footer; Save action; deep search shows matched fields; click navigates with `searchTerm`
- [ ] Packlists: ship date/description content; lock/unsaved footer; link and index actions; pins; pinned-only and unlinked-only subpages; sort select and default
- [ ] Reports menu unchanged

---

## 10. Open questions and unresolved problems

1. **URL parameter name.** Is `display` acceptable? Should the existing `?view=all` (schedule show-all) be renamed for clarity, given that it is a filter and not a view? Renaming means a second legacy mapping.
   Decision: Use "view". Schedule show all should probably be worked through everything as a special date filter rather than "view". Maybe just dateFilter=all clarifies. Nothing in the database currently uses this particular view param, so don't worry about backwards compatability in this case.
2. **Who owns views?** Built-in views are in code. Are per-user overrides enough, or are team-shared views needed? The Preferences sheet has locking and JSON values, but editing shared presentation state invites conflicts. Can users create new views, or only modify built-in ones?
   Decision: Built in views should be entirely migrated into this system as defaults. I intend to build future pages with this system. Per-user overrides for the simplest things (like column order, details membership, and stickyness) are enough for current customization. I may in the future want to surface some application view settings as app wide parameters.
3. **Default for unlisted fields.** Is `details` right for every page? For sheet-driven pages (Schedule) yes. For report pages with internal helper fields, `hidden` may be safer. Per-page default, or a global default?
   Decision: Pages will have a default view including hidden details on some pages. New pages initially will be built with default views. Various customizations will be allowed on a per-page basis as user-customization or app-level overrides. Some tables will only have a default immutable view, for example the advanced filters overlapping show modal.
4. **New Schedule views.** Do the fields a design queue needs exist in the production schedule sheet? [notes.md](notes.md) pairs the design queue with "updating logic", which suggests editing schedule rows, but the schedule table is read-only today. That would bring layout switching and editing together, which this plan avoids.
   Basic fields exist and more can be added at the proper time. Before the design queue becomes operational, we will need to impliment "checkbox fields" in tables, and an api mechanism that
5. **Inventory categories data path (C8).** Is loading all inventory rows for the categories page acceptable on real data volumes and slow connections? This needs measurement against `_hiddenSearchData` before it is removed. How does it fit the store eviction plans?

6. **Search recall versus noise (C10).** Should category deep search match every item field or only a chosen subset? This could be a per-view `searchable` list, which would add a fourth tier.

7. **Custom cells at compact density.** Should page slot cells (`cell: 'slot'`) ever render inside calendar chips, or only registry cells with a defined compact form? Clickable content inside a clickable chip is an interaction problem.

8. **Breakpoints.** Is 600/640 container width right for every renderer? Are the 768 (sticky header) and 800 (navigation) page-width breakpoints deliberately different from the container breakpoint, or accidental?

9. **Ad-hoc hide.** Should the per-column hide button in the table header offer "save to my view" in Phase 5, or stay session-only?

10. **Sort in views.** Should a view own only the default sort, or also remember the user's last sort per view? If the latter, does it go in the URL (shareable) or user data (persistent)?

11. **Renderer-only callbacks.** `chipColorClass` (calendar) and `cardClass` (cards) are colour rules. Should they become a shared `rowClass(row, renderer)` hook, or stay renderer props passed through attrs?

12. **Custom details content.** `#row-details` and `#row-detail-rows` are table-only. Should the calendar and card detail modals render the same slot, which would give calendar and cards parity with InventoryTable's pending-changes rows?

13. **View id stability.** Once a view is pinned to a dashboard, its id is effectively public. Is the policy "never rename; alias old ids", and where do aliases live (the page's `legacy` map)?

14. **Terminology.** Should "group" (packlist row groups) and `groupBy` (card grouping) be renamed so they can't be confused, for example `cards.bucketBy`?

15. **The "history" toggle** from [notes.md](notes.md) L1 (edit history rows next to pending changes). It adds rows rather than changing presentation, so is it a view option (`table.showHistory`), a page toggle in `header-area`, or a saved-search concern? It shouldn't be built into views by accident.

16. **Advanced filter options per view** ([notes.md](notes.md) L79). Should the filter UI read the active view's layout and hide options the layout can't use? That couples filter and view, which this plan otherwise keeps separate.

17. **Testing depth.** Is a manual checklist acceptable for renderer behaviour, or is a lightweight component test harness on FakeGoogle worth adding before Phase 3 (stack/header rewrite) and Phase 4 (editing tables)?

18. **PacklistTable scope.** Is view-driven visibility for the nested item table worth the risk, given that the current hard-coded list plus print toggle works? The alternative is to leave PacklistTable on `hideColumns` permanently and only move print to a `variants.print` helper.
