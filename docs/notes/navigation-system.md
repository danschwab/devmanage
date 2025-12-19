# Navigation System Documentation

## Overview

The TopShelfLiveInventory application uses a hash-based URL routing system built on Vue 3 reactivity. The navigation system is designed to be simple, predictable, and maintain a single source of truth for application state.

## Core Principles

1. **Single Source of Truth**: `appContext.currentPath` contains the full path with query parameters
2. **URL = State**: All navigation state is encoded in the URL - no separate parameter storage
3. **Reactive Flow**: Components watch `currentPath` and reactively update when it changes
4. **Parameter Merging**: New parameters merge with existing ones, not replace them
5. **Mode Prefixes**: Date search modes are encoded in the parameter value (e.g., `show:` or `overlap:`)

## Architecture

### Three-Layer Structure

```
┌─────────────────────────────────────────────────────┐
│  UI Layer (Vue Components)                          │
│  - SavedSearchSelect, ScheduleContent, etc.         │
│  - Watch currentUrlParameters computed              │
│  - Emit events, call navigateToPath()               │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  Navigation Registry                                 │
│  - Route definitions and metadata                    │
│  - handleNavigateToPath() - main entry point        │
│  - parsePath() / buildPath() utilities              │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  URL Router                                          │
│  - Browser history sync (pushState/popState)        │
│  - Hash-based URL format (#path?params)             │
│  - Encodes/decodes paths for URL safety             │
└─────────────────────────────────────────────────────┘
```

## Key Components

### NavigationRegistry

**Purpose**: Central registry for routes and navigation logic

**Key Methods**:

- `parsePath(path)` - Splits path and query string, parses parameters into object

  ```javascript
  parsePath('inventory/categories?Col1=Name&Val1=Table')
  // Returns:
  {
    path: 'inventory/categories',
    fullPath: 'inventory/categories?Col1=Name&Val1=Table',
    parameters: { Col1: 'Name', Val1: 'Table' },
    route: {...},
    hasParameters: true
  }
  ```

- `buildPath(path, parameters)` - Merges parameters into path, replacing duplicates

  ```javascript
  buildPath("inventory?Col1=Name", { Col2: "Value", Col1: "NewName" });
  // Returns: 'inventory?Col1=NewName&Col2=Value'
  ```

- `handleNavigateToPath(navigationData, appContext)` - Main navigation handler
  - Checks authentication
  - Parses target path
  - Detects same-base-path vs new-location navigation
  - Updates `appContext.currentPath`
  - Only closes menu on new-location navigation
  - Updates URL via URLRouter

**Route Registry Structure**:

```javascript
routes: {
  dashboard: { isMainSection: true, displayName: 'Dashboard' },
  inventory: {
    isMainSection: true,
    displayName: 'Inventory',
    icon: 'inventory',
    routes: {
      categories: { displayName: 'Categories' },
      'add-item': { displayName: 'Add Item' }
    }
  }
}
```

### URLRouter

**Purpose**: Synchronize application navigation with browser URL

**Key Features**:

- Hash-based routing (`#path?params`)
- Space encoding (replaces spaces with `+`)
- Browser back/forward support via `popstate` event
- Distinguishes browser navigation from app navigation via `isBrowserNavigation` flag

**Key Methods**:

- `updateURL(path)` - Updates browser URL without reloading page
- `handlePopState()` - Responds to browser back/forward buttons
- `getCurrentURLPath()` - Reads current path from `window.location.hash`

### App Component

**Purpose**: Main Vue app managing navigation state

**Key Reactive Properties**:

- `currentPath` (data) - Full path with parameters (e.g., `'schedule?DateSearch=show:2024-01-01,2024-12-31'`)
- `currentPage` (computed) - Base page from path (e.g., `'schedule'`)
- `containers` (computed) - Active container configurations based on path

**Navigation Flow**:

```javascript
User action → navigateToPath('schedule?params')
  ↓
handleNavigateToPath({ targetPath, isBrowserNavigation: false })
  ↓
currentPath = 'schedule?params'
  ↓
Components watch currentUrlParameters
  ↓
Components sync with new parameters
```

## Navigation Types

### 1. Same-Base-Path Navigation (Parameter Change)

**When**: Navigating to the same page with different parameters
**Example**: `schedule?DateSearch=show:2023...` → `schedule?DateSearch=show:2024...`

**Behavior**:

- Updates `currentPath`
- Updates browser URL
- **Keeps menu open**
- Components react to parameter changes
- Returns `{ action: 'parameter_change' }`

### 2. New-Location Navigation

**When**: Navigating to a different page
**Example**: `schedule` → `schedule/advanced-search`

**Behavior**:

- Updates `currentPath`
- Updates browser URL
- **Closes menu**
- Components load/unmount as needed
- Returns `{ action: 'navigate' }`

### 3. Browser Navigation (Back/Forward)

**When**: User clicks browser back/forward buttons

**Behavior**:

- `popstate` event triggers `handlePopState()`
- Calls `handleNavigateToPath()` with `isBrowserNavigation: true`
- Updates `currentPath` without calling `updateURL()` (prevents loop)
- Components react to new path

## URL Parameter Encoding

### Date Search Parameters

**Format**: `DateSearch=[mode:]value`

**Modes**:

- `show:` - Filter by precise show date
- `overlap:` - Filter by ship-to-return overlap range

**Examples**:

```
DateSearch=show:2024-01-01,2024-12-31        (year search by show date)
DateSearch=overlap:2024-01-01,2024-12-31     (year search by overlap)
DateSearch=show:-30,365                       (offset search by show date)
DateSearch=overlap:SHOW-2024-001              (overlap with specific show)
```

**Parsing**: `parseDateSearchParameter()` extracts mode and returns object:

```javascript
{
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  byShowDate: true  // true for 'show:', false for 'overlap:'
}
```

**Building**: `buildDateSearchParameter()` encodes mode into string:

```javascript
buildDateSearchParameter({
  startDate: "2024-01-01",
  endDate: "2024-12-31",
  byShowDate: true,
});
// Returns: 'show:2024-01-01,2024-12-31'
```

### Text Filter Parameters

**Format**: `Col[N]=column&Val[N]=value`

**Example**: `Col1=Show&Val1=Tech%20Expo&Col2=Client&Val2=ACME`

**Parsing**: `parseTextFilterParameters()` returns array:

```javascript
[
  { column: "Show", value: "Tech Expo" },
  { column: "Client", value: "ACME" },
];
```

**Building**: `buildTextFilterParameters()` returns object:

```javascript
{ Col1: 'Show', Val1: 'Tech Expo', Col2: 'Client', Val2: 'ACME' }
```

## Component Integration

### SavedSearchSelect Component

**Purpose**: Dropdown for year/saved search selection with URL sync

**Key Features**:

- Watches `currentUrlParameters` computed property
- Syncs dropdown selection with URL on changes
- Only applies default when URL has NO parameters
- User selections update URL, which triggers other components to sync

**Reactive Flow**:

```javascript
// Computed property extracts parameters for this component's path
currentUrlParameters() {
  const currentCleanPath = this.appContext.currentPath.split('?')[0];
  const containerCleanPath = this.containerPath.split('?')[0];

  if (currentCleanPath === containerCleanPath) {
    return NavigationRegistry.getNavigationParameters(this.appContext.currentPath);
  }
  return {};
}

// Watcher reacts to URL changes
watch: {
  currentUrlParameters(newParams, oldParams) {
    if (!oldParams) return; // Skip initial load
    if (JSON.stringify(newParams) === JSON.stringify(oldParams)) return;

    this.syncWithURL(); // Sync dropdown with new URL
  }
}
```

**Initialization Flow**:

1. `mounted()` - Initialize store and options
2. `syncWithURL()` - Check URL parameters
3. If parameters exist → parse and sync dropdown
4. If no parameters → apply default and navigate to it

**User Selection Flow**:

1. User selects option → `handleChange()`
2. `applyOption()` builds search data and parameters
3. `updateURL()` navigates to new path with parameters
4. URL change triggers watcher in this and other components
5. Components sync with new parameters

### ScheduleContent Component

**Purpose**: Main schedule view with table and search controls

**Key Features**:

- Receives `containerPath` prop (e.g., `'schedule'`)
- Passes `navigateToPath` to child components
- Handles `search-selected` event from SavedSearchSelect
- Transforms search data into filter format for ScheduleTable

**Search Data Flow**:

```javascript
handleSearchSelected(searchData) {
  if (!searchData) {
    this.filter = null; // Clear filter
    return;
  }

  if (searchData.type === 'year') {
    this.filter = {
      startDate: searchData.startDate,
      endDate: searchData.endDate,
      year: searchData.year,
      byShowDate: searchData.byShowDate
    };
  } else {
    this.applySavedSearch(searchData);
  }
}
```

### ScheduleAdvancedSearch Component

**Purpose**: Advanced search interface with date ranges and text filters

**Key Features**:

- Always uses `byShowDate: false` (overlap mode)
- Builds DateSearch with `overlap:` prefix
- Saves filters to URL via `saveFiltersToURL()`
- Loads filters from URL via `loadFiltersFromURL()`

## Best Practices

### For Component Developers

1. **Watch URL parameters, not path props**

   ```javascript
   // ✓ Good: Watch reactive URL parameters
   computed: {
     currentUrlParameters() {
       return NavigationRegistry.getNavigationParameters(this.appContext.currentPath);
     }
   },
   watch: {
     currentUrlParameters() { /* react to changes */ }
   }

   // ✗ Bad: Watch static path prop
   watch: {
     containerPath() { /* this rarely changes */ }
   }
   ```

2. **Use buildPath() for parameter updates**

   ```javascript
   // ✓ Good: Merges parameters
   const newPath = NavigationRegistry.buildPath(currentPath, { Col1: "Name" });

   // ✗ Bad: Manual string concatenation
   const newPath = currentPath + "?Col1=Name"; // Loses existing params
   ```

3. **Always use mode prefixes in DateSearch**

   ```javascript
   // ✓ Good: Explicit mode
   DateSearch: "show:2024-01-01,2024-12-31";

   // ✗ Bad: Unprefixed (ambiguous)
   DateSearch: "2024-01-01,2024-12-31";
   ```

4. **Navigate for user actions, sync for URL changes**

   ```javascript
   // User action: Navigate to update URL
   handleUserSelection() {
     this.navigateToPath(NavigationRegistry.buildPath(path, params));
   }

   // URL change: Sync component state
   watch: {
     currentUrlParameters() {
       this.syncWithURL();
     }
   }
   ```

### For Navigation Logic

1. **Check authentication before navigation**

   - Done automatically in `handleNavigateToPath()`
   - Prompts user if session expired

2. **Distinguish parameter changes from page changes**

   - Used to decide whether to close menu
   - Can be used for scroll position management

3. **Never duplicate parameter storage**
   - URL is the single source of truth
   - Parse parameters from `currentPath` when needed
   - Don't store parameters in separate reactive objects

## Common Patterns

### Pattern: Filtered List with URL Sync

```javascript
export const MyListComponent = {
  inject: ["appContext"],
  props: {
    containerPath: String,
    navigateToPath: Function,
  },
  computed: {
    currentUrlParameters() {
      const currentCleanPath = this.appContext.currentPath.split("?")[0];
      if (currentCleanPath === this.containerPath) {
        return NavigationRegistry.getNavigationParameters(
          this.appContext.currentPath
        );
      }
      return {};
    },
  },
  watch: {
    currentUrlParameters: {
      handler(newParams) {
        this.applyFilters(newParams);
      },
      deep: true,
    },
  },
  methods: {
    applyFilters(params) {
      // Parse params and update display
    },
    updateFilters(newFilters) {
      // User changed filters - navigate to update URL
      const path = NavigationRegistry.buildPath(this.containerPath, newFilters);
      this.navigateToPath(path);
    },
  },
};
```

### Pattern: Default Selection on Empty URL

```javascript
async mounted() {
  await this.loadData();

  const params = this.currentUrlParameters;
  if (Object.keys(params).length === 0) {
    // No URL parameters - apply default
    this.applyDefault();
  } else {
    // URL has parameters - sync with them
    this.syncWithURL();
  }
}
```

### Pattern: Multi-Component Coordination

When multiple components need to react to the same URL parameters:

1. Each component watches `currentUrlParameters`
2. User action in one component updates URL
3. URL change triggers watchers in all components
4. Each component syncs independently

```
User clicks year in SavedSearchSelect
  ↓
navigateToPath('schedule?DateSearch=show:2024-01-01,2024-12-31')
  ↓
currentPath updates
  ↓
┌────────────────────┬────────────────────┐
│ SavedSearchSelect  │ ScheduleTable      │
│ watcher fires      │ watcher fires      │
│ syncWithURL()      │ applyFilters()     │
│ selects "2024"     │ filters to 2024    │
└────────────────────┴────────────────────┘
```

## Troubleshooting

### Issue: Component not reacting to URL changes

**Cause**: Not watching `currentUrlParameters`

**Solution**: Add computed property and watcher:

```javascript
computed: {
  currentUrlParameters() {
    return NavigationRegistry.getNavigationParameters(this.appContext.currentPath);
  }
},
watch: {
  currentUrlParameters: {
    handler() { this.syncWithURL(); },
    deep: true
  }
}
```

### Issue: Parameters being overwritten instead of merged

**Cause**: Not using `buildPath()` or building query string manually

**Solution**: Always use `buildPath()`:

```javascript
const newPath = NavigationRegistry.buildPath(currentPath, newParams);
```

### Issue: Default always being applied even with URL params

**Cause**: Not checking for existing parameters before applying default

**Solution**: Check parameters first:

```javascript
if (Object.keys(this.currentUrlParameters).length === 0) {
  this.applyDefault();
}
```

### Issue: Infinite loop when navigating

**Cause**: Watcher calling navigation which triggers watcher again

**Solution**: Only navigate on user actions, sync on URL changes:

```javascript
// ✓ Good
watch: {
  currentUrlParameters() {
    this.syncStateWithoutNavigating();
  }
}

// ✗ Bad
watch: {
  currentUrlParameters() {
    this.navigateToPath(somePath); // Creates loop!
  }
}
```

## Future Considerations

### Potential Enhancements

1. **Navigation Guards**: Pre-navigation hooks for validation
2. **History Management**: Custom history stack for complex undo/redo
3. **Deep Linking**: Direct links to specific filtered views
4. **State Snapshots**: Save/restore complete navigation state
5. **Analytics Integration**: Track navigation patterns

### Deprecation Notes

- **Removed**: Separate `navigationParameters` reactive object (use URL parsing)
- **Removed**: `currentPage` data property (use computed from `currentPath`)
- **Removed**: `navigateToPage()` method (merged into `handleNavigateToPath()`)
- **Removed**: `isHandlingBrowserNavigation` flag and setTimeout workaround
- **Removed**: Separate `ByShowDate` URL parameter (use mode prefix in `DateSearch`)
- **Removed**: Unprefixed DateSearch format (always use `show:` or `overlap:` prefix)

## Summary

The navigation system provides a clean, reactive way to manage application state through URLs. By maintaining a single source of truth (`currentPath`), encoding all state in URL parameters, and using Vue's reactivity system, components stay synchronized automatically. The key is to **navigate on user actions** and **sync on URL changes**, never mixing the two flows.
