export function parseDate(val, forceLocal = true) {
    if (!val) return null;
    if (forceLocal && typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        // Parse as local date: 'YYYY-MM-DD'
        // Use split and Date(year, monthIndex, day) to avoid timezone offset
        const [year, month, day] = val.split('-').map(Number);
        return new Date(year, month - 1, day, 12, 0, 0, 0); // noon local time to avoid DST issues
    }
    const d = new Date(val);
    return isNaN(d) ? null : d;
}