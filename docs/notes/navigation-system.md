# Navigation System Documentation

## Overview

The TopShelfLiveInventory application uses a hash-based URL routing system with JSON parameters, built on Vue 3 reactivity. The navigation system maintains application state in URLs and supports both regular page navigation and dashboard containers with independent parameter persistence.

## Core Principles

1. **Single Source of Truth**: `appContext.currentPath` contains the full path with JSON parameters
2. **URL = State**: Navigation state is encoded in URLs, with dashboard containers storing their own paths
3. **JSON Parameters**: Uses readable JSON format: `#route?{"param":"value"}` instead of query strings
4. **Context-Aware Parameters**: Components retrieve parameters differently based on dashboard vs regular navigation
5. **Parameter Merging**: New parameters merge with existing ones via `buildPath()`
6. **Dashboard Persistence**: Dashboard containers maintain their own parameter state in DashboardRegistry

## Architecture

### Three-Layer Structure

```
┌─────────────────────────────────────────────────────┐
│  UI Layer (Vue Components)                          │
│  - SavedSearchSelect, ScheduleContent, etc.         │
│  - Use getParametersForContainer() for params       │
│  - Emit events, call navigateToPath()               │
│  - Update dashboard via updatePath() when on dash   │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  Navigation Registry                                 │
│  - Route definitions and metadata                    │
│  - handleNavigateToPath() - main entry point        │
│  - parsePath() / buildPath() - JSON parameters      │
│  - getParametersForContainer() - context-aware      │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  URL Router + Dashboard Registry                     │
│  - Browser history sync (pushState/popState)        │
│  - Hash-based URL: #path?{json}                     │
│  - Dashboard: stores container paths with params    │
└─────────────────────────────────────────────────────┘
```

## URL Format

### JSON Path Segments

**Format**: `#route?{"param":"value","another":"data"}`

**Example**: `#schedule?{"dateSearch":"0,30","searchMode":"upcoming"}`

**Key Features**:

- Unencoded JSON in hash fragment (human-readable)
- Browser may encode on paste: automatically decoded via `decodeURIComponent()`
- `?` delimiter separates route from parameters
- Parameters are parsed/built via `parseJsonPathSegment()` / `buildJsonPathSegment()`

## Key Components

### NavigationRegistry

**Purpose**: Central registry for routes and navigation logic

**Key Methods**:

- `parseJsonPathSegment(jsonString)` - Parses JSON parameter string into object

  ```javascript
  parseJsonPathSegment('{"dateSearch":"0,30","mode":"upcoming"}');
  // Returns: { dateSearch: '0,30', mode: 'upcoming' }
  ```

- `buildJsonPathSegment(parameters)` - Converts object to JSON string

  ```javascript
  buildJsonPathSegment({ dateSearch: "0,30", mode: "upcoming" });
  // Returns: '{"dateSearch":"0,30","mode":"upcoming"}'
  ```

- `parsePath(path)` - Splits path and JSON parameters, decodes URL encoding

  ```javascript
  parsePath('schedule?{"dateSearch":"0,30"}')
  // Returns:
  {
    path: 'schedule',
    fullPath: 'schedule?{"dateSearch":"0,30"}',
    parameters: { dateSearch: '0,30' },
    route: {...},
    hasParameters: true
  }
  ```

- `buildPath(path, parameters)` - Merges parameters into path, replacing duplicates

  ```javascript
  buildPath('schedule?{"dateSearch":"0,30"}', {
    mode: "upcoming",
    dateSearch: "0,60",
  });
  // Returns: 'schedule?{"dateSearch":"0,60","mode":"upcoming"}'
  ```

- `getNavigationParameters(path)` - Extracts parameters from a path

  ```javascript
  getNavigationParameters('schedule?{"dateSearch":"0,30"}');
  // Returns: { dateSearch: '0,30' }
  ```

- `getParametersForContainer(containerPath, currentPath)` - **Context-aware parameter retrieval**

  **This is the preferred method for components to get their parameters**

  - On dashboard: Retrieves parameters from DashboardRegistry
  - Not on dashboard: Retrieves parameters from currentPath if paths match
  - Handles the complexity of different contexts automatically

  ```javascript
  // On dashboard page (currentPath = 'dashboard')
  getParametersForContainer("schedule", "dashboard");
  // Returns parameters stored in dashboard registry for schedule container

  // On regular page (currentPath = 'schedule?{"dateSearch":"0,30"}')
  getParametersForContainer("schedule", 'schedule?{"dateSearch":"0,30"}');
  // Returns: { dateSearch: '0,30' }

  // Wrong page (currentPath = 'inventory')
  getParametersForContainer("schedule", "inventory");
  // Returns: {}
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
  dashboard: {
    isMainSection: true,
    displayName: 'Dashboard',
    children: {}
  },
  schedule: {
    isMainSection: true,
    displayName: 'Schedule',
    icon: 'event',
    children: {
      'advanced-search': { displayName: 'Advanced Search' }
    }
  }
}
```

### DashboardRegistry

**Purpose**: Manages dashboard container persistence with parameter state

**Key Features**:

- Stores full container paths including parameters
- Compares clean paths (without params) for matching
- Auto-saves changes with 5-second debounce
- Integrated with NavigationRegistry

**Key Methods**:

- `has(containerPathWithParams)` - Check if container is on dashboard (compares clean paths)
- `getContainer(containerPathWithParams)` - Get container with its stored path (compares clean paths)
- `add(containerPathWithParams)` - Add container to dashboard with parameters
- `updatePath(cleanPath, newPathWithParams)` - Update container's path with new parameters
- `remove(containerPathWithParams)` - Remove container from dashboard
- `toggleClass(containerPathWithParams, className)` - Toggle CSS class (wide/tall)

**Data Structure**:

```javascript
containers: [
  { path: 'schedule?{"dateSearch":"0,30"}', classes: "wide" },
  { path: "inventory", classes: "" },
];
```

### URLRouter

**Purpose**: Synchronize application navigation with browser URL

**Key Features**:

- Hash-based routing (`#path?{json}`)
- Space encoding (replaces spaces with `+` in URL)
- Browser back/forward support via `popstate` event
- Distinguishes browser navigation from app navigation

**Key Methods**:

- `updateURL(path)` - Updates browser URL without reloading page
- `handlePopState()` - Responds to browser back/forward buttons
- `getCurrentURLPath()` - Reads current path from `window.location.hash`

### Component Integration Pattern

**Purpose**: Components retrieve parameters context-aware for both regular and dashboard navigation

**Reactive Flow**:

```javascript
computed: {
  currentUrlParameters() {
    if (!this.appContext?.currentPath) return {};

    // Use context-aware parameter retrieval
    return NavigationRegistry.getParametersForContainer(
      this.containerPath,
      this.appContext.currentPath
    );
  }
},
watch: {
  currentUrlParameters: {
    handler(newParams) {
      this.syncWithURL(); // React to parameter changes
    },
    deep: true
  }
}
```

**Update Flow (with dashboard support)**:

```javascript
methods: {
  updateFilters(newParams) {
    const isOnDashboard = this.appContext.currentPath.split('/')[0] === 'dashboard';

    if (isOnDashboard) {
      // On dashboard: update dashboard registry
      const newPath = NavigationRegistry.buildPath(this.containerPath, newParams);
      dashboardRegistry.updatePath(this.containerPath.split('?')[0], newPath);
    } else {
      // Regular navigation: update URL
      const newPath = NavigationRegistry.buildPath(this.containerPath, newParams);
      this.navigateToPath(newPath);
    }
  }
}
```

## Navigation Flow

### Regular Navigation Flow

```
User action → Component updates parameters
  ↓
navigateToPath(buildPath(containerPath, newParams))
  ↓
handleNavigateToPath({ targetPath, isBrowserNavigation: false })
  ↓
appContext.currentPath = newPath
  ↓
URLRouter.updateURL() - updates browser address bar
  ↓
Components' currentUrlParameters computed updates
  ↓
Watchers fire → components sync with new parameters
```

### Dashboard Navigation Flow

```
User action on dashboard container → Component updates parameters
  ↓
dashboardRegistry.updatePath(containerPath, buildPath(containerPath, newParams))
  ↓
Dashboard registry stores new path with parameters
  ↓
Components' getParametersForContainer() reads from dashboard registry
  ↓
currentUrlParameters computed updates
  ↓
Watchers fire → components sync with new parameters
  ↓
(Browser URL stays as #dashboard - container params stored in registry)
```

### Browser Back/Forward

```
User clicks back/forward
  ↓
popstate event fires
  ↓
URLRouter.handlePopState()
  ↓
handleNavigateToPath({ targetPath, isBrowserNavigation: true })
  ↓
appContext.currentPath = pathFromURL
  ↓
(No updateURL call - prevents loop)
  ↓
Components react to currentPath change
```

## Parameter Handling

### JSON Parameter Format

All parameters use JSON format in URLs for readability and type preservation:

```javascript
// Build parameters
const params = { dateSearch: "0,30", mode: "upcoming", isActive: true };
const path = NavigationRegistry.buildPath("schedule", params);
// Result: 'schedule?{"dateSearch":"0,30","mode":"upcoming","isActive":true}'

// Parse parameters
const pathInfo = NavigationRegistry.parsePath('schedule?{"dateSearch":"0,30"}');
// pathInfo.parameters = { dateSearch: '0,30' }
```

### Parameter Merging

`buildPath()` automatically merges new parameters with existing ones:

```javascript
const currentPath = 'schedule?{"dateSearch":"0,30","mode":"upcoming"}';
const newPath = NavigationRegistry.buildPath(currentPath, {
  mode: "past", // Replaces existing
  filter: "active", // Adds new
});
// Result: 'schedule?{"dateSearch":"0,30","mode":"past","filter":"active"}'
```

### Context-Aware Parameter Retrieval

Components should always use `getParametersForContainer()` to retrieve parameters:

```javascript
// ✓ CORRECT: Context-aware retrieval
computed: {
  currentUrlParameters() {
    return NavigationRegistry.getParametersForContainer(
      this.containerPath,
      this.appContext.currentPath
    );
  }
}

// ✗ INCORRECT: Direct parsing doesn't handle dashboard
computed: {
  currentUrlParameters() {
    return NavigationRegistry.getNavigationParameters(this.appContext.currentPath);
    // Fails on dashboard - returns {} because currentPath is 'dashboard'
  }
}
```

## Component Examples

### SavedSearchSelect Component

**Purpose**: Dropdown for year/saved search selection with URL sync and dashboard support

**Key Implementation**:

```javascript
computed: {
  isOnDashboard() {
    return this.appContext.currentPath.split('/')[0] === 'dashboard';
  },

  // Context-aware parameter retrieval
  currentUrlParameters() {
    if (!this.appContext?.currentPath) return {};
    return NavigationRegistry.getParametersForContainer(
      this.containerPath,
      this.appContext.currentPath
    );
  }
},

watch: {
  currentUrlParameters(newParams, oldParams) {
    if (!oldParams) return; // Skip initial load
    if (JSON.stringify(newParams) === JSON.stringify(oldParams)) return;
    this.syncWithURL(); // Sync dropdown with new URL
  }
},

methods: {
  updateURL(params) {
    if (this.isOnDashboard) {
      // Update dashboard registry
      const newPath = NavigationRegistry.buildPath(this.containerPath, params);
      dashboardRegistry.updatePath(
        this.containerPath.split('?')[0],
        newPath
      );
    } else {
      // Regular navigation
      const newPath = NavigationRegistry.buildPath(this.containerPath, params);
      this.navigateToPath(newPath);
    }
  }
}
```

### ScheduleContent Component

**Purpose**: Main schedule view coordinating search and table display

**Key Features**:

- Receives `containerPath` prop (e.g., `'schedule'`)
- Passes `navigateToPath` to child components
- Handles `search-selected` event from SavedSearchSelect
- Transforms search data into filter format for ScheduleTable

## Best Practices

### For Component Developers

1. **Always use getParametersForContainer() for parameter retrieval**

   ```javascript
   // ✓ CORRECT: Context-aware, works everywhere
   computed: {
     currentUrlParameters() {
       return NavigationRegistry.getParametersForContainer(
         this.containerPath,
         this.appContext.currentPath
       );
     }
   }

   // ✗ INCORRECT: Path comparison fails on dashboard
   computed: {
     currentUrlParameters() {
       const currentCleanPath = this.appContext.currentPath.split('?')[0];
       if (currentCleanPath === this.containerPath) {
         return NavigationRegistry.getNavigationParameters(this.appContext.currentPath);
       }
       return {};
     }
   }
   ```

2. **Use buildPath() for parameter updates**

   ```javascript
   // ✓ CORRECT: Merges parameters
   const newPath = NavigationRegistry.buildPath(currentPath, {
     mode: "upcoming",
   });

   // ✗ INCORRECT: Manual JSON loses existing params
   const newPath = currentPath + '?{"mode":"upcoming"}';
   ```

3. **Check dashboard context when updating parameters**

   ```javascript
   // ✓ CORRECT: Updates dashboard registry or navigates appropriately
   updateFilters(newParams) {
     const isOnDashboard = this.appContext.currentPath.split('/')[0] === 'dashboard';
     const newPath = NavigationRegistry.buildPath(this.containerPath, newParams);

     if (isOnDashboard) {
       dashboardRegistry.updatePath(this.containerPath.split('?')[0], newPath);
     } else {
       this.navigateToPath(newPath);
     }
   }

   // ✗ INCORRECT: Always navigates, doesn't persist dashboard state
   updateFilters(newParams) {
     const newPath = NavigationRegistry.buildPath(this.containerPath, newParams);
     this.navigateToPath(newPath);
   }
   ```

4. **Navigate for user actions, sync for URL changes**

   ```javascript
   // User action: Update parameters
   handleUserSelection() {
     this.updateFilters({ mode: 'upcoming' });
   }

   // URL change: Sync component state
   watch: {
     currentUrlParameters() {
       this.syncWithURL();
     }
   }
   ```

### For Navigation Logic

1. **Check authentication before navigation** - Done automatically in `handleNavigateToPath()`

2. **Distinguish parameter changes from page changes** - Used to decide whether to close menu

3. **Never duplicate parameter storage**
   - Regular navigation: URL is the source of truth
   - Dashboard: DashboardRegistry stores container paths
   - Components read via `getParametersForContainer()`

## Common Patterns

### Pattern: Component with URL Sync and Dashboard Support

```javascript
export const MyComponent = {
  inject: ["appContext"],
  props: {
    containerPath: String,
    navigateToPath: Function,
  },

  computed: {
    isOnDashboard() {
      return this.appContext.currentPath.split("/")[0] === "dashboard";
    },

    // Context-aware parameter retrieval
    currentUrlParameters() {
      if (!this.appContext?.currentPath) return {};
      return NavigationRegistry.getParametersForContainer(
        this.containerPath,
        this.appContext.currentPath
      );
    },
  },

  watch: {
    currentUrlParameters: {
      handler(newParams) {
        this.syncWithURL(newParams);
      },
      deep: true,
    },
  },

  methods: {
    syncWithURL(params) {
      // Update component state from parameters
      this.mode = params.mode || "default";
      this.filter = params.filter || "";
    },

    updateParameters(newParams) {
      const newPath = NavigationRegistry.buildPath(
        this.containerPath,
        newParams
      );

      if (this.isOnDashboard) {
        // On dashboard: update registry
        dashboardRegistry.updatePath(this.containerPath.split("?")[0], newPath);
      } else {
        // Regular navigation: update URL
        this.navigateToPath(newPath);
      }
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
    this.syncWithURL(params);
  }
}
```

### Pattern: Multi-Component Coordination

When multiple components need to react to the same URL parameters:

**Regular Navigation:**

```
User changes filter in ComponentA
  ↓
ComponentA.updateParameters({ filter: 'new' })
  ↓
navigateToPath('schedule?{"filter":"new"}')
  ↓
appContext.currentPath updates
  ↓
┌────────────────────┬────────────────────┐
│ ComponentA         │ ComponentB         │
│ watcher fires      │ watcher fires      │
│ syncWithURL()      │ syncWithURL()      │
└────────────────────┴────────────────────┘
```

**Dashboard Navigation:**

```
User changes filter in ComponentA on dashboard
  ↓
ComponentA.updateParameters({ filter: 'new' })
  ↓
dashboardRegistry.updatePath('schedule', 'schedule?{"filter":"new"}')
  ↓
getParametersForContainer() returns new params
  ↓
┌────────────────────┬────────────────────┐
│ ComponentA         │ ComponentB         │
│ watcher fires      │ watcher fires      │
│ syncWithURL()      │ syncWithURL()      │
└────────────────────┴────────────────────┘
```

## Troubleshooting

### Issue: Component not reacting to URL changes

**Cause**: Not watching `currentUrlParameters` or not using `getParametersForContainer()`

**Solution**: Use the standard pattern:

```javascript
computed: {
  currentUrlParameters() {
    return NavigationRegistry.getParametersForContainer(
      this.containerPath,
      this.appContext.currentPath
    );
  }
},
watch: {
  currentUrlParameters: {
    handler() { this.syncWithURL(); },
    deep: true
  }
}
```

### Issue: Parameters empty on dashboard

**Cause**: Using direct path comparison instead of `getParametersForContainer()`

**Solution**: Always use context-aware retrieval:

```javascript
// ✓ CORRECT
NavigationRegistry.getParametersForContainer(
  containerPath,
  appContext.currentPath
);

// ✗ INCORRECT - fails on dashboard
if (appContext.currentPath.includes("schedule")) {
  return NavigationRegistry.getNavigationParameters(appContext.currentPath);
}
```

### Issue: Dashboard parameters not persisting

**Cause**: Using `navigateToPath()` instead of `dashboardRegistry.updatePath()`

**Solution**: Check context before updating:

```javascript
updateParameters(newParams) {
  const newPath = NavigationRegistry.buildPath(this.containerPath, newParams);
  const isOnDashboard = this.appContext.currentPath.split('/')[0] === 'dashboard';

  if (isOnDashboard) {
    dashboardRegistry.updatePath(this.containerPath.split('?')[0], newPath);
  } else {
    this.navigateToPath(newPath);
  }
}
```

### Issue: Parameters being overwritten instead of merged

**Cause**: Not using `buildPath()` or building JSON manually

**Solution**: Always use `buildPath()`:

```javascript
// ✓ CORRECT
const newPath = NavigationRegistry.buildPath(currentPath, newParams);

// ✗ INCORRECT
const newPath = currentPath.split("?")[0] + "?" + JSON.stringify(newParams);
```

### Issue: JSON parsing error on URL load

**Cause**: Browser URL-encodes the JSON when user pastes or bookmarks

**Solution**: Already handled - `parsePath()` uses `decodeURIComponent()` before parsing

### Issue: Default always being applied even with URL params

**Cause**: Not checking for existing parameters before applying default

**Solution**: Check parameters first:

```javascript
if (Object.keys(this.currentUrlParameters).length === 0) {
  this.applyDefault();
} else {
  this.syncWithURL(this.currentUrlParameters);
}
```

### Issue: Infinite loop when navigating

**Cause**: Watcher calling navigation which triggers watcher again

**Solution**: Only navigate on user actions, sync on URL changes:

```javascript
// ✓ CORRECT
watch: {
  currentUrlParameters() {
    this.syncStateWithoutNavigating();
  }
}

// ✗ INCORRECT
watch: {
  currentUrlParameters() {
    this.navigateToPath(somePath); // Creates loop!
  }
}
```

## Summary

The navigation system provides a clean, reactive way to manage application state through URLs and dashboard persistence:

- **Regular Navigation**: State encoded in URL using JSON format (`#route?{"param":"value"}`)
- **Dashboard Navigation**: Container paths with parameters stored in DashboardRegistry
- **Context-Aware**: Components use `getParametersForContainer()` to retrieve parameters correctly in both contexts
- **Single Source of Truth**: Regular pages use URL, dashboard containers use registry
- **Reactive Updates**: Components watch parameters and sync automatically
- **Best Practice**: Navigate on user actions, sync on parameter changes

The key is to **always use `getParametersForContainer()`** for reading parameters, **check dashboard context** when updating, and **never mix the read/write flows**.
