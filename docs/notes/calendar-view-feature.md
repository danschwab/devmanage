# Calendar View Feature

A calendar view toggle for the Production Schedule, controlled entirely within `ScheduleTableComponent`.

## Concept

`ScheduleTableComponent` already owns the reactive store, all data computeds, and all domain logic. The view toggle is a template-level switch: the same data drives either a `TableComponent` or a new `CalendarComponent`.

`ScheduleContent` requires no changes.

---

## New Files

### `docs/js/application/components/interface/calendarComponent.js`

Pure presentation component (no data fetching, no store). Accepts the same data/loading/search props as `TableComponent`.

#### Props

```
// Mirrors TableComponent display props
data              Array      row objects from the store
columns           Array      same column defs as the table (used for event chip and detail modal)
isLoading         Boolean
isAnalyzing       Boolean
loadingProgress   Number
loadingMessage    String
error             String
title             String
emptyMessage      String
parentSearchValue String     drives text highlight; does NOT hide events (see Search section)

// Calendar-specific (values are column keys)
eventStartColumn  String     required
eventEndColumn    String     required
weekStart         String     'sunday' | 'saturday'  (default 'sunday')
```

#### Slots

```
#header-area          same as TableComponent; receives the filter bar from ScheduleContent
#event-start="{ row }"   content injected at the left end of each event chip
#event-end="{ row }"     content injected at the right end of each event chip (packlist buttons, etc.)
```

The `#event-end` slot replaces the `onEventClick` callback approach for rich inline content (packlist buttons, issue badges). `ScheduleTableComponent` fills this slot the same way it fills `#cell-extra` for the table.

---

### `docs/js/application/components/interface/rowDetailsComponent.js` _(extract from TableComponent)_

A reusable component that renders a two-column key/value grid of all fields in a row. Currently this layout is inlined in `TableComponent`'s row-expand template. Extracting it lets both the table expand and the calendar detail modal share the same markup and formatting logic.

Input props:

```
row        Object    the data row
columns    Array     full column definitions (provides labels and format info)
```

Renders every column (not just `details`-flagged ones) as a label/value pair. Applies the same `format` logic (date, number, currency) already used in the table cell renderer.

---

### `docs/js/application/components/interface/contentHeaderComponent.js` *(extract from CardsComponent + TableComponent)*

Both `CardsComponent` and `TableComponent` contain an identical header block:
- `#header-area` named slot
- spacer div
- Search input with clear button (using `useSearch`)
- Refresh button
- `LoadingBarComponent`

`CalendarComponent` needs the same structure. Rather than a third copy, this block should be extracted into a shared `ContentHeaderComponent` that all three consume. Props would mirror the existing set: `showSearch`, `showRefresh`, `isLoading`, `isAnalyzing`, `loadingProgress`, `loadingMessage`, plus the `search` composable instance passed in or managed internally.

---

## Modified Files

### `docs/js/application/components/content/ScheduleTable.js`

1. Add `calendarView: false` to `data()`
2. Register `CalendarComponent` in `components`
3. Wrap template in `v-if="!calendarView"` / `v-else`:
   - Table view: existing `TableComponent` block, unchanged except a toggle button added to its `#header-area` slot
   - Calendar view: `CalendarComponent` with hardcoded schedule column keys, same `#header-area` pass-through, toggle button, and `#event-end` slot filled with packlist/issue card markup
4. Add `handleCalendarEventClick(row)` method — opens a `$modal` using `RowDetailsComponent` to show all fields, plus the packlist action button. Uses existing `getPacklistCards`, `getShipDateCards`, `getIndexIssueCards` methods to populate the modal's action area.

### `docs/js/application/components/interface/tableComponent.js`

- Extract the row-details expand markup into `RowDetailsComponent` and replace the inline usage with the new component. No behavioral change.

---

## UI Detail

### Grid Layout

- Weeks displayed as rows, months labeled on the left edge of the first week of each month.
- Day header row (Sun → Sat) is **sticky** at the top of the scroll container. The sticky logic should be extracted from `TableComponent`'s existing sticky header implementation so both components share the same approach.
- All day cells in a week row are **equal height** regardless of how many events they contain. Row height is driven by the tallest cell in the row.
- **Today's date cell** is highlighted (blue background on the date number).

### Event Chips

- Rendered as a horizontal bar spanning from `eventStartColumn` date to `eventEndColumn` date.
- The **entire chip is clickable** and opens the detail modal. There is no separate hover details button.
- When an event spans a week boundary it **splits**: the first segment ends at Saturday, a continuation segment starts at Sunday of the next row. Both segments show the label text.
- Analysis data (e.g., `AppData.estimatedShipDate`, `AppData.clientIndexIssue`) is just another column value — if its column is flagged `firstRow` or `secondRow`, it appears on the chip. No special handling needed beyond what the column flag system already provides.

### Event Chip Layout — firstRow / secondRow

Columns passed to `CalendarComponent` can be flagged with `firstRow: true` or `secondRow: true` to control which line of the event chip they appear on:

- **`firstRow`** — rendered on the top line in **bold**. Intended for the primary identifier (e.g., Show name).
- **`secondRow`** — rendered on the bottom line in normal weight. Intended for supporting info (e.g., Client, City).
- Columns with neither flag are not shown on the chip (but still appear in the detail modal).
- Within each row, values are joined with `|` and truncated with `...` when the chip is too narrow.
- `ScheduleTableComponent` sets these flags when building the `columns` array it passes to `CalendarComponent`, or adds them as overrides in its template. The base `columns` computed (used by the table) does not need these flags — they are calendar-only additions.

Example column flags set in `ScheduleTableComponent`:

```
{ key: 'Show',   firstRow: true  }   // bold top line
{ key: 'Client', secondRow: true }   // normal bottom line
{ key: 'City',   secondRow: true }   // normal bottom line
```

### `#event-start` and `#event-end` Slots

`ScheduleTableComponent` uses `#event-end` to inject the packlist button and index issue badges — the same content currently rendered via `#cell-extra` in the table. Each slot receives `{ row }` as scope.

Example in `ScheduleTableComponent`'s template:

```html
<template #event-end="{ row }">
  <template
    v-for="card in getPacklistCards(row, 'packlist')"
    :key="card.message"
  >
    <button
      :class="['card', card.class]"
      :disabled="card.disabled"
      @click="card.action?.()"
    >
      {{ card.message }}
    </button>
  </template>
</template>
```

### Search / Find

The find box highlights matching text within event chips. It does **not** hide or dim events — unlike the table's `hideRowsOnSearch` behavior. This is because sparse calendar cells lose context if events disappear. `CalendarComponent` uses `useSearch` the same way `CardsComponent` does: calling `search.highlightRawText()` on `firstRow` values and `search.highlightHtmlContent()` on `secondRow` values where the content may include HTML from analysis data.

### Analyzing State on Chips

`CardsComponent` applies an `analyzing` CSS class when `item.AppData._analyzing === true`. Calendar event chips should do the same — a chip whose row is still being analyzed gets the `analyzing` class so it can be visually distinguished (e.g., subtle pulse or reduced opacity). This reuses the same `AppData._analyzing` flag the store already sets.

### Keyboard Accessibility

`CardsComponent` handles `keydown` on each card — Enter and Space trigger the click handler. Calendar event chips need the same pattern: `tabindex="0"` on each chip element and the same `handleKeyDown` logic so keyboard users can navigate and activate events.

### Detail Modal

Triggered by clicking anywhere on the chip or pressing the hover details button. Opens via `$modal.custom(RowDetailsComponent, ...)`.

- Shows **all** column values for the row (not only `details`-flagged ones), formatted using the same date/number/currency logic as the table.
- Below the field grid, the modal renders the same rich content as `#event-end` (packlist button, issue cards) so actions are accessible from the detail view.
- `RowDetailsComponent` is the shared component described above; it receives `row` and `columns`.

---

## Integration Points

| What                   | Where it lives                                           | How calendar uses it                                                                               |
| ---------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Data rows              | `scheduleTableStore.data` → `tableData` computed         | `:data` prop                                                                                       |
| Loading state          | `isLoading`, `isAnalyzing`, `analysisProgress` computeds | props, same as table                                                                               |
| Column definitions     | `columns` computed                                       | `:columns` prop; drives chip rows via `firstRow`/`secondRow` flags, and populates the detail modal |
| Title                  | `tableTitle` computed                                    | `:title` prop                                                                                      |
| Refresh                | `handleRefresh` method                                   | `@refresh` emit                                                                                    |
| Text search            | `parentSearchValue` from `ScheduleContent`               | highlights chip text; no hiding                                                                    |
| Packlist/issue content | `getPacklistCards`, `getIndexIssueCards` methods         | rendered in `#event-end` slot and detail modal                                                     |
| Ship date estimate     | `getShipDateCards` method                                | rendered in `#event-end` slot and detail modal                                                     |
| Row detail display     | `RowDetailsComponent` (extracted)                        | used in both table expand row and calendar detail modal                                            |
| Header controls        | `#header-area` slot from `ScheduleContent`               | forwarded via `<slot name="header-area">` in both views                                            |
| Sticky header logic    | extracted from `TableComponent`                          | shared by both `TableComponent` and `CalendarComponent`                                            |
| Content header block   | `CardsComponent` + `TableComponent`                      | extracted into `ContentHeaderComponent`; used by all three view components                         |
| `useSearch` highlights | `CardsComponent` (`highlightRawText`, `highlightHtmlContent`) | same methods used on chip `firstRow`/`secondRow` label text                               |
| `analyzing` chip state | `CardsComponent` (`AppData._analyzing` → `analyzing` CSS class) | same flag applied to calendar event chips                                              |
| Keyboard click handler | `CardsComponent` (Enter/Space on cards)                  | same pattern on calendar event chips (`tabindex="0"`, keydown handler)                             |

---

## Column Key Mappings (hardcoded in ScheduleTable template)

```
eventStartColumn  = 'S. Start'
eventEndColumn    = 'S. End'
weekStart         = 'sunday'

// firstRow / secondRow flags set on column objects passed to CalendarComponent
Show   → firstRow: true
Client → secondRow: true
City   → secondRow: true
```
