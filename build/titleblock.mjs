// Plan set title block: turns the original AutoCAD border (templates/A-XREF-BORD-V01.pdf, a portrait page
// with /Rotate 270) into the clean landscape template every plan set sheet is drawn on (templates/titleblock.pdf):
// the page turned the way it's read (36 x 24 in), the red AutoCAD plot stamp in the left margin covered, the firm's logo
// block and copyright line covered and the platform's name set in the block (unbranded sets), and, while the
// firm number is off (lib/titleblock.mjs FIRM_NUMBER_ON), the "FIRM NUMBER: F-23876" line covered. Run once after a new
// border comes in:  node build/titleblock.mjs   (then look at the result: pdftoppm -png -r 40 templates/titleblock.pdf)
import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import { PAGE, MASKS, FIRM_NUMBER_ON, PLATFORM } from '../lib/titleblock.mjs';

const src = new URL('../templates/A-XREF-BORD-V01.pdf', import.meta.url), out = new URL('../templates/titleblock.pdf', import.meta.url);
const doc0 = await PDFDocument.load(await readFile(src)), p0 = doc0.getPage(0), { width: w0, height: h0 } = p0.getSize();
if (Math.round(w0) !== PAGE.h || Math.round(h0) !== PAGE.w || p0.getRotation().angle !== 270) throw new Error('unexpected border page: ' + w0 + ' x ' + h0 + ' rotated ' + p0.getRotation().angle);
const doc = await PDFDocument.create(), [art] = await doc.embedPages([p0]), page = doc.addPage([PAGE.w, PAGE.h]);
// /Rotate 270 shows the page turned a quarter counter-clockwise: content point (u, v) lands at (W - v, u)
page.drawPage(art, { x: PAGE.w, y: 0, rotate: degrees(90) });
const cover = m => page.drawRectangle({ x: m.x, y: PAGE.h - m.y - m.h, width: m.w, height: m.h, color: rgb(1, 1, 1) }); // masks are measured from the top
cover(MASKS.plotStamp); cover(MASKS.brand); cover(MASKS.copyright);
// the platform's name up the block, read from the right like the drawing's other vertical text
{ const f = await doc.embedFont(StandardFonts.HelveticaBold), b = MASKS.brand, t = PLATFORM.toUpperCase(), size = 15, w = f.widthOfTextAtSize(t, size);
  page.drawText(t, { x: b.x + b.w / 2 + size * 0.35, y: PAGE.h - b.y - b.h / 2 - w / 2, size, font: f, color: rgb(0.05, 0.05, 0.05), rotate: degrees(90) }); }
if (!FIRM_NUMBER_ON) cover(MASKS.firmNumber);
doc.setTitle(PLATFORM + ' title block'); doc.setProducer('fs-real-estate-intelligence build/titleblock.mjs'); doc.setCreator('A-XREF-BORD-V01');
await writeFile(out, await doc.save());
console.log('wrote templates/titleblock.pdf');
