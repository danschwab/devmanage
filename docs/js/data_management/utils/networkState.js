/**
 * Plain mutable singleton for network connectivity state.
 * Has zero imports so it is safe to import from any layer (google_sheets_services,
 * data_management, or application) without creating circular dependencies.
 *
 * The application layer (auth.js) writes to this object via window online/offline events.
 * The data layer (caching.js) reads from it to freeze cache operations while offline.
 */
export const networkState = {
    isOffline: false
};
