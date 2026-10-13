// The Market tab's D3 chart kit (src/mkcharts.js) and its motion helpers (src/mkmotion.js): bars always share one path
// shape (so any bar can morph into any other), axes get round ticks, and numbers tween only between matching labels.
import assert from 'node:assert/strict';
import * as d3 from 'd3';
globalThis.d3 = d3;
const { mkCharts } = await import('../src/mkcharts.js');
const { flatten, textTween, zeroText } = await import('../src/mkmotion.js');

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const C = mkCharts({ esc, fmtN: n => n.toLocaleString('en-US') });
const shape = d => d.replace(/-?\d+(?:\.\d+)?/g, '#');
const attrs = (html, name) => [...html.matchAll(new RegExp(name + '="([^"]*)"', 'g'))].map(m => m[1]);

// stacked bars: a path for every row × key (zero-height ones too), all the same shape, keyed row:key
const keys = [{ k: 'a', c: 0 }, { k: 'b', c: 1 }];
const html = C.bars({ rows: [{ v: { a: 10, b: 5 } }, { v: { a: 0, b: 0 } }, { v: { a: 37, b: 0 } }], keys, W: 400, H: 180 });
const ds = attrs(html, ' d'), mk = attrs(html, 'data-mk');
assert.equal(ds.length, 6);
assert.deepEqual(mk, ['0:a', '0:b', '1:a', '1:b', '2:a', '2:b']);
assert.equal(new Set(ds.map(shape)).size, 1, 'every bar path has the same commands');
// round ticks: 0, 10, 20, 30, 40 for a top of 37 (D3 nice), not 0 / 18.5 / 37
assert.deepEqual([...html.matchAll(/<text class="mk-ax"[^>]*>([^<]*)</g)].map(m => m[1]), ['0', '10', '20', '30', '40']);
// the top segment of a stack is rounded (curve control points off the corners), the one under it is square
const corner = d => { const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number); return n[2] !== n[4]; }; // M x,b V y+r Q x,y: r > 0
assert.ok(corner(ds[1]), 'top segment rounded');
assert.ok(!corner(ds[0]), 'lower segment square');
assert.equal(attrs(html, 'data-base')[0], '158', 'baseline is the bottom of the plot');

// lines: a fill for one series, a dot on each series' latest value, gaps for missing values
const ln = C.lines({ xs: ['a', 'b', 'c', 'd'], series: [{ label: 'S', c: 0, vals: [1, 2, null, 4] }], W: 300, H: 120, zero: false });
assert.match(ln, /data-mka="area"/); assert.match(ln, /data-mka="line" data-mk="l:S"/); assert.match(ln, /class="mk-end" data-mka="dot"/);
assert.equal(attrs(ln, 'data-mka="line" data-mk="l:S" d').length, 1);
assert.equal((ln.match(/data-mka="line"[^>]* d="([^"]*)"/)[1].match(/M/g) || []).length, 2, 'a gap splits the line');
const two = C.lines({ xs: ['a', 'b'], series: [{ label: 'A', c: 0, vals: [1, 2] }, { label: 'B', c: 1, vals: [2, 1] }] });
assert.doesNotMatch(two, /data-mka="area"/, 'no fill under several series');
assert.equal(C.lines({ xs: ['a'], series: [{ label: 'A', c: 0, vals: [1] }] }), '');

// hbars and sparklines
const hb = C.hbars([{ label: 'X', v: 50 }, { label: 'Y', v: 100 }]);
assert.deepEqual(attrs(hb, 'style').map(s => s.match(/width:([\d.]+)%/)?.[1]).filter(Boolean), ['50.0', '100.0']);
assert.match(C.spark([1, 3, 2, 5], { tips: ['a', 'b', 'c', 'd'] }), /preserveAspectRatio="none"/);
assert.equal(C.spark([1]), '');
assert.equal(C.nice(37), 40);

// flatten: every y to the baseline, x untouched, commands kept (M/L/C/Q pairs, V is y, H is x, h0 dots)
assert.equal(flatten('M10,20V5Q10,0 13,0H17Q20,0 20,3V20Z', 20), 'M10,20V20Q10,20,13,20H17Q20,20,20,20V20Z');
assert.equal(flatten('M1,2C3,4,5,6,7,8L9,10', 0), 'M1,0C3,0,5,0,7,0L9,0');
assert.equal(flatten('M4.5,7h0', 26), 'M4.5,26h0');
const flat = flatten(ds[4], 158), num = d => d.match(/-?\d+(?:\.\d+)?/g);
assert.equal(num(flat).length, num(ds[4]).length, 'a flattened bar morphs number for number');

// text tweens: same label shape only; in-between values keep the target's decimals and commas
const t = textTween('$1,250', '$1,900'); assert.equal(t(0), '$1,250'); assert.equal(t(.5), '$1,575'); assert.equal(t(1), '$1,900');
assert.equal(textTween('4.1%', '3.8%')(.25), '4.0%'); assert.equal(textTween('4.1%', '3.8%')(.75), '3.9%');
assert.equal(textTween('$1.2B', '$950M'), null, 'different units just swap');
assert.equal(textTween('12', '12'), null);
assert.equal(zeroText('$1,250.50 a year'), '$0.00 a year');
assert.equal(textTween(zeroText('12,345'), '12,345')(.5), '6,173');
console.log('mkmotion ok');
