# Reactive Store System Features

## Core Store Management

- Vue 3 reactive data stores with automatic reactivity
- Singleton pattern with registry-based store caching
- Automatic store creation and retrieval by unique keys
- Deep cloning and data initialization on load/save

## Data Loading & Persistence

- Asynchronous API-based data loading with error handling
- Automatic save functionality with data cleaning
- Original data tracking for change detection
- Empty array initialization for robust operation
- Auto-reload of original data after save operations

## AppData System

- Automatic AppData initialization for all objects and nested arrays
- Recursive AppData setup for complex data structures
- Manual AppData manipulation methods (get/set for main and nested data)
- AppData preservation during data operations

## Analysis Configuration System

- Declarative analysis configuration using `createAnalysisConfig()`
- Automatic analysis execution when data loads/reloads
- Analysis result clearing and re-initialization on data reload
- Support for multiple analysis steps per store
- Custom API function integration with flexible parameters

## Analysis Processing Features

- Batch processing for UI responsiveness
- Progress tracking with percentage and custom messages
- Error isolation - individual analysis failures don't stop the process
- Nested data processing (e.g., Items within Crates)
- Source column specification for targeted data extraction
- Additional parameter passing to API functions

## Data Manipulation

- Row addition with automatic AppData initialization
- Nested row addition for complex data structures
- Row deletion marking and cleanup
- Field initialization with default values
- Marked-for-deletion filtering during save operations

## State Management

- Loading state tracking with custom messages
- Error state management with message storage
- Analysis state tracking (isAnalyzing, progress, messages)
- Store reset functionality

## UI Integration Features

- Real-time progress reporting during analysis
- Custom loading messages for different operations
- Analysis progress messages with step-by-step feedback
- Automatic progress clearing after completion

## Performance & Reliability

- Configurable batch sizes for processing control
- Delay management for UI responsiveness
- Skip-if-analyzed option for performance optimization
- Comprehensive error handling and recovery
- Promise-based asynchronous operations

## Developer Experience

- Simple declarative configuration
- Automatic lifecycle management
- No manual step creation required
- Consistent parameter structure
- Comprehensive documentation and examples

## Advanced Configuration Options

- Auto-load control for store initialization
- Configurable analysis delays and batch sizes
- Nested array key specification for complex data structures
- Additional parameter arrays for API function flexibility
- Custom result key naming for organized data storage

## Example Usage

```javascript
// Define analysis steps
const analysisConfig = [
  createAnalysisConfig(
    Requests.getItemInfo, // API function
    "itemInfo", // Result key in AppData
    "Loading item info...", // UI label
    "itemId", // Source column (or null for entire item)
    ["details"], // Additional parameters
    "Items" // Also process nested 'Items' arrays
  ),
  createAnalysisConfig(
    Requests.checkQuantity,
    "quantityStatus",
    "Checking quantities...",
    "itemId"
  ),
];

// Create store with analysis
const store = getReactiveStore(
  Requests.getPackList, // Load function
  Requests.savePackList, // Save function
  [tabName], // API arguments
  analysisConfig // Analysis configuration
);

// Results will be stored in item.AppData[resultKey] automatically after data loads
```

## Key Benefits

- **Automatic analysis execution** when data loads/reloads
- **Results cleared and re-analyzed** on each data load
- **Support for nested data processing** (e.g., Items within Crates)
- **Progress tracking** with meaningful UI labels
- **Error isolation** - individual analysis failures don't stop the process
- **Declarative configuration** - no manual step creation needed
