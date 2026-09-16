# Copilot Instructions for TopShelfLiveInventory

Do not make extra markdown files or documentation files unless requested. For Example, never make: "docs/notes/implimentation-complete.md" or "docs/notes/summary-of-work.md".

This application is now live with actual users. We are working on a development branch, but we need to consider backwards compatibility of data structures, or admin-initiated one-time migration plans.
Prioritize simplicity and modularity. Prioritize removing unused code. Adding new systems should only be done if absolutely necessary.
If possible, always work within the existing application structure and patterns.

## Project Overview

This is Top Shelf Exhibits' modular JavaScript web application for live inventory management. Top Shelf Exhibits structures work into domains:

- Inventories: lists of items and current item information. Items are stored in a warehouse in crates. These inventories are used to manage the items available for shows.
- Pack Lists: lists of items to be packed in crates for a show, including quantities and other details. These lists are used to prepare items to ship to shows and return items from shows.
- Production Schedule: a schedule of shows and their related production tasks. This schedule is used to manage the timing and logistics of shows.

The codebase is organized under `docs/`, with subfolders for CSS, images, JS, and notes. The main logic resides in `docs/js/`, split into functional domains:

- **application/**: The user interface is written using Vue 3. It manages its own reactive data during the application lifecycle and only interacts with persistent data through the API layer. UI logic is split into reusable Vue components by domain (e.g., `InventoryTable.js`, `modalComponent.js`).
- **data_management/**: The API acts as an interface between the application and data manipulation functions. It manages caching and cache invalidation automatically via wrapper methods. All data access and mutation should go through the API, not directly to Google Sheets or the database abstraction.
- **google_sheets_services/**: All user and app data is stored in Google Sheets. This layer contains all direct interaction with Google Sheets, including authentication, queries, and Google-specific logic. All persistent data flows through this layer, and it should not be accessed directly by the UI or application logic.

## Key Patterns & Conventions (by Domain)

### Vue Application (UI)

- UI components manage their own reactive state and lifecycle using Vue 3.
- All persistent data operations are performed via the API layer; never access data directly.
- UI logic is split into reusable Vue components by domain

### API/Data Management

- API provides a clean interface for the application to interact with data.
- The API references abstractions based on domains:
  - database.js: contains the database abstraction layer which provides methods for interacting with Google Sheets Services. Database mutation methods invalidate database get caches to begin invalidation chains from the bottom.
  - application-utils.js: contains data management functions for application-specific operations, such as storing and retrieving user data.
- All data access and mutation goes through the API to the abstractions and eventually to Google Sheets if necessary.
- The abstraction layer handles caching and cache invalidation automatically using `wrapMethods` and `deps.call()` for consistent method exposure and calling. Manual cache invalidation is discouraged.
- reusable uncached utility functions for data analysis are placed in `utils/helper.js`. These utilities must never directly call cached functions since this would break inalidation chains.

### Google Sheets Services

- Contains all direct interaction with Google Sheets, including authentication, queries, and Google-specific logic.
- All persistent data flows through this layer, and it should not be accessed directly by the UI or application logic.

## Developer Workflow

We are NOT explicitly running a local python or Node.js server.
The VSCode extension LiveServer is running a local server at 'http://127.0.0.1:5500/docs/#'.

### Vue Application (UI)

- No build step: JS/CSS/HTML are used directly; changes are reflected immediately. However, access to Google Sheets data requires the site to be deployed on a web server.
- Debugging: Use browser console logging and Vue devtools for runtime issues.

### API/Data Management

- database abstraction layer automatically switches between fake and real google sheets access based on it's environment.
- Debug using console logs and inspect API responses.
- Manual testing of API endpoints and wrapper methods.

### Google Sheets Services

- Any changes in google sheets services must be reflected in FakeGoogle.js for local testing.
- Debug using logs for Google Sheets queries and authentication.
- Manual verification of data in Google Sheets.

### Test Suite

A console test runner lives at `docs/js/tests/tests.js`. It runs automatically on every localhost load (after `app.js` mounts) via a conditional `isLocalhost()` import. It does not run in production.
Tests call `Requests.*` directly against the FakeGoogle data layer — no mocks, no test framework. Output appears in the browser console grouped by test group with ✓/✗ per test and a pass/fail summary line.

- Add a test group whenever you build a new cross-layer feature (e.g. transshipment, a new analysis type, a new packlist operation).
- Add regression tests for any bug whose root cause involved more than one file.
- Each test must assert a specific expected value derived from FakeGoogle data. Do not write tests that only assert "returns something non-null".
- When a new feature requires specific data relationships that don't already exist in FakeGoogle (e.g. a new table, a chain of linked records), add the data to `FakeGoogle.js` alongside the tests that depend on it. Document the expected values in comments at the top of the relevant test group.
