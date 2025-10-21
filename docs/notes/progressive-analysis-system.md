# Progressive Analysis System for Item Quantities

## Overview

This system implements a progressive analysis approach where each analysis step builds upon the previous ones, leveraging the caching system for optimal performance.

## Data Flow

### Initial Data Function

```javascript
Requests.getItemQuantitiesSummary(projectIdentifier);
```

**Returns:** Array of item objects

```javascript
[
  {
    itemId: "TABLE-001",
    quantity: 2,
    available: null,
    remaining: null,
    overlappingShows: [],
  },
  {
    itemId: "CAB-004",
    quantity: 4,
    available: null,
    remaining: null,
    overlappingShows: [],
  },
];
```

### Analysis Step 1: Inventory Quantities

```javascript
Requests.getItemInventoryQuantity(itemId);
```

- **Input:** itemId from each row
- **Output:** Available inventory quantity (number)
- **Updates:** `available` column
- **Result:** `{ itemId: "TABLE-001", quantity: 2, available: 10, remaining: null, overlappingShows: [] }`

### Analysis Step 2: Overlapping Shows

```javascript
Requests.getItemOverlappingShows(currentProjectId, itemId);
```

- **Input:** itemId + current project identifier
- **Output:** Array of conflicting project identifiers
- **Updates:** `overlappingShows` column
- **Leverages:** Cached results from `ProductionUtils.getOverlappingShows()` and `PackListUtils.extractItems()`

### Analysis Step 3: Remaining Calculation

```javascript
Requests.calculateRemainingQuantity(itemData);
```

- **Input:** Complete item object (with results from steps 1 & 2)
- **Output:** Calculated remaining quantity
- **Updates:** `remaining` column
- **Leverages:** Cached results from previous analyses

## Implementation Benefits

### 🔄 **Progressive Enhancement**

- Each step adds more information
- Early steps can display partial results immediately
- Later steps refine and complete the analysis

### ⚡ **Cache Efficiency**

- Step 2 leverages cached overlapping project data
- Step 3 reuses cached item extraction results
- No duplicate API calls for the same data

### 🎯 **Focused Responsibility**

- Each analysis function has a single, clear purpose
- Easy to debug and maintain individual steps
- Can be reused in other contexts

### 📊 **Progressive UI Updates**

- Users see inventory quantities first (fast)
- Then overlapping shows appear (moderate)
- Finally remaining calculations complete (comprehensive)

## Visual Result

| Item #    | Quantity | Available | Remaining | Overlapping Shows              |
| --------- | -------- | --------- | --------- | ------------------------------ |
| TABLE-001 | 2        | 10        | 6         | PROJECT_A_2025, PROJECT_B_2025 |
| CAB-004   | 4        | 8         | 4         | None                           |
| CHAIR-012 | 8        | 12        | -4        | PROJECT_C_2025, PROJECT_D_2025 |

## Color Coding

- **Green (remaining > 0):** Sufficient inventory
- **Orange (remaining = 0):** Exact match - no buffer
- **Red (remaining < 0):** Inventory shortage

## Integration

The `PacklistItemsSummary` component automatically appears below the main packlist table when not in edit mode, providing instant visibility into inventory status and conflicts.

## Cache Dependencies

```
Step 1: InventoryUtils.getItemInfo(itemId, ['quantity'])
Step 2: ProductionUtils.getOverlappingShows() → PackListUtils.extractItems()
Step 3: Reuses cached results from Steps 1 & 2
```

This ensures optimal performance while providing comprehensive analysis results.
