export function parseDate(val, forceLocal = true, defaultYear = null) {
    if (!val) return null;
    // Handle 'YYYY-MM-DD' as local date
    if (forceLocal && typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const [year, month, day] = val.split('-').map(Number);
        return new Date(year, month - 1, day, 12, 0, 0, 0);
    }
    // Handle 'M/D/YYYY' or 'M/D/YY' or 'M/D' (optionally with year)
    if (typeof val === 'string') {
        // Try 'M/D/YYYY' or 'M/D/YY'
        let mdy = val.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (mdy) {
            let month = Number(mdy[1]);
            let day = Number(mdy[2]);
            let year = mdy[3] ? Number(mdy[3]) : null;
            if (year && year < 100) year += 2000; // handle 2-digit years
            if (!year && defaultYear) year = Number(defaultYear);
            if (!year) year = new Date().getFullYear();
            return new Date(year, month - 1, day, 12, 0, 0, 0);
        }
    }
    // Fallback to Date constructor
    const d = new Date(val);
    if (!isNaN(d)) {
        // If defaultYear is provided and year is not set, set it
        if (defaultYear && d.getFullYear() === 1970) {
            d.setFullYear(Number(defaultYear));
        }
        return d;
    }
    return null;
}