/**
 * Universal Auto-Color Classification System
 * 
 * Provides a single, consistent color classification rule across the entire application:
 * - value < 0  → red
 * - value < 1  → yellow
 * - value >= 1 → no color (unchanged from default)
 * 
 * Usage:
 * 1. Tables: Set column.autoColor = true on numeric columns
 * 2. Custom cells: Use getAutoColorClass(value) in cellClass functions
 * 3. Calendar chips: Use getAutoColorClass(value) in chipColorClassProvider
 */

/**
 * Get color class for any numeric value based on universal rule
 * 
 * @param {Number|null|undefined} value - The numeric value to classify
 * @returns {String} Color class name ('red', 'yellow', or empty string)
 * 
 * @example
 * // In table column definition
 * { key: 'quantity', format: 'number', autoColor: true }
 * 
 * @example
 * // In custom cellClass function
 * cellClass: (value) => getAutoColorClass(value)
 * 
 * @example
 * // In calendar chip provider
 * chipColorClassProvider() {
 *     return (row) => getAutoColorClass(row.quantity);
 * }
 */
export function getAutoColorClass(value) {
    // Null/undefined values get no color
    if (value === null || value === undefined) {
        return '';
    }

    // Apply universal rule
    if (value < 0) return 'red';
    if (value < 1) return 'orange';
    return '';
}

/**
 * Check if a value should be colored (for conditional rendering)
 * 
 * @param {Number|null|undefined} value - The value to check
 * @returns {Boolean} True if value should receive a color class
 */
export function shouldAutoColor(value) {
    return value !== null && value !== undefined && value < 1;
}
