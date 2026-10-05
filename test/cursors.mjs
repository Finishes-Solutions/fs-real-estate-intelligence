// Custom cursors (src/cursors.js): every one is an SVG data URL with a hotspot inside the image and a system fallback,
// small enough for every browser (32 px or less), and the CSS uses each variable it defines.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { CURSORS, installCursors } = await import('../src/cursors.js');
for (const [k, v] of Object.entries(CURSORS)) {
  const m = v.match(/^url\("data:image\/svg\+xml,([^"]+)"\) (\d+) (\d+), ([a-z-]+)$/); assert.ok(m, k + ': url, hotspot, fallback');
  const s = decodeURIComponent(m[1]), size = +s.match(/width="(\d+)"/)[1];
  assert.ok(s.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && s.endsWith('</svg>'), k + ': an svg');
  assert.ok(size <= 32 && +m[2] < size && +m[3] < size, k + ': at most 32 px, hotspot inside');
  assert.equal((s.match(/</g) || []).length, (s.match(/>/g) || []).length, k + ': balanced tags');
  assert.ok(!/NaN|undefined/.test(s), k + ': no broken numbers');
}
const css = fs.readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
for (const k of [...css.matchAll(/var\(--cur-([a-z]+)/g)].map(x => x[1])) assert.ok(CURSORS[k], 'app.css uses --cur-' + k + ', which exists');
assert.ok(!/cursor:\s*(pointer|default|grab|crosshair)\s*[;}]/.test(css), 'no system cursor left in app.css');
const set = {}; installCursors({ style: { setProperty: (n, v) => set[n] = v } }); assert.equal(set['--cur-pointer'], CURSORS.pointer);
console.log('cursors ok');
