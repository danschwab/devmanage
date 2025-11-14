# Show Inventory Report Implementation

## Overview

This document describes the implementation of the Show Inventory Report feature, which allows users to view inventory quantities across multiple shows selected from saved searches.

## Features Implemented

### 1. Multi-Show Item Extraction

- **File**: `docs/js/data_management/abstraction/packlist-utils.js`
- **Method**: `extractItemsFromMultipleShows(deps, projectIdentifiers)`
- Extracts items from multiple show pack lists
- Aggregates quantities per show while tracking each show's usage separately
- Returns array of items with structure:
  ```javascript
  {
    itemId: "ITEM-123",
    totalQuantity: 15,
    shows: {
      "ShowA_ClientX_2025": 5,
      "ShowB_ClientY_2025": 10
    },
    tabName: null,    // filled by analysis
    available: null,  // filled by analysis
    remaining: null   // filled by analysis
  }
  ```

### 2. API Method

- **File**: `docs/js/data_management/api.js`
- **Method**: `getMultipleShowsItemsSummary(deps, projectIdentifiers)`
- Provides API access to the multi-show extraction utility
- Integrates with caching system for performance

### 3. Show Inventory Report Component

- **File**: `docs/js/application/components/content/ShowInventoryReport.js`
- **Component**: `ShowInventoryReport`

#### Key Features:

- **Saved Search Dropdown**: Loads list of saved searches from user data
- **Dynamic Columns**: Table columns adapt based on number of shows loaded
- **URL Parameter Support**: Can load specific search via `?savedSearch=SearchName`
- **Progressive Analysis**:
  1. Get inventory tab names for items
  2. Get inventory quantities for items
  3. Calculate remaining quantity (inventory - Σ show quantities)

#### Table Columns:

- Thumbnail (Item Image)
- Item # (clickable, navigates to inventory search)
- Inv Qty. (Inventory total quantity)
- [Dynamic show columns] (One per loaded show, narrow width)
- Remaining (Inventory - all show usage, with auto-coloring)

### 4. Integration with Inventory Section

- **File**: `docs/js/application/components/content/InventoryContent.js`

#### Changes Made:

- Imported `ShowInventoryReport` component
- Added component to components registry
- Added navigation button to main inventory page
- Registered route: `inventory/reports/show-inventory`
- Added button on Reports page to access the feature
- Configured route in NavigationRegistry with proper icon and title

### 5. Export Configuration

- **File**: `docs/js/application/index.js`
- Added `ShowInventoryReport` to module exports for use throughout application

## Usage Instructions

### Access the Report:

1. Navigate to **Inventory** → **Reports**
2. Click **Show Inventory Report** button
3. Or navigate directly to: `#inventory/reports/show-inventory`

### Generate a Report:

1. Select a saved search from the dropdown (e.g., "Upcoming")
2. The system will:
   - Load all shows matching the search criteria
   - Extract items from all show pack lists
   - Display items with quantities per show
   - Calculate inventory quantities
   - Show remaining available inventory

### Using URL Parameters:

- Navigate with: `#inventory/reports/show-inventory?savedSearch=Upcoming`
- The report will automatically load the specified search

## Technical Details

### Data Flow:

1. User selects saved search → `handleSearchSelection()`
2. Parse search criteria → `loadShowsFromSearch()`
3. Call `Requests.getOverlappingShows()` with filters
4. Extract show identifiers
5. Initialize reactive store with `getMultipleShowsItemsSummary()`
6. Store loads data and runs analysis pipeline:
   - Tab name lookup
   - Inventory quantity lookup
   - Remaining quantity calculation
7. Table displays results with dynamic columns

### Performance Optimizations:

- Leverages existing cache for `extractItems()` calls
- Parallel analysis execution where possible
- Error handling for missing/invalid pack lists
- Progress tracking with meaningful UI messages

### Reactive Store Configuration:

```javascript
const analysisConfig = [
  // Step 1: Get tab names
  createAnalysisConfig(
    Requests.getTabNameForItem,
    "tabName",
    "Getting inventory tab names...",
    ["itemId"],
    [],
    "tabName"
  ),
  // Step 2: Get inventory quantities
  createAnalysisConfig(
    Requests.getItemInventoryQuantity,
    "available",
    "Getting inventory quantities...",
    ["itemId"],
    [],
    "available"
  ),
  // Step 3: Calculate remaining
  createAnalysisConfig(
    (itemId, shows, available) => {
      if (available === null) return null;
      const totalUsed = Object.values(shows || {}).reduce(
        (sum, qty) => sum + (qty || 0),
        0
      );
      return available - totalUsed;
    },
    "remaining",
    "Calculating remaining quantities...",
    ["itemId", "shows", "available"],
    [],
    "remaining"
  ),
];
```

## Testing Checklist

- [ ] Navigate to inventory/reports/show-inventory
- [ ] Dropdown populates with saved searches
- [ ] Selecting a search loads shows successfully
- [ ] Show count displays correctly
- [ ] All items from selected shows appear in table
- [ ] Each show has its own column with quantities
- [ ] Inventory quantities load and display
- [ ] Remaining calculation is accurate
- [ ] Item images display correctly
- [ ] Clicking item # navigates to inventory with search
- [ ] Search functionality filters table correctly
- [ ] Refresh button reloads data
- [ ] URL parameter `?savedSearch=Name` works
- [ ] Error handling for invalid searches
- [ ] Loading states display properly
- [ ] Analysis progress shows correctly

## Future Enhancements

Potential improvements to consider:

- Export report to CSV/PDF
- Save custom report configurations
- Filter by item category or tab
- Highlight items with insufficient inventory
- Show trend analysis over time
- Add threshold warnings for low stock
- Compare reports across different time periods
- Add visual charts/graphs for quantities

## Files Modified

1. `docs/js/data_management/abstraction/packlist-utils.js` - Added utility method
2. `docs/js/data_management/api.js` - Added API method
3. `docs/js/application/components/content/ShowInventoryReport.js` - New component
4. `docs/js/application/components/content/InventoryContent.js` - Integration
5. `docs/js/application/index.js` - Export configuration

## Notes

- This implementation follows all existing architectural patterns
- Maintains modularity and separation of concerns
- Integrates seamlessly with existing caching and reactive store systems
- Uses the same saved search data as the Schedule component for consistency
- Dynamic column generation allows for any number of shows without code changes
