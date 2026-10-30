import { Database, EditHistoryUtils, normalizeHeaderName } from '../index.js';
import { isCheckedValue, checkboxWriteValue } from '../utils/checkbox-values.js';

/**
 * Instant (single-cell, verified) writes — views-and-renderers-plan §4.16, Phase 2.
 *
 * Everything an instant-write page needs from the sheet lives in the live database:
 *   CACHE/Preferences  InstantWriteTables  { "<database>/<tab>": { identity: [...], columns: { name: type } } }
 *   CACHE/ShowNotes    Identifier | Note | EditHistory   (show notes, keyed by computeIdentifier)
 *
 * writeCellVerified locates the target by identity (row) and header name (column), never by
 * position, resolving both to live sheet indices just before writing:
 *   1. refuse columns not listed in the preference
 *   2. read the live sheet; locate the row by identity (0 matches → fail, >1 → fail, never guess)
 *   3. read the exact row; abort if it no longer matches
 *   4. write only the desired value (a formula cell is replaced by the value)
 *   5. re-read to verify; if the row moved while the write was in flight, re-locate and retry once
 */

const PREFERENCES_MAPPING = { id: 'ID', name: 'Name', description: 'Description', page: 'Page', type: 'Type', value: 'Value', editHistory: 'EditHistory' };
const SHOW_NOTES_TAB = 'ShowNotes';
const SHOW_NOTES_HEADERS = ['Identifier', 'Note', 'EditHistory'];

/** Values are compared trimmed and case-insensitively against the raw sheet values. */
export function sameValue(a, b) {
    return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

export { isCheckedValue, checkboxWriteValue };

function headerIndex(headerRow, name) {
    const target = normalizeHeaderName(name).toLowerCase();
    return (headerRow || []).findIndex(h => normalizeHeaderName(h).toLowerCase() === target);
}

function parseJsonPreference(prefs, id, fallback) {
    const pref = (prefs || []).find(p => p.id === id);
    if (!pref || pref.value === undefined || pref.value === null || pref.value === '') return fallback;
    try { return JSON.parse(pref.value); } catch { return fallback; }
}

export class InstantWriteUtils {
    /**
     * The InstantWriteTables entry for a database/tab, or null.
     * @returns {Promise<{ identity: string[], columns: Object<string,string> }|null>}
     */
    static async getInstantWriteConfig(database, tab) {
        const prefs = await Database.getData('CACHE', 'Preferences', PREFERENCES_MAPPING);
        const all = parseJsonPreference(prefs, 'InstantWriteTables', {});
        const entry = all && all[`${database}/${tab}`];
        if (!entry || !Array.isArray(entry.identity) || !entry.identity.length || !entry.columns) return null;
        return { identity: entry.identity, columns: entry.columns };
    }

    /** Read a JSON preference by id (page-level reads: DesignQueueFields, DesignQueueAssignees). */
    static async getJsonPreference(id, fallback = null) {
        const prefs = await Database.getData('CACHE', 'Preferences', PREFERENCES_MAPPING);
        return parseJsonPreference(prefs, id, fallback);
    }

    /**
     * Locate a row by identity in a raw sheet (header row first).
     * @returns {{ status: 'ok'|'not-found'|'duplicate'|'no-identity-columns', rowIndex?: number, idCols?: number[] }}
     */
    static locateRow(raw, identity, rowObj) {
        const header = raw?.[0] || [];
        const idCols = identity.map(name => headerIndex(header, name));
        if (idCols.some(i => i < 0)) return { status: 'no-identity-columns' };
        const wanted = identity.map(name => rowObj?.[name]);
        if (wanted.every(v => v === undefined || v === null || String(v).trim() === '')) return { status: 'not-found' };
        const hits = [];
        for (let r = 1; r < raw.length; r++) {
            const line = raw[r] || [];
            if (idCols.every((c, k) => sameValue(line[c], wanted[k]))) hits.push(r);
        }
        if (hits.length === 0) return { status: 'not-found', idCols };
        if (hits.length > 1) return { status: 'duplicate', idCols };
        return { status: 'ok', rowIndex: hits[0], idCols };
    }

    /**
     * Verified single-cell write by identity.
     * @param {string} database   e.g. 'PROD_SCHED'
     * @param {string} tab        e.g. 'Production Schedule'
     * @param {Object} rowObj     the loaded row (keys = normalized header names), used for identity values
     * @param {string} column     header name of the target column
     * @param {string} value      the value to write (checkbox: 'X' or '')
     * @returns {Promise<{ ok: boolean, reason?: string, value?: string, rowNumber?: number }>}
     */
    static async writeCellVerified(database, tab, rowObj, column, value) {
        const config = await InstantWriteUtils.getInstantWriteConfig(database, tab);
        if (!config) return { ok: false, reason: 'no-config' };
        const allowed = Object.keys(config.columns).some(c => sameValue(c, column));
        if (!allowed) return { ok: false, reason: 'column-not-writable' };
        const desired = value ?? '';

        const attempt = async () => {
            const raw = await Database.readFresh(database, tab);
            const header = raw?.[0] || [];
            const colIdx = headerIndex(header, column);
            if (colIdx < 0) return { ok: false, reason: 'column-missing' };
            const loc = InstantWriteUtils.locateRow(raw, config.identity, rowObj);
            if (loc.status !== 'ok') return { ok: false, reason: loc.status };

            const rowNumber = loc.rowIndex + 1;               // 1-based sheet row
            const lastCol = Database.columnLetter(Math.max(header.length, colIdx + 1));
            const rowRange = `${tab}!A${rowNumber}:${lastCol}${rowNumber}`;

            // Read the exact row just before writing; abort if it no longer matches
            const before = await Database.readFresh(database, rowRange);
            const beforeLine = before?.[0] || [];
            const stillMatches = loc.idCols.every((c, k) => sameValue(beforeLine[c], rowObj?.[config.identity[k]]));
            if (!stillMatches) return { ok: false, reason: 'moved', retry: true };

            await Database.setCellValue(database, tab, rowNumber, colIdx + 1, desired);

            // Re-read to verify
            const after = await Database.readFresh(database, rowRange);
            const afterLine = after?.[0] || [];
            const rowOk = loc.idCols.every((c, k) => sameValue(afterLine[c], rowObj?.[config.identity[k]]));
            if (!rowOk) return { ok: false, reason: 'moved', retry: true };
            if (String(afterLine[colIdx] ?? '') !== String(desired)) return { ok: false, reason: 'verify-failed' };
            return { ok: true, value: desired, rowNumber };
        };

        let result = await attempt();
        if (!result.ok && result.retry) {
            // Rows moved while the write was in flight: re-locate by identity and retry once
            result = await attempt();
        }
        if (!result.ok) delete result.retry;
        return result;
    }

    /** All show notes as [{ Identifier, Note, EditHistory }] (cached read). */
    static async getShowNotes() {
        try {
            const data = await Database.getData('CACHE', SHOW_NOTES_TAB, { Identifier: 'Identifier', Note: 'Note', EditHistory: 'EditHistory' });
            return Array.isArray(data) ? data.filter(r => r && r.Identifier) : [];
        } catch (e) {
            console.warn('[InstantWriteUtils] ShowNotes tab unavailable:', e?.message || e);
            return [];
        }
    }

    /**
     * Upsert one show note: update the note row if it exists, append one otherwise, then verify.
     * @returns {Promise<{ ok: boolean, reason?: string }>}
     */
    static async saveShowNote(identifier, text, username = null) {
        if (!identifier) return { ok: false, reason: 'no-identifier' };
        const note = text ?? '';
        const raw = await Database.readFresh('CACHE', SHOW_NOTES_TAB);
        const header = raw?.[0] || [];
        if (!header.length || header.every(h => !h)) return { ok: false, reason: 'no-show-notes-tab' };
        const idCol = headerIndex(header, 'Identifier');
        const noteCol = headerIndex(header, 'Note');
        const histCol = headerIndex(header, 'EditHistory');
        if (idCol < 0 || noteCol < 0) return { ok: false, reason: 'show-notes-headers' };

        const matches = [];
        for (let r = 1; r < raw.length; r++) if (sameValue(raw[r]?.[idCol], identifier)) matches.push(r);
        if (matches.length > 1) return { ok: false, reason: 'duplicate' };

        let history = '';
        if (username) {
            const oldNote = matches.length ? (raw[matches[0]][noteCol] ?? '') : '';
            const changes = EditHistoryUtils.calculateRowDiff({ Note: oldNote }, { Note: note });
            if (changes.length) {
                const entry = EditHistoryUtils.createEditHistoryEntry(username, changes, 'web');
                history = EditHistoryUtils.appendToEditHistory(matches.length && histCol >= 0 ? (raw[matches[0]][histCol] ?? '') : '', entry);
            }
        }

        let rowNumber;
        if (matches.length === 1) {
            rowNumber = matches[0] + 1;
            await Database.setCellValue('CACHE', SHOW_NOTES_TAB, rowNumber, noteCol + 1, note);
            if (history && histCol >= 0) await Database.setCellValue('CACHE', SHOW_NOTES_TAB, rowNumber, histCol + 1, history);
        } else {
            const values = new Array(Math.max(header.length, SHOW_NOTES_HEADERS.length)).fill('');
            values[idCol] = identifier;
            values[noteCol] = note;
            if (histCol >= 0) values[histCol] = history;
            rowNumber = await Database.appendSheetRow('CACHE', SHOW_NOTES_TAB, values);
        }

        const lastCol = Database.columnLetter(Math.max(header.length, noteCol + 1));
        const after = await Database.readFresh('CACHE', `${SHOW_NOTES_TAB}!A${rowNumber}:${lastCol}${rowNumber}`);
        const line = after?.[0] || [];
        if (!sameValue(line[idCol], identifier) || String(line[noteCol] ?? '') !== String(note)) {
            return { ok: false, reason: 'verify-failed' };
        }
        return { ok: true };
    }
}
