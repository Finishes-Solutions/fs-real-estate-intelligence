// Builds the site-layout agent skill (skills/site-layout): copies the platform's layout engine (lib/layoutrun.mjs and
// every lib file it imports, found by following the imports) into skills/site-layout/scripts/engine/, writes the
// engine's version stamp, and zips the skill (skills/site-layout.zip). Run after any change to the engine so the skill
// an agent installs lays out exactly as the app does:
//   node scripts/build-skill-site-layout.mjs [--no-zip]
// The engine has no outside packages and makes no network calls; the copy keeps the lib folder's relative layout.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(ROOT, 'skills/site-layout'), ENGINE = path.join(SKILL, 'scripts/engine'), LIB = path.join(ROOT, 'lib');
const ENTRIES = ['layoutbrief.mjs', 'layoutrun.mjs', 'layoutcheck.mjs', 'layoutedit.mjs', 'layoutcaps.mjs', 'sitesheet.mjs', 'siteplan.mjs'];

// the import closure, relative to lib/
export function closure() {
  const seen = new Set();
  const walk = f => {
    if (seen.has(f)) return; seen.add(f);
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const r = m[1] || m[2];
      if (r.startsWith('.')) walk(path.resolve(path.dirname(f), r));
      else if (!r.startsWith('node:')) throw new Error(path.relative(ROOT, f) + ' imports the package ' + r + ': the skill must stay self-contained');
      else throw new Error(path.relative(ROOT, f) + ' imports ' + r + ': the engine must not need Node built-ins');
    }
  };
  for (const e of ENTRIES) walk(path.join(LIB, e));
  return [...seen].map(f => path.relative(LIB, f)).sort();
}

export async function build({ zip = true } = {}) {
  const files = closure();
  fs.rmSync(ENGINE, { recursive: true, force: true });
  const h = createHash('sha256');
  for (const rel of files) {
    const to = path.join(ENGINE, rel); fs.mkdirSync(path.dirname(to), { recursive: true });
    const src = fs.readFileSync(path.join(LIB, rel)); fs.writeFileSync(to, src); h.update(rel + '\n'); h.update(src);
  }
  const run = fs.readFileSync(path.join(LIB, 'layoutrun.mjs'), 'utf8'), ver = (re) => (run.match(re) || [])[1] || null;
  let commit = null; try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
  const stamp = { engine: ver(/ENGINE_VERSION = '([^']+)'/), files: files.length, sha256: h.digest('hex'), from: 'fs-real-estate-intelligence lib/ at ' + (commit || 'unknown commit') };
  fs.writeFileSync(path.join(ENGINE, 'VERSION.json'), JSON.stringify(stamp, null, 1) + '\n');
  await writeForms();
  await writeAssets();
  if (zip) {
    const out = path.join(ROOT, 'skills/site-layout.zip'); fs.rmSync(out, { force: true });
    execFileSync('zip', ['-r', '-X', '-q', out, 'site-layout', '-x', '*.DS_Store', '*/out/*', '*/__pycache__/*'], { cwd: path.join(ROOT, 'skills') });
  }
  return stamp;
}

// the sheet's Finishes Solutions title block and font widths, made here (pdf-lib, a dev package) so the skill's sheet
// writer needs no package: the 24 x 36 border (skills/fs-site-plan/assets/titleblock.pdf, the same file fs-set-plans
// uses) as one Form XObject in a classic-xref PDF with no object streams (scripts/pdf.mjs copies its objects in), and
// the Helvetica / Helvetica-Bold widths of the WinAnsi characters (for wrapping and right-aligned text)
export async function writeAssets() {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const { Font } = await import('@pdf-lib/standard-fonts');
  const A = path.join(SKILL, 'assets'); fs.mkdirSync(A, { recursive: true });
  const src = await PDFDocument.load(fs.readFileSync(path.join(ROOT, 'skills/fs-site-plan/assets/titleblock.pdf')));
  const doc = await PDFDocument.create(), [emb] = await doc.embedPages([src.getPage(0)]);
  const page = doc.addPage([2592, 1728]); page.drawPage(emb, { x: 0, y: 0 });
  doc.setProducer('fs-real-estate-intelligence'); doc.setCreator('scripts/build-skill-site-layout.mjs'); doc.setCreationDate(new Date(0)); doc.setModificationDate(new Date(0));
  fs.writeFileSync(path.join(A, 'titleblock-form.pdf'), await doc.save({ useObjectStreams: false }));
  const widths = {};
  for (const [key, name] of [['regular', StandardFonts.Helvetica], ['bold', StandardFonts.HelveticaBold]]) {
    const f = Font.load(name), w = {};
    for (let c = 32; c < 256; c++) { const g = f.CharMetrics.find(m => m.N === WIN_ANSI[c]); if (g) w[c] = g.WX; }
    widths[key] = w;
  }
  fs.writeFileSync(path.join(A, 'helvetica-widths.json'), JSON.stringify(widths) + '\n');
}
// WinAnsi code -> glyph name (32..126 ASCII, then the ones the sheet uses)
const WIN_ANSI = (() => { const m = {}; const ascii = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
  const names = ['space', 'exclam', 'quotedbl', 'numbersign', 'dollar', 'percent', 'ampersand', 'quotesingle', 'parenleft', 'parenright', 'asterisk', 'plus', 'comma', 'hyphen', 'period', 'slash', 'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'colon', 'semicolon', 'less', 'equal', 'greater', 'question', 'at',
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), 'bracketleft', 'backslash', 'bracketright', 'asciicircum', 'underscore', 'grave', ...'abcdefghijklmnopqrstuvwxyz'.split(''), 'braceleft', 'bar', 'braceright', 'asciitilde'];
  [...ascii].forEach((ch, i) => { m[ch.charCodeAt(0)] = names[i]; });
  Object.assign(m, { 0x91: 'quoteleft', 0x92: 'quoteright', 0x93: 'quotedblleft', 0x94: 'quotedblright', 0x95: 'bullet', 0x96: 'endash', 0x97: 'emdash', 0xb0: 'degree', 0xb2: 'twosuperior', 0xb7: 'periodcentered', 0xd7: 'multiply', 0xbd: 'onehalf' });
  return m; })();

// requests that ask for each form (the words the brief reads; lib/layoutbrief.mjs FORM_WORDS)
const ASK = { 'mf-garden': 'garden apartments, as many as fit', 'mf-garden-studio': 'studio apartment buildings, 150 units', 'mf-walkup': 'walk-up apartments, 96 units', 'mf-courtyard': 'courtyard apartments, 200 units', 'mf-midrise': 'mid-rise apartments, 4 stories, as many as fit',
  'mf-tuck-under': 'tuck-under apartments, 120 units', 'mf-podium-courtyard': 'a 5 over 2 courtyard on a podium, 250 apartments', 'mf-podium': 'apartments on a parking podium, 300 units', 'mf-wrap': 'a wrap building with 300 apartments', 'mf-tower-podium': 'tower on a podium, 8 stories, 300 apartments',
  'mf-townhome': 'townhomes for rent, as many as fit / fee simple townhomes with garages (front-load: "front-load townhomes")', 'mf-stacked-townhome': 'stacked townhomes, 120 units', 'mf-plex': 'duplexes, as many as fit', 'mf-cottage-btr': 'build-to-rent cottages, as many as fit', 'sfr-subdivision': 'single-family lots, as many as fit',
  'ret-inline': 'exactly 28,000 sf retail in four buildings', 'ret-inline-pads': '30,000 sf strip center with 2 pads', 'ret-anchored': 'anchored shopping center with a 40,000 sf anchor, 80,000 sf total', 'ret-freestanding': '12,000 sf freestanding retail building', 'ret-restaurant': '6,000 sf sit-down restaurant', 'ret-drive-through': '2,500 sf restaurant with a drive-thru',
  'ind-warehouse': 'warehouse with truck court, 250,000 sf', 'ind-rear-load': 'rear-load warehouse, 150,000 sf', 'ind-front-load': 'front-load warehouse, 100,000 sf', 'ind-side-load': 'side-load warehouse', 'ind-cross-dock': 'cross-dock warehouse, 400,000 sf', 'ind-park': 'industrial park, three buildings, 300,000 sf',
  'flex-multi-tenant': 'flex industrial buildings, 60,000 sf', 'mx-horizontal': '20,000 sf retail along the main road, 240 apartments behind and 80 townhomes', 'mx-vertical': 'a 5-story mixed-use building with 20,000 sf ground-floor retail and 200 apartments above' };
export async function writeForms() {
  const { capsTable } = await import(pathToFileURL(path.join(ENGINE, 'layoutcaps.mjs')).href);
  const L = ['# Building and site forms the engine draws', '', 'Generated from the engine copy (scripts/engine/layoutcaps.mjs) by scripts/build-skill-site-layout.mjs; `node scripts/layout.mjs caps` prints the same list live. Status: **implemented** (drawn and checked), **partial** (drawn with the simplification noted), **unsupported** (reported, never swapped for another form).', '', '| Form | Family | Status | Ask for it with | Notes |', '|---|---|---|---|---|'];
  for (const c of capsTable()) L.push('| ' + [c.id + ' (' + c.label + ')', c.family, c.status, ASK[c.id] ? '"' + ASK[c.id] + '"' : '—', String(c.note || '').replace(/\|/g, '/')].join(' | ') + ' |');
  fs.writeFileSync(path.join(SKILL, 'references/forms.md'), L.join('\n') + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { const s = await build({ zip: !process.argv.includes('--no-zip') }); console.log('skills/site-layout engine: ' + s.files + ' files, ' + s.engine + ', ' + s.sha256.slice(0, 12)); }
