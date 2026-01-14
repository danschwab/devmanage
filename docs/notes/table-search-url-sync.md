# Table and Card Search URL Sync Standard

## Overview

Tables and cards components support automatic URL synchronization for search terms, following the same pattern as `ScheduleFilterSelect`. When enabled, search terms are automatically stored in and retrieved from URL parameters, allowing:

- Multiple tables/cards to stay synchronized on the same page
- Search state to persist across navigation
- Search terms to be bookmarkable and shareable
- Breadcrumb navigation to restore search context

## Core Principle

**URL-Driven Search**: Components do not accept search values as props. Instead, they either:

1. Sync with URL parameters (when `syncSearchWithUrl` is enabled), OR
2. Maintain purely local search state (when `syncSearchWithUrl` is disabled)

This follows the same pattern as `ScheduleFilterSelect`, which doesn't have a `dateFilter` prop but instead syncs entirely with URL parameters.

## Implementation

### TableComponent

**Props:**

```javascript
{
  showSearch: Boolean,              // Enable/disable search input (default: false)
  syncSearchWithUrl: Boolean,       // Enable URL sync (default: false)
  containerPath: String,            // Required when syncSearchWithUrl is true
  navigateToPath: Function,         // Required when syncSearchWithUrl is true
  hideRowsOnSearch: Boolean         // Hide non-matching rows (default: true)
}
```

**URL Parameter:**

- Parameter name: `searchTerm`
- Location: Part of JSON path segment (e.g., `#inventory?{"searchTerm":"table"}`)

**Behavior:**

- When `syncSearchWithUrl` is `false`: Search is purely local, no URL interaction
- When `syncSearchWithUrl` is `true`:
  - On mount: Reads `searchTerm` from URL parameters
  - On search input: Updates URL with debounced (300ms) `searchTerm` parameter
  - On URL change: Updates search input if `searchTerm` parameter changed
  - Dashboard support: Uses `DashboardRegistry.updatePath()` when on dashboard

### CardsComponent

Follows identical pattern to `TableComponent`:

**Props:**

```javascript
{
  showSearch: Boolean,              // Enable/disable search input (default: false)
  syncSearchWithUrl: Boolean,       // Enable URL sync (default: false)
  containerPath: String,            // Required when syncSearchWithUrl is true
  navigateToPath: Function,         // Required when syncSearchWithUrl is true
  hideCardsOnSearch: Boolean        // Hide non-matching cards (default: true)
}
```

## Usage Examples

### Local Search Only (No URL Sync)

```javascript
// Simple local search - no URL interaction
<TableComponent
  :show-search="true"
  :data="items"
  :columns="columns"
/>
```

### URL-Synced Search

```javascript
// Search syncs with URL parameters
<TableComponent
  :show-search="true"
  :sync-search-with-url="true"
  :container-path="containerPath"
  :navigate-to-path="navigateToPath"
  :data="items"
  :columns="columns"
/>
```

### Multiple Synced Tables

```javascript
// Both tables stay synchronized via URL
<TableComponent
  :show-search="true"
  :sync-search-with-url="true"
  :container-path="'inventory/categories/furniture'"
  :navigate-to-path="navigateToPath"
  :data="tableData1"
  :columns="columns1"
/>

<TableComponent
  :show-search="true"
  :sync-search-with-url="true"
  :container-path="'inventory/categories/furniture'"
  :navigate-to-path="navigateToPath"
  :data="tableData2"
  :columns="columns2"
/>
```

Both tables will automatically stay in sync because they share the same `containerPath`.

### Dashboard Context

```javascript
// Works automatically on dashboard - uses DashboardRegistry instead of URL
<TableComponent
  :show-search="true"
  :sync-search-with-url="true"
  :container-path="containerPath"
  :navigate-to-path="navigateToPath"
  :data="items"
  :columns="columns"
/>
```

When rendered on dashboard, updates go to `DashboardRegistry.updatePath()` instead of browser URL.

## Component Integration Pattern

### Parent Component Setup

```javascript
export const MyComponent = {
  inject: ["appContext"],
  props: {
    containerPath: String,
    navigateToPath: Function,
  },
  template: html`
    <TableComponent
      :show-search="true"
      :sync-search-with-url="true"
      :container-path="containerPath"
      :navigate-to-path="navigateToPath"
      :data="items"
      :columns="columns"
    />
  `,
};
```

### Required Injections

Components using URL-synced search must have:

- `inject: ['appContext']` - Provides access to `appContext.currentPath` for URL monitoring
- `NavigationRegistry` imported - Used for parameter parsing and path building

### Implementation Details

**Internal Flow:**

1. **Mount**: Read `searchTerm` from `NavigationRegistry.getParametersForContainer()`
2. **User types**: Update internal `searchValue` → trigger debounced URL update
3. **URL changes**: Watch `appContext.currentPath` → update `searchValue` if `searchTerm` changed
4. **URL update**: Call `NavigationRegistry.buildPath()` with `{ searchTerm }` → navigate

**Debouncing:**

- 300ms debounce on URL updates to avoid excessive navigation
- Clears previous timeout before setting new one

**Dashboard Detection:**

```javascript
const isOnDashboard =
  this.appContext?.currentPath?.split("?")[0].split("/")[0] === "dashboard";
```

## Benefits

### 1. Consistency with Other URL Parameters

Follows the same pattern as `ScheduleFilterSelect` for `dateFilter`, creating a consistent mental model across the application.

### 2. Automatic Synchronization

Multiple tables/cards on the same page automatically stay in sync without manual coordination:

```javascript
// Both tables filter by the same search term
<TableComponent :sync-search-with-url="true" :container-path="path" ... />
<CardsComponent :sync-search-with-url="true" :container-path="path" ... />
```

### 3. Persistent Search Context

- Search terms persist through navigation (via parameter caching in routes)
- Breadcrumb navigation restores last-used search terms
- Users can bookmark searches
- Back/forward buttons preserve search state

### 4. Dashboard Independence

Dashboard containers maintain independent search state via `DashboardRegistry`, separate from browser URL.

### 5. Simplified Component API

No need for:

- `initialSearchTerm` computed properties
- Manual parameter extraction
- Explicit search term props
- Watchers to sync props with URL

Just one boolean prop (`syncSearchWithUrl`) controls everything.

## Migration from Old Pattern

### Old Pattern (Deprecated)

```javascript
// Parent computed property
computed: {
  initialSearchTerm() {
    const params = NavigationRegistry.getParametersForContainer(
      this.containerPath,
      this.appContext?.currentPath
    );
    return params?.searchTerm || '';
  }
}

// Template
<TableComponent
  :search-term="initialSearchTerm"
  ...
/>
```

### New Pattern

```javascript
// No computed property needed!

// Template
<TableComponent
  :sync-search-with-url="true"
  :container-path="containerPath"
  :navigate-to-path="navigateToPath"
  ...
/>
```

### Migration Steps

1. **Remove** `initialSearchTerm` computed property
2. **Remove** `:search-term` prop from table/card
3. **Add** `:sync-search-with-url="true"` to enable URL sync
4. **Add** `:container-path="containerPath"` prop
5. **Add** `:navigate-to-path="navigateToPath"` prop
6. **Ensure** parent component has `inject: ['appContext']`

## Technical Implementation

### Watchers

**URL Parameter Changes:**

```javascript
'appContext.currentPath': {
  handler(newPath, oldPath) {
    if (!this.syncSearchWithUrl || !oldPath) return;

    const newParams = NavigationRegistry.getParametersForContainer(
      this.containerPath,
      newPath
    );
    const oldParams = NavigationRegistry.getParametersForContainer(
      this.containerPath,
      oldPath
    );

    // Only update if searchTerm parameter changed
    if (newParams?.searchTerm !== oldParams?.searchTerm) {
      this.searchValue = newParams?.searchTerm || '';
    }
  }
}
```

**Search Value Changes:**

```javascript
searchValue(newValue, oldValue) {
  if (!this.syncSearchWithUrl || newValue === oldValue) return;

  // Debounce URL updates
  clearTimeout(this._searchDebounce);
  this._searchDebounce = setTimeout(() => {
    this.updateSearchInURL(newValue);
  }, 300);
}
```

### URL Update Method

```javascript
updateSearchInURL(searchValue) {
  if (!this.syncSearchWithUrl || !this.containerPath || !this.navigateToPath) {
    return;
  }

  const isOnDashboard = this.appContext?.currentPath?.split('?')[0].split('/')[0] === 'dashboard';
  const params = { searchTerm: searchValue || undefined };

  // Remove undefined values
  if (params.searchTerm === undefined) {
    delete params.searchTerm;
  }

  const newPath = NavigationRegistry.buildPath(this.containerPath, params);

  if (isOnDashboard) {
    // Update dashboard registry
    NavigationRegistry.dashboardRegistry.updatePath(
      this.containerPath.split('?')[0],
      newPath
    );
  } else {
    // Regular navigation
    this.navigateToPath(newPath);
  }
}
```

### Mount Initialization

```javascript
mounted() {
  // Initialize searchValue from URL if syncSearchWithUrl is enabled
  if (this.syncSearchWithUrl && this.containerPath && this.appContext?.currentPath) {
    const params = NavigationRegistry.getParametersForContainer(
      this.containerPath,
      this.appContext.currentPath
    );
    if (params?.searchTerm) {
      this.searchValue = params.searchTerm;
    }
  }
}
```

## Best Practices

### 1. Always Use URL Sync for Navigable Content

Enable `syncSearchWithUrl` when:

- Users might navigate away and return
- Multiple tables/cards should stay synchronized
- Search state should be bookmarkable

### 2. Use Local Search for Temporary Filters

Disable `syncSearchWithUrl` when:

- Search is purely transient (e.g., modal dialogs)
- Multiple independent searches on same page
- Search doesn't affect primary content state

### 3. Consistent Container Paths

Use consistent `containerPath` values across components that should share search state:

```javascript
// Good - same path, synchronized search
const path = 'inventory/categories/furniture';
<TableComponent :container-path="path" :sync-search-with-url="true" />
<CardsComponent :container-path="path" :sync-search-with-url="true" />

// Bad - different paths, independent search
<TableComponent :container-path="'inventory/table'" :sync-search-with-url="true" />
<CardsComponent :container-path="'inventory/cards'" :sync-search-with-url="true" />
```

### 4. Provide navigateToPath

Always pass `navigateToPath` function from parent:

```javascript
// Good
<TableComponent :navigate-to-path="navigateToPath" />

// Also good - inline function
<TableComponent :navigate-to-path="(path) => $emit('navigate-to-path', path)" />

// Bad - missing
<TableComponent :sync-search-with-url="true" />
```

### 5. Inject appContext

Parent components must inject appContext for URL monitoring:

```javascript
export const MyComponent = {
  inject: ["appContext"], // Required!
  // ...
};
```

## Comparison with ScheduleFilterSelect

| Feature                | ScheduleFilterSelect              | Table/Card Search                 |
| ---------------------- | --------------------------------- | --------------------------------- |
| **Value Prop**         | None (no `dateFilter` prop)       | None (no `searchTerm` prop)       |
| **URL Sync Toggle**    | Always enabled                    | `syncSearchWithUrl` boolean       |
| **Parameter Name**     | `dateFilter`, `textFilters`, etc. | `searchTerm`                      |
| **Required Props**     | `containerPath`, `navigateToPath` | `containerPath`, `navigateToPath` |
| **Dashboard Support**  | ✅ Via DashboardRegistry          | ✅ Via DashboardRegistry          |
| **URL Monitoring**     | Watches `appContext.currentPath`  | Watches `appContext.currentPath`  |
| **Parameter Building** | `NavigationRegistry.buildPath()`  | `NavigationRegistry.buildPath()`  |
| **Debouncing**         | None (dropdown selection)         | 300ms (typing input)              |

Both follow the same architectural pattern: **purely URL-driven with no value props**.

## Troubleshooting

### Search Not Syncing to URL

**Check:**

1. Is `syncSearchWithUrl` set to `true`?
2. Is `containerPath` provided?
3. Is `navigateToPath` provided?
4. Does parent component have `inject: ['appContext']`?
5. Is `NavigationRegistry` imported in table/card component?

### Multiple Tables Out of Sync

**Check:**

1. Do they have the same `containerPath`?
2. Are they both using `syncSearchWithUrl="true"`?

### Search Clears on Navigation

**Check:**

1. Is the navigation using `NavigationRegistry.buildPath()` to preserve parameters?
2. Is the route configured to cache parameters (automatic with navigation system)?

### Dashboard Search Not Persisting

**Check:**

1. Is container path registered in DashboardRegistry?
2. Is `updatePath()` being called correctly?
3. Check browser console for dashboard registry logs

## Related Documentation

- [Navigation System Documentation](navigation-system.md)
- [Reactive Store Features](reactive-store-features.md)
- [Component Integration Patterns](navigation-system.md#component-integration-pattern)
