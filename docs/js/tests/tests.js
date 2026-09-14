/**
 * Console test suite — runs automatically on localhost against FakeGoogle test data.
 * Add new tests here when building features that depend on existing behavior.
 * Each test group covers a distinct layer of the stack; cross-group tests intentionally
 * exercise multiple layers together to catch integration regressions.
 *
 * FakeGoogle test data used here lives in google_sheets_services/FakeGoogle.js.
 * The transship test shows are:
 *   Two-show chain:   CHAINCO 2026 SPRING EXPO  →  CHAINCO 2026 SUMMER SHOW
 *   Three-show chain: TRICHAIN 2026 STAGE A  →  STAGE B  →  STAGE C
 *   Overlap show:     OVERLAPCO 2026 OVERLAP TEST  (overlaps SPRING EXPO's March window)
 *
 * FakeGoogle item quantities:
 *   SPRING EXPO:  TABLE-001=2, CHAIR-002=5
 *   SUMMER SHOW:  TABLE-001=3, CHAIR-002=4    → chain max: TABLE-001=3, CHAIR-002=5
 *   STAGE A:      STOOL-001=2, COUCH-001=1
 *   STAGE B:      STOOL-001=4, COUCH-001=2
 *   STAGE C:      STOOL-001=3, COUCH-001=1    → chain max: STOOL-001=4, COUCH-001=2
 *   OVERLAPCO:    TABLE-001=1
 */

import { Requests } from '../data_management/api.js';
import { FakeGoogleSheetsAuth } from '../google_sheets_services/FakeGoogle.js';

// ── Runner ────────────────────────────────────────────────────────────────────

const _tests = [];

function test(group, name, fn) {
    _tests.push({ group, name, fn });
}

function assertEqual(actual, expected, label) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) throw new Error(`${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
}

function assertContains(arr, value, label) {
    if (!Array.isArray(arr) || !arr.includes(value))
        throw new Error(`${label}\n    expected array to contain: ${JSON.stringify(value)}\n    actual: ${JSON.stringify(arr)}`);
}

function assertNotContains(arr, value, label) {
    if (Array.isArray(arr) && arr.includes(value))
        throw new Error(`${label}\n    expected array NOT to contain: ${JSON.stringify(value)}\n    actual: ${JSON.stringify(arr)}`);
}

function assertFiniteNumber(val, label) {
    if (typeof val !== 'number' || !isFinite(val))
        throw new Error(`${label}\n    expected a finite number, got: ${JSON.stringify(val)}`);
}

function assertLessThan(val, threshold, label) {
    if (!(val < threshold))
        throw new Error(`${label}\n    expected ${val} < ${threshold}`);
}

// ── Group 0: Authentication ──────────────────────────────────────────────────
// Tests the full FakeGoogleSheetsAuth lifecycle. This group runs first and ends
// authenticated so all subsequent API-dependent groups have a valid session.
// The tests also confirm that the auth state machine transitions correctly and
// that silent refresh resets the token clock, which the real app relies on.

test('AUTH', 'checkAuth returns false before authenticate', async () => {
    await FakeGoogleSheetsAuth.logout();
    const result = await FakeGoogleSheetsAuth.checkAuth();
    assertEqual(result, false, 'checkAuth before authenticate');
});

test('AUTH', 'authenticate completes and returns true', async () => {
    const result = await FakeGoogleSheetsAuth.authenticate();
    assertEqual(result, true, 'authenticate() return value');
});

test('AUTH', 'checkAuth returns true after authenticate', async () => {
    const result = await FakeGoogleSheetsAuth.checkAuth();
    assertEqual(result, true, 'checkAuth after authenticate');
});

test('AUTH', 'getUserEmail returns the test account email', async () => {
    const email = await FakeGoogleSheetsAuth.getUserEmail();
    assertEqual(email, 'test@example.com', 'getUserEmail');
});

test('AUTH', 'token has time remaining after authenticate', async () => {
    const remaining = FakeGoogleSheetsAuth.getTokenSecondsRemaining();
    if (remaining <= 0) throw new Error(`expected > 0 seconds remaining, got ${remaining}`);
});

test('AUTH', 'silentRefresh returns true when authenticated', async () => {
    const result = await FakeGoogleSheetsAuth.silentRefresh();
    assertEqual(result, true, 'silentRefresh when authenticated');
});

test('AUTH', 'silentRefresh resets token to near-full time', async () => {
    // Let the token age slightly, then refresh and verify it was renewed
    await new Promise(r => setTimeout(r, 200));
    await FakeGoogleSheetsAuth.silentRefresh();
    const remaining = FakeGoogleSheetsAuth.getTokenSecondsRemaining();
    if (remaining < 3499) throw new Error(`expected ~3500s after silentRefresh, got ${remaining.toFixed(1)}s`);
});

test('AUTH', 'silentRefresh returns false when not authenticated', async () => {
    await FakeGoogleSheetsAuth.logout();
    const result = await FakeGoogleSheetsAuth.silentRefresh();
    assertEqual(result, false, 'silentRefresh when not authenticated');
    // Re-authenticate so subsequent test groups have a valid session
    await FakeGoogleSheetsAuth.authenticate();
});

// ── Group 1: Identifier Resolution ───────────────────────────────────────────
// computeIdentifier fuzzy-matches raw Show/Client/Year values against the Clients
// and Shows index tables. These tests confirm the canonical output used by all
// downstream identifier-keyed lookups (ScheduleOverrides, NameOverrides, etc.).

test('IDENTIFIER RESOLUTION', 'ChainCo/Spring Expo resolves to canonical form', async () => {
    const result = await Requests.computeIdentifier('Spring Expo', 'ChainCo', '2026');
    assertEqual(result, 'CHAINCO 2026 SPRING EXPO', 'computeIdentifier("Spring Expo", "ChainCo", "2026")');
});

test('IDENTIFIER RESOLUTION', 'ATSC/NAB resolves correctly', async () => {
    const result = await Requests.computeIdentifier('NAB', 'ATSC', '2025');
    assertEqual(result, 'ATSC 2025 NAB', 'computeIdentifier("NAB", "ATSC", "2025")');
});

test('IDENTIFIER RESOLUTION', 'Allen Arms/SHOT Show resolves correctly', async () => {
    const result = await Requests.computeIdentifier('SHOT Show', 'Allen Arms', '2025');
    assertEqual(result, 'ALLEN ARMS 2025 SHOT', 'computeIdentifier("SHOT Show", "Allen Arms", "2025")');
});

test('IDENTIFIER RESOLUTION', 'blank show name returns empty string', async () => {
    const result = await Requests.computeIdentifier('', 'ATSC', '2025');
    assertEqual(result, '', 'computeIdentifier("", "ATSC", "2025")');
});

// ── Group 2: Transship Chain Links ────────────────────────────────────────────
// getTransshipSourceForShow returns the source identifier for a destination show.
// getTransshipDestinationsForShow returns the destination for a source show.
// Both validate show ordering (source must precede destination by S.Start date)
// before returning; invalid or reversed links return null.

test('TRANSSHIP LINKS', 'destination show returns its source', async () => {
    const result = await Requests.getTransshipSourceForShow('CHAINCO 2026 SUMMER SHOW');
    assertEqual(result, 'CHAINCO 2026 SPRING EXPO', 'getTransshipSourceForShow(SUMMER SHOW)');
});

test('TRANSSHIP LINKS', 'source show has no source', async () => {
    const result = await Requests.getTransshipSourceForShow('CHAINCO 2026 SPRING EXPO');
    assertEqual(result, null, 'getTransshipSourceForShow(SPRING EXPO)');
});

test('TRANSSHIP LINKS', 'source show returns its destination', async () => {
    const result = await Requests.getTransshipDestinationsForShow('CHAINCO 2026 SPRING EXPO');
    assertEqual(result, 'CHAINCO 2026 SUMMER SHOW', 'getTransshipDestinationsForShow(SPRING EXPO)');
});

test('TRANSSHIP LINKS', 'destination show has no further destination', async () => {
    const result = await Requests.getTransshipDestinationsForShow('CHAINCO 2026 SUMMER SHOW');
    assertEqual(result, null, 'getTransshipDestinationsForShow(SUMMER SHOW)');
});

test('TRANSSHIP LINKS', 'three-show chain: middle node source is Stage A', async () => {
    const result = await Requests.getTransshipSourceForShow('TRICHAIN 2026 STAGE B');
    assertEqual(result, 'TRICHAIN 2026 STAGE A', 'getTransshipSourceForShow(STAGE B)');
});

test('TRANSSHIP LINKS', 'three-show chain: middle node destination is Stage C', async () => {
    const result = await Requests.getTransshipDestinationsForShow('TRICHAIN 2026 STAGE B');
    assertEqual(result, 'TRICHAIN 2026 STAGE C', 'getTransshipDestinationsForShow(STAGE B)');
});

test('TRANSSHIP LINKS', 'end of three-show chain has no destination', async () => {
    const result = await Requests.getTransshipDestinationsForShow('TRICHAIN 2026 STAGE C');
    assertEqual(result, null, 'getTransshipDestinationsForShow(STAGE C)');
});

test('TRANSSHIP LINKS', 'unlinked show returns null', async () => {
    const result = await Requests.getTransshipSourceForShow('ATSC 2025 NAB');
    assertEqual(result, null, 'getTransshipSourceForShow(ATSC 2025 NAB)');
});

// ── Group 3: Chain-Aware Ship and Return Dates ────────────────────────────────
// getProjectShipDate walks the ScheduleOverrides source chain and returns the
// earliest ship date (the chain root's date). getProjectReturnDate walks the
// destination chain and returns the latest return date (the last show's date).
// This ensures items are treated as unavailable for the full duration of
// all shows in the chain, not just the individual show.

test('CHAIN DATES', 'destination show uses source ship date', async () => {
    const result = await Requests.getProjectShipDate('CHAINCO 2026 SUMMER SHOW');
    assertEqual(result, '2026-03-01', 'getProjectShipDate(SUMMER SHOW) should resolve to SPRING EXPO ship date');
});

test('CHAIN DATES', 'source show returns own ship date', async () => {
    const result = await Requests.getProjectShipDate('CHAINCO 2026 SPRING EXPO');
    assertEqual(result, '2026-03-01', 'getProjectShipDate(SPRING EXPO)');
});

test('CHAIN DATES', 'source show return extends to destination return date', async () => {
    const result = await Requests.getProjectReturnDate('CHAINCO 2026 SPRING EXPO');
    assertEqual(result, '2026-06-11', 'getProjectReturnDate(SPRING EXPO) should resolve to SUMMER SHOW return date');
});

test('CHAIN DATES', 'destination show returns own return date', async () => {
    const result = await Requests.getProjectReturnDate('CHAINCO 2026 SUMMER SHOW');
    assertEqual(result, '2026-06-11', 'getProjectReturnDate(SUMMER SHOW)');
});

test('CHAIN DATES', 'three-show chain: end show ship date resolves to Stage A', async () => {
    const result = await Requests.getProjectShipDate('TRICHAIN 2026 STAGE C');
    assertEqual(result, '2026-04-01', 'getProjectShipDate(STAGE C) should resolve to STAGE A ship date');
});

test('CHAIN DATES', 'three-show chain: root show return extends to Stage C', async () => {
    const result = await Requests.getProjectReturnDate('TRICHAIN 2026 STAGE A');
    assertEqual(result, '2026-06-16', 'getProjectReturnDate(STAGE A) should resolve to STAGE C return date');
});

// ── Group 4: Item Timeline Structure for Chain Shows ─────────────────────────
// getItemTimeline should produce exactly one Ships event per chain (from the root),
// a Transship event at each intermediate node's own return date (zero-delta), and
// a Returns event at the last node's return date. The Ships/Returns quantity is the
// chain max (highest qty across all members), not the root's own quantity alone.
// Destination shows must NOT appear as independent Ships events.

test('TIMELINE STRUCTURE', 'TABLE-001 Ships event originates from chain root', async () => {
    const events = await Requests.getItemTimeline('TABLE-001', '2026-02-15', '2026-06-30');
    const ships = events.filter(e => e.event === 'Ships' && e.note === 'CHAINCO 2026 SPRING EXPO');
    if (ships.length !== 1) throw new Error(`expected exactly 1 Ships event for SPRING EXPO, got ${ships.length}`);
});

test('TIMELINE STRUCTURE', 'TABLE-001 Ships quantity equals chain max (3, not root-only 2)', async () => {
    const events = await Requests.getItemTimeline('TABLE-001', '2026-02-15', '2026-06-30');
    const ship = events.find(e => e.event === 'Ships' && e.note === 'CHAINCO 2026 SPRING EXPO');
    if (!ship) throw new Error('Ships event for SPRING EXPO not found');
    assertEqual(ship.change, 'quantity: -3', 'Ships change should reflect chain max TABLE-001=3');
});

test('TIMELINE STRUCTURE', 'TABLE-001 has Transship event pointing to SUMMER SHOW', async () => {
    const events = await Requests.getItemTimeline('TABLE-001', '2026-02-15', '2026-06-30');
    const transship = events.find(e => e.event === 'Transship' && e.note === 'CHAINCO 2026 SUMMER SHOW');
    if (!transship) throw new Error('Transship event pointing to SUMMER SHOW not found');
    assertEqual(transship.change, '', 'Transship event must not alter quantity');
});

test('TIMELINE STRUCTURE', 'TABLE-001 Returns event notes the last show in chain', async () => {
    const events = await Requests.getItemTimeline('TABLE-001', '2026-02-15', '2026-06-30');
    const ret = events.find(e => e.event === 'Returns' && e.note === 'CHAINCO 2026 SUMMER SHOW');
    if (!ret) throw new Error('Returns event for SUMMER SHOW not found');
    assertEqual(ret.change, 'quantity: +3', 'Returns change should reflect chain max TABLE-001=3');
});

test('TIMELINE STRUCTURE', 'SUMMER SHOW does not appear as an independent Ships event', async () => {
    const events = await Requests.getItemTimeline('TABLE-001', '2026-02-15', '2026-06-30');
    const badShip = events.find(e => e.event === 'Ships' && e.note === 'CHAINCO 2026 SUMMER SHOW');
    if (badShip) throw new Error('SUMMER SHOW should not have its own Ships event — it is a transship destination');
});

test('TIMELINE STRUCTURE', 'Transship event date precedes Returns date', async () => {
    const events = await Requests.getItemTimeline('TABLE-001', '2026-02-15', '2026-06-30');
    const transship = events.find(e => e.event === 'Transship' && e.note === 'CHAINCO 2026 SUMMER SHOW');
    const ret = events.find(e => e.event === 'Returns' && e.note === 'CHAINCO 2026 SUMMER SHOW');
    if (!transship || !ret) throw new Error('Transship or Returns event not found');
    if (transship.date >= ret.date) throw new Error(`Transship date (${transship.date}) must be before Returns date (${ret.date})`);
});

test('TIMELINE STRUCTURE', 'three-show chain: STOOL-001 Ships delta equals chain max (4)', async () => {
    const events = await Requests.getItemTimeline('STOOL-001', '2026-03-15', '2026-07-01');
    const ship = events.find(e => e.event === 'Ships' && e.note === 'TRICHAIN 2026 STAGE A');
    if (!ship) throw new Error('Ships event for STAGE A not found');
    assertEqual(ship.change, 'quantity: -4', 'Ships change should reflect chain max STOOL-001=4');
});

test('TIMELINE STRUCTURE', 'three-show chain: two Transship events in order A→B, B→C', async () => {
    const events = await Requests.getItemTimeline('STOOL-001', '2026-03-15', '2026-07-01');
    const toB = events.find(e => e.event === 'Transship' && e.note === 'TRICHAIN 2026 STAGE B');
    const toC = events.find(e => e.event === 'Transship' && e.note === 'TRICHAIN 2026 STAGE C');
    if (!toB) throw new Error('Transship event pointing to STAGE B not found');
    if (!toC) throw new Error('Transship event pointing to STAGE C not found');
    if (toB.date >= toC.date) throw new Error(`Stage A→B transship (${toB.date}) must precede Stage B→C (${toC.date})`);
});

// ── Group 5: Overlap Conflict Detection ──────────────────────────────────────
// getItemOverlappingPacklists returns shows that (a) overlap the current show's
// date window AND (b) use the specified item. Transship destination shows must be
// skipped — their demand is already represented by the chain root. The chain root's
// transship source must also be excluded (it is the current show's own supply chain,
// not a competing show). All identifiers in results must be canonical schedule ids.

test('OVERLAP DETECTION', 'OVERLAPCO conflict list includes SPRING EXPO (chain root)', async () => {
    const result = await Requests.getItemOverlappingPacklists('OVERLAPCO 2026 OVERLAP TEST', 'TABLE-001');
    assertContains(result, 'CHAINCO 2026 SPRING EXPO',
        'getItemOverlappingPacklists(OVERLAPCO, TABLE-001) should include SPRING EXPO');
});

test('OVERLAP DETECTION', 'OVERLAPCO conflict list does not include SUMMER SHOW (destination)', async () => {
    const result = await Requests.getItemOverlappingPacklists('OVERLAPCO 2026 OVERLAP TEST', 'TABLE-001');
    assertNotContains(result, 'CHAINCO 2026 SUMMER SHOW',
        'SUMMER SHOW is a transship destination and must not appear as a separate conflict');
});

test('OVERLAP DETECTION', 'SPRING EXPO conflict list includes OVERLAPCO', async () => {
    const result = await Requests.getItemOverlappingPacklists('CHAINCO 2026 SPRING EXPO', 'TABLE-001');
    assertContains(result, 'OVERLAPCO 2026 OVERLAP TEST',
        'getItemOverlappingPacklists(SPRING EXPO, TABLE-001) should include OVERLAPCO');
});

test('OVERLAP DETECTION', 'SUMMER SHOW conflict list excludes SPRING EXPO (own source)', async () => {
    // The transship source of SUMMER SHOW is SPRING EXPO; it must be excluded as competing demand
    const result = await Requests.getItemOverlappingPacklists('CHAINCO 2026 SUMMER SHOW', 'TABLE-001');
    assertNotContains(result, 'CHAINCO 2026 SPRING EXPO',
        'SPRING EXPO is SUMMER SHOWs transship source — not competing demand');
});

// ── Group 6: Remaining Quantity ───────────────────────────────────────────────
// calculateRemainingQuantity uses the timeline min-quantity pathway: it finds the
// worst-case available quantity across [referenceDate, chainReturnDate]. The chain
// always accounts for all members (ship date = earliest, return = latest, qty = max).
// SPRING EXPO's chain needs 3 TABLE-001 but inventory only has 2, so remaining < 2.

test('REMAINING QUANTITY', 'returns a finite number for a chain root show', async () => {
    const result = await Requests.calculateRemainingQuantity('CHAINCO 2026 SPRING EXPO', 'TABLE-001', '2026-03-01');
    assertFiniteNumber(result, 'calculateRemainingQuantity(SPRING EXPO, TABLE-001)');
});

test('REMAINING QUANTITY', 'chain show over-demand produces negative remaining', async () => {
    // Inventory has 2 TABLE-001; chain needs 3 → worst-case remaining must be < 2
    const result = await Requests.calculateRemainingQuantity('CHAINCO 2026 SPRING EXPO', 'TABLE-001', '2026-03-01');
    assertLessThan(result, 2, 'remaining TABLE-001 for SPRING EXPO chain should be < 2 (needs 3, has 2)');
});

test('REMAINING QUANTITY', 'returns a finite number for an unlinked show', async () => {
    const result = await Requests.calculateRemainingQuantity('ATSC 2025 NAB', 'TABLE-001', '2026-01-10');
    assertFiniteNumber(result, 'calculateRemainingQuantity(ATSC 2025 NAB, TABLE-001)');
});

// ── Group 7: Inventory Data Integrity ────────────────────────────────────────
// Basic sanity checks that the inventory layer is intact and returns the correct
// quantities from FakeGoogle. These catch regressions in unrelated refactors that
// accidentally alter the inventory data path.

test('INVENTORY DATA', 'TABLE-001 quantity is 2', async () => {
    const rows = await Requests.getInventoryInfo('TABLE-001', ['quantity']);
    const row = rows?.find(r => r.itemName === 'TABLE-001');
    if (!row) throw new Error('TABLE-001 not found in inventory');
    assertEqual(row.quantity, '2', 'TABLE-001 quantity');
});

test('INVENTORY DATA', 'STOOL-001 quantity is 12', async () => {
    const rows = await Requests.getInventoryInfo('STOOL-001', ['quantity']);
    const row = rows?.find(r => r.itemName === 'STOOL-001');
    if (!row) throw new Error('STOOL-001 not found in inventory');
    assertEqual(row.quantity, '12', 'STOOL-001 quantity');
});

test('INVENTORY DATA', 'CHAIR-002 quantity is 15', async () => {
    const rows = await Requests.getInventoryInfo('CHAIR-002', ['quantity']);
    const row = rows?.find(r => r.itemName === 'CHAIR-002');
    if (!row) throw new Error('CHAIR-002 not found in inventory');
    assertEqual(row.quantity, '15', 'CHAIR-002 quantity');
});

test('INVENTORY DATA', 'COUCH-001 quantity is 2', async () => {
    const rows = await Requests.getInventoryInfo('COUCH-001', ['quantity']);
    const row = rows?.find(r => r.itemName === 'COUCH-001');
    if (!row) throw new Error('COUCH-001 not found in inventory');
    assertEqual(row.quantity, '2', 'COUCH-001 quantity');
});

// ── Runner export ─────────────────────────────────────────────────────────────

export async function runTests() {
    // Ensure authenticated before any API-dependent tests run.
    // Auth tests below start with logout() so they still test from an unauthenticated state.
    await FakeGoogleSheetsAuth.authenticate();

    console.group('%c TopShelf Test Suite', 'font-weight:bold;color:#6366f1');

    let lastGroup = null;
    const failed = [];

    for (const { group, name, fn } of _tests) {
        if (group !== lastGroup) {
            if (lastGroup !== null) console.groupEnd();
            console.group(`[${group}]`);
            lastGroup = group;
        }
        try {
            await fn();
            console.log(`%c ✓ ${name}`, 'color:#22c55e');
        } catch (e) {
            console.error(`%c ✗ ${name}`, 'color:#ef4444', '\n  ', e.message);
            failed.push({ group, name, error: e.message });
        }
    }

    if (lastGroup !== null) console.groupEnd();

    const passed = _tests.length - failed.length;
    const style = failed.length ? 'color:#ef4444;font-weight:bold' : 'color:#22c55e;font-weight:bold';
    console.log(`%c ${passed} passed, ${failed.length} failed`, style);
    console.groupEnd();

    return { passed, failed };
}
