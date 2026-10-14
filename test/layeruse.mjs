// Map layer ordering by use (lib/layeruse.mjs): the quick layer buttons and the Layers panel's groups lead with what this
// person turns on most; a new user gets property information and area data first, the filings and live feeds after.
import assert from 'node:assert/strict';
import { DEFAULT_CHIPS, DEFAULT_GROUPS, CHIP_GROUP, PANEL_KEY, parseUse, bumpUse, orderByUse, orderGroups } from '../lib/layeruse.mjs';

// the shipped chip order, in any starting order, with no use yet
const shuffled = ['radar', 'filings', 'sat', 'planes', 'parcels', 'tilt', 'traffic', 'demo', 'flood'];
assert.deepEqual(orderByUse(shuffled, {}), ['parcels', 'flood', 'demo', 'traffic', 'sat', 'tilt', 'filings', 'planes', 'radar']);
assert.deepEqual(orderByUse(shuffled, {}), DEFAULT_CHIPS);
assert.equal(DEFAULT_CHIPS.indexOf('filings') > DEFAULT_CHIPS.indexOf('tilt'), true, 'filings come after the property and area layers');

// most used first; ties keep the default order
let use = {};
for (let i = 0; i < 3; i++) use = bumpUse(use, 'radar');
use = bumpUse(use, 'sat'); use = bumpUse(use, 'flood');
assert.deepEqual(use, { radar: 3, sat: 1, flood: 1 });
assert.deepEqual(orderByUse(DEFAULT_CHIPS, use), ['radar', 'flood', 'sat', 'parcels', 'demo', 'traffic', 'tilt', 'filings', 'planes']);
// bump doesn't change its input, and ignores junk keys
const before = { parcels: 2 }; const after = bumpUse(before, 'parcels');
assert.deepEqual(before, { parcels: 2 }); assert.equal(after.parcels, 3);
assert.deepEqual(bumpUse(before, ''), before); assert.deepEqual(bumpUse(null, 'x'), { x: 1 });
// unknown keys keep their given order after the known ones
assert.deepEqual(orderByUse(['zeta', 'filings', 'alpha', 'parcels'], {}), ['parcels', 'filings', 'zeta', 'alpha']);
assert.deepEqual(orderByUse(['zeta', 'filings', 'alpha'], { alpha: 1 }), ['alpha', 'filings', 'zeta']);

// storage: broken, old or hand-edited text never throws and never yields bad counts
assert.deepEqual(parseUse(null), {}); assert.deepEqual(parseUse(''), {}); assert.deepEqual(parseUse('{oops'), {});
assert.deepEqual(parseUse('[1,2]'), {}); assert.deepEqual(parseUse('"x"'), {}); assert.deepEqual(parseUse('null'), {});
assert.deepEqual(parseUse(JSON.stringify({ parcels: 4, flood: -1, demo: 'x', sat: 2.7, tilt: null, radar: 1e12 })), { parcels: 4, sat: 2, radar: 1e6 });
// round trip
assert.deepEqual(parseUse(JSON.stringify(bumpUse(parseUse('{"demo":1}'), 'demo'))), { demo: 2 });

// panel groups: a new user sees Property & site first and Construction filings near the end
const groups = ['filings', 'property', 'env', 'util', 'demo', 'live', 'base'];
assert.deepEqual(orderGroups(groups, {}), ['property', 'demo', 'base', 'env', 'util', 'filings', 'live']);
assert.deepEqual(orderGroups(groups, {}), DEFAULT_GROUPS);
// a group's uses are the sum of its layers' uses; panel-only layers name their group through groupOf
const groupOf = k => CHIP_GROUP[k] || { lyWetlands: 'env', lySoils: 'env' }[k];
assert.deepEqual(orderGroups(groups, { planes: 2, radar: 2, parcels: 3 }, groupOf).slice(0, 2), ['live', 'property']);
assert.deepEqual(orderGroups(groups, { lyWetlands: 1, lySoils: 1, sat: 1 }, groupOf).slice(0, 3), ['env', 'base', 'property']);
// a key from an older version (no group) is ignored
assert.deepEqual(orderGroups(groups, { lyGone: 50 }, groupOf), DEFAULT_GROUPS);

// every quick button has a group, and every panel control that is a quick button maps to one
for (const k of DEFAULT_CHIPS) assert.ok(DEFAULT_GROUPS.includes(CHIP_GROUP[k]), k + ' has a panel group');
for (const k of Object.values(PANEL_KEY)) assert.ok(DEFAULT_CHIPS.includes(k), k + ' is a quick button');
console.log('layeruse ok');
