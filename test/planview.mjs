// The plan's free map area and the order of its panel's sections (lib/planview.mjs), with the rectangles the app really
// has at 1440 and 1280 wide, on a tablet and on a phone.
import assert from 'node:assert/strict';
import { dockSide, freeRect, fitPadding, planSections } from '../lib/planview.mjs';

const R = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });

// ---- which edge a panel is docked to ----
// 1440 × 900, list folded (planning): the 480px plan panel at the right
assert.equal(dockSide(R(948, 64, 1428, 888), R(0, 52, 1440, 900)), 'right');
// 1280 × 800 with the list open: the map is 896 wide and the 480px panel starts left of the map's middle (the old rule
// missed it and fitted under the panel)
assert.equal(dockSide(R(788, 64, 1268, 788), R(384, 52, 1280, 800)), 'right');
// a property card at 1280 (as before)
assert.equal(dockSide(R(908, 64, 1268, 788), R(384, 52, 1280, 800)), 'right');
// a tablet: the card stops 66px short of the edge, beside the map buttons
assert.equal(dockSide(R(534, 12, 934, 700), R(0, 0, 1000, 760)), 'right');
// a phone sheet across the bottom
assert.equal(dockSide(R(0, 440, 390, 786), R(0, 0, 390, 786)), 'bottom');
// a phone assistant drawer across the bottom, full height of the lower half
assert.equal(dockSide(R(0, 300, 390, 786), R(0, 0, 390, 786)), 'bottom');
// a narrow box on the left, a small box in the middle, something off the map
assert.equal(dockSide(R(10, 60, 300, 500), R(0, 0, 1000, 760)), 'left');
assert.equal(dockSide(R(450, 300, 550, 400), R(0, 0, 1000, 760)), null);
assert.equal(dockSide(R(1100, 0, 1200, 100), R(0, 0, 1000, 760)), null);
assert.equal(dockSide(null, R(0, 0, 1000, 760)), null);

// ---- the free rectangle ----
// 1440 planning: card on the right, search and Layers on top, camera buttons left of the card
let f = freeRect(R(0, 52, 1440, 900), { panels: [R(948, 64, 1428, 888)], tops: [R(16, 68, 872, 154)], buttons: R(898, 68, 934, 310) });
assert.deepEqual(f, { l: 0, t: 154, r: 898, b: 900 });
assert.ok(f.r - f.l >= 850, 'the plan gets at least 850px of width at 1440');
assert.deepEqual(fitPadding(f, R(0, 52, 1440, 900), 40), { left: 40, top: 142, right: 582, bottom: 40 });
// the assistant drawer open too: the narrower of the two wins
f = freeRect(R(0, 52, 1440, 900), { panels: [R(948, 64, 1428, 888), R(1040, 52, 1440, 900)], tops: [], buttons: null });
assert.equal(f.r, 948);
// phone: the sheet's top is the bottom, the search bar the top, the camera buttons the right
f = freeRect(R(0, 0, 390, 786), { panels: [R(0, 440, 390, 786)], tops: [R(0, 0, 390, 60), R(10, 108, 328, 108)], buttons: R(332, 108, 380, 380) });
assert.deepEqual(f, { l: 0, t: 60, r: 332, b: 440 });
// an empty tool row (height 0) and a row low on the map don't count; buttons on the left half don't either
f = freeRect(R(0, 0, 1000, 800), { panels: [], tops: [R(0, 600, 300, 650)], buttons: R(20, 100, 60, 300) });
assert.deepEqual(f, { l: 0, t: 0, r: 1000, b: 800 });
// the legend card in the bottom-left corner (the Plan key while planning): a strip on the left or along the bottom,
// whichever fits the site bigger (by its aspect), else whichever leaves more room; boxes elsewhere don't count
const M1440 = R(0, 52, 1440, 900), base = { panels: [R(948, 64, 1428, 888)], tops: [R(16, 68, 872, 154)], buttons: R(898, 68, 934, 310) }, key = [R(16, 690, 252, 872)];
assert.deepEqual(freeRect(M1440, { ...base, corners: key, aspect: 2 }), { l: 0, t: 154, r: 898, b: 690 }); // a wide site: the strip along the bottom goes
assert.deepEqual(freeRect(M1440, { ...base, corners: key, aspect: 0.5 }), { l: 252, t: 154, r: 898, b: 900 }); // a tall one: the strip on the left
assert.deepEqual(freeRect(M1440, { ...base, corners: [R(16, 300, 252, 872)] }), { l: 252, t: 154, r: 898, b: 900 }); // no aspect: the larger area (646 × 746, not 898 × 146)
assert.deepEqual(freeRect(M1440, { ...base, corners: [R(600, 690, 800, 872), R(16, 200, 252, 300), null] }), { l: 0, t: 154, r: 898, b: 900 }); // not in the lower left
assert.deepEqual(freeRect(M1440, { ...base, corners: [R(16, 860, 252, 860)] }), { l: 0, t: 154, r: 898, b: 900 }); // empty (folded away)

// ---- the panel's sections, in order (the chips are made from the same list) ----
const ids = o => planSections(o).map(s => s.id).join(' ');
assert.equal(ids({}), 'spAiSec spSiteSec spDrawSec spParams', 'before a layout: build, site, draw, settings');
assert.equal(ids({ laidOut: true }), 'spChgSec spAiSec spNums spPfSec spSiteSec spDrawSec spParams spExport');
assert.equal(ids({ laidOut: true, layouts: true }), 'spLayouts spChgSec spAiSec spNums spPfSec spSiteSec spDrawSec spParams spExport');
assert.equal(ids({ laidOut: true, layouts: true, selected: true }).split(' ')[0], 'spSel', 'a picked piece comes first');
assert.equal(ids({ drawing: true, laidOut: true, selected: true }), 'spDrawSite', 'drawing the site: only that');
assert.deepEqual(planSections({ laidOut: true }).map(s => s.label), ['Change', 'Build', 'Numbers', 'Pro forma', 'Site', 'Draw', 'Settings', 'Export']);

console.log('planview ok: docked edges, the free map area, fit padding and the plan sections');
