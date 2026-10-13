// The Changes page's "Last 7 days" list (mergeRecent) must count the same filings as the badge and filters (recentChanges).
import assert from 'node:assert/strict';
import { recentChanges, mergeRecent } from '../lib/changes.mjs';

const feed = { runs: [
  { built: '2026-10-13T16:00:00Z', items: [
    { id: 'A', k: 'status', from: 'Review complete', to: 'Inspection complete' },
    { id: 'B', k: 'status', from: 'Registered', to: 'Review complete' },
    { id: 'B', k: 'cost', from: 1e6, to: 2e6 },
    { id: 'C', k: 'new', cost: 5e6 }] },
  { built: '2026-10-12T16:00:00Z', items: [
    { id: 'A', k: 'status', from: 'Registered', to: 'Review complete' },
    { id: 'C', k: 'status', from: 'Registered', to: 'Review complete' },
    { id: 'D', k: 'new', cost: 1e6 }] },
  { built: '2026-10-10T16:00:00Z', items: [{ id: 'C', k: 'new', cost: 5e6 }, { id: 'E', k: 'gone', cost: 3e6 }] },
  { built: '2026-10-01T16:00:00Z', items: [{ id: 'F', k: 'new', cost: 9e6 }] }, // older than 7 days
] };

const m = mergeRecent(feed), r = recentChanges(feed);
assert.deepEqual([...m.ids].sort(), [...r.keys()].sort(), 'same filings as recentChanges');
assert.equal(m.runs, 3); assert.equal(m.since, '2026-10-10T16:00:00Z'); assert.equal(m.built, '2026-10-13T16:00:00Z');
// new wins: C is listed once, as new, even though a later run changed its status
assert.deepEqual(m.items.filter(x => x.id === 'C').map(x => x.k), ['new']);
// one row per kind of change, from the first value to the latest
const a = m.items.filter(x => x.id === 'A'); assert.equal(a.length, 1); assert.equal(a[0].from, 'Registered'); assert.equal(a[0].to, 'Inspection complete');
assert.deepEqual(m.items.filter(x => x.id === 'B').map(x => x.k).sort(), ['cost', 'status']);
assert.ok(m.items.some(x => x.id === 'E' && x.k === 'gone'));
assert.ok(!m.items.some(x => x.id === 'F'), 'runs older than the window are left out');
// the input feed is not changed
assert.equal(feed.runs[0].items[0].from, 'Review complete');
// empty feeds
assert.equal(mergeRecent({ runs: [] }).items.length, 0); assert.equal(mergeRecent(null).runs, 0);
console.log('changes: ok');
