// The Real Estate Intelligence title block on plan set sheets: where things are on the AutoCAD border
// (templates/A-XREF-BORD-V01.pdf, cleaned by build/titleblock.mjs into templates/titleblock.pdf) and the HTML that writes
// a sheet's fields into it. Everything is in points (1/72 in) on the 36 x 24 in sheet, measured from its top left
// corner, read off the border itself (pdftotext -bbox for the labels, the ruled lines from a 1 pt/px raster).
// The border is drawn under each page by api/planset.js; this only places text, so a new border means new numbers here.
// No DOM: used by the browser (src/siteplan.js), the server and the tests.

export const PAGE = { w: 2592, h: 1728 }; // 36 x 24 in
// inside the heavy border line: the drawing area every sheet's content goes in
export const FRAME = { x: 111, y: 41, w: 2223, h: 1650 };
// the strip on the right, outside the frame: logo, two unlabelled boxes (left empty), an open area, the issue /
// revision table (written sideways, one row per issue), drawn / checked by, project number, sheet title and number
export const STRIP = { x: 2376, w: 180 };
export const FIELDS = {
  open: { x: 2382, y: 512, w: 168, h: 540 }, // project, client, phase, date, scale, the preliminary statement
  drawnBy: { x: 2440, y: 1411, w: 112 }, checkedBy: { x: 2450, y: 1429, w: 102 }, // after their labels, on the label's line
  projectNumber: { x: 2382, y: 1464, w: 168, h: 26 },
  sheetTitle: { x: 2382, y: 1517, w: 168, h: 64 },
  sheetNumber: { x: 2382, y: 1610, w: 168, h: 78 }
};
// issue / revision rows: columns 13 pt wide from x = 2400.8, each split along its length into number, date, description
export const REV = { x0: 2400.8, pitch: 13, rows: 12, no: [1369.5, 1395], date: [1303.5, 1369.5], desc: [1070.8, 1303.5] };
// what build/titleblock.mjs paints white: the red AutoCAD plot stamp (path and date) down the left margin, outside the
// frame and alone there; and the firm registration number above the logo while it's off
// brand: the CAD border's logo block with its phone and address (top right); copyright: its line under the frame. Both are
// covered and the block carries the platform's name instead (build/titleblock.mjs): the sets are unbranded.
export const MASKS = { plotStamp: { x: 58, y: 0, w: 44, h: 1728 }, firmNumber: { x: 2378, y: 175, w: 15, h: 109 }, brand: { x: 2373, y: 42, w: 177, h: 242 }, copyright: { x: 2175, y: 1698, w: 185, h: 12 } };
export const PLATFORM = 'Real Estate Intelligence';
export const FIRM_NUMBER_ON = false; // decided Oct 19: off the AI-assisted sets for now

// On every sheet, in the open area of the strip. Texas rules require unsealed preliminary documents to say what they
// are; these sets are reviewed by Real Estate Intelligence before they go out but not sealed.
export const PRELIMINARY = 'PRELIMINARY — NOT FOR CONSTRUCTION, BIDDING OR PERMIT.';
export const PRELIMINARY_TEXT = 'Schematic design drawings prepared with Real Estate Intelligence from a conceptual site plan, with AI assistance, for feasibility, pricing and coordination only. ' +
  'Not prepared or sealed by a licensed architect, engineer or surveyor. Boundary, easements, utilities, drainage, structure and code compliance are not verified ' +
  'and must be designed, verified and sealed by licensed professionals before construction or permitting.';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const box = (r, css = '') => 'position:absolute;left:' + r.x + 'pt;top:' + r.y + 'pt;width:' + r.w + 'pt;' + (r.h ? 'height:' + r.h + 'pt;' : '') + css;

// the CSS the fields need, once per document
export const TB_CSS = '.tb-f{position:absolute;font-family:Montserrat,Arial,Helvetica,sans-serif;color:#1b1e1f;overflow:hidden}' +
  '.tb-k{font-size:5.5pt;letter-spacing:.16em;text-transform:uppercase;color:#4d5457;margin-top:5pt}.tb-k:first-child{margin-top:0}' +
  '.tb-pn{font-size:11pt;font-weight:800;line-height:1.1;text-transform:uppercase;margin-top:1pt}.tb-s{font-size:6.5pt;line-height:1.3}.tb-v{font-size:7.5pt;font-weight:700;line-height:1.25}' +
  '.tb-two{display:flex;gap:8pt}.tb-two>div{flex:1}.tb-pre{border:1pt solid #c0392b;padding:4pt;margin-top:8pt;font-size:5.6pt;line-height:1.3;color:#1b1e1f}.tb-pre b{display:block;color:#c0392b;font-size:6.2pt;margin-bottom:2pt}' +
  '.tb-line{font-size:7pt;font-weight:700;white-space:nowrap}.tb-title{font-size:10.5pt;font-weight:800;text-transform:uppercase;line-height:1.15}.tb-sub{font-size:6.5pt;line-height:1.3;margin-top:2pt}' +
  '.tb-num{font-size:40pt;font-weight:800;text-align:right;line-height:1}.tb-rev{position:absolute;writing-mode:vertical-rl;transform:rotate(180deg);font-family:Arial,Helvetica,sans-serif;font-size:6.5pt;line-height:13pt;white-space:nowrap;overflow:hidden;padding-bottom:2pt;box-sizing:border-box}';

// f: { project: { name, lines: [address, county / acres …] }, client, phase, date, scale, drawnBy, checkedBy,
//      projectNumber, sheet: { number, title, sub }, revisions: [{ no, date, desc }] (oldest first) }
export function titleBlockHTML(f = {}) {
  const P = FIELDS, pr = f.project || {};
  const open = '<div class="tb-f" style="' + box(P.open) + '">' +
    '<div class="tb-k">Project</div><div class="tb-pn">' + esc(pr.name || 'Untitled project') + '</div>' + (pr.lines || []).filter(Boolean).map(l => '<div class="tb-s">' + esc(l) + '</div>').join('') +
    (f.client ? '<div class="tb-k">Prepared for</div><div class="tb-v">' + esc(f.client) + '</div>' : '') +
    '<div class="tb-k">Prepared with</div><div class="tb-v">Real Estate Intelligence</div>' +
    '<div class="tb-k">Phase</div><div class="tb-v">' + esc(f.phase || 'Schematic design') + '</div>' +
    '<div class="tb-two"><div><div class="tb-k">Date</div><div class="tb-v">' + esc(f.date || '') + '</div></div><div><div class="tb-k">Scale</div><div class="tb-v">' + esc(f.scale || 'As noted') + '</div></div></div>' +
    '<div class="tb-pre"><b>' + esc(PRELIMINARY) + '</b>' + esc(PRELIMINARY_TEXT) + '</div></div>';
  const line = (r, v) => v ? '<div class="tb-f tb-line" style="' + box(r) + '">' + esc(v) + '</div>' : '';
  const revs = (f.revisions || []).slice(-REV.rows).map((r, i) => { const x = REV.x0 + i * REV.pitch, cell = (span, v) => v == null || v === '' ? '' : '<div class="tb-rev" style="left:' + x + 'pt;top:' + span[0] + 'pt;width:' + REV.pitch + 'pt;height:' + (span[1] - span[0]) + 'pt">' + esc(v) + '</div>';
    return cell(REV.no, r.no) + cell(REV.date, r.date) + cell(REV.desc, r.desc); }).join('');
  const s = f.sheet || {};
  return open + line(P.drawnBy, f.drawnBy) + line(P.checkedBy, f.checkedBy) + line(P.projectNumber, f.projectNumber) +
    '<div class="tb-f" style="' + box(P.sheetTitle) + '"><div class="tb-title">' + esc(s.title || '') + '</div>' + (s.sub ? '<div class="tb-sub">' + esc(s.sub) + '</div>' : '') + '</div>' +
    '<div class="tb-f" style="' + box(P.sheetNumber, 'display:flex;align-items:flex-end;justify-content:flex-end') + '"><div class="tb-num">' + esc(s.number || '') + '</div></div>' + revs;
}
