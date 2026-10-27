// node build/site-compare.mjs <parcel.geojson> <aerial.jpg> '<bounds json>' <plan.jpg> <out.jpg> "<left title>" "<right title>": the aerial cropped to
// the parcel (outlined), beside our plan at the same ground scale (a study tool: not part of the app)
import { planFor } from '../lib/mcp/siteplan.mjs'; import * as G from '../lib/sitesheet.mjs'; import { snapshots } from '../lib/pdf.mjs'; import fs from 'node:fs';
const [pf, af, bj, plf, out, tl, tr, plf2, tm] = process.argv.slice(2), B = JSON.parse(bj), geom = JSON.parse(fs.readFileSync(pf)), g = geom.geometry || geom;
const { plan: site } = await planFor([{ label: 'parcel', geometry: g }], [], ''); const PX = 1400, { box } = G.planSVG(site, { px: PX, turn: 0 }), Wft = box[2] - box[0], Hft = box[3] - box[1], s = PX / Wft, PH = Math.round(Hft * s);
const lat0 = (B.north + B.south) / 2, ftLon = 364567 * Math.cos(lat0 * Math.PI / 180), ftLat = 364567; // ft per degree
const ring = g.coordinates[0], lons = ring.map(p => p[0]), lats = ring.map(p => p[1]);
// the plan's box is the parcel's bbox padded 40 ft; the same rectangle in the aerial's pixels
const padX = 40 / ftLon, padY = 40 / ftLat, w0 = Math.min(...lons) - padX, e0 = Math.max(...lons) + padX, n0 = Math.max(...lats) + padY, s0 = Math.min(...lats) - padY;
const px = lon => (lon - B.west) / (B.east - B.west) * B.px, py = lat => (B.north - lat) / (B.north - B.south) * B.px;
const cx = px(w0), cy = py(n0), cw = px(e0) - cx, ch = py(s0) - cy;
const d = f => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');
const pts = ring.map(p => (px(p[0]) - cx) / cw * PX + ',' + (py(p[1]) - cy) / ch * PH).join(' ');
const T = 44, NP = plf2 ? 3 : 2, W = PX * NP + 20 * (NP + 1), H = PH + T + 20, xr = PX * (NP - 1) + 20 * NP;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>
<text x="20" y="30" font-family="Helvetica, Arial" font-size="26" font-weight="700" fill="#222">${tl}</text><text x="${xr}" y="30" font-family="Helvetica, Arial" font-size="26" font-weight="700" fill="#222">${tr}</text>${plf2 ? `<text x="${PX + 40}" y="30" font-family="Helvetica, Arial" font-size="26" font-weight="700" fill="#222">${tm}</text><image x="${PX + 40}" y="${T}" width="${PX}" height="${PH}" href="${d(plf2)}" preserveAspectRatio="xMidYMid meet"/>` : ''}
<svg x="20" y="${T}" width="${PX}" height="${PH}" viewBox="${cx} ${cy} ${cw} ${ch}" preserveAspectRatio="none"><image href="${d(af)}" width="${B.px}" height="${B.px}"/></svg>
<svg x="20" y="${T}" width="${PX}" height="${PH}"><polygon points="${pts}" fill="none" stroke="#ff2d2d" stroke-width="4" stroke-dasharray="14 8"/></svg>
<image x="${xr}" y="${T}" width="${PX}" height="${PH}" href="${d(plf)}" preserveAspectRatio="xMidYMid meet"/>
<text x="${W - 20}" y="${H - 6}" text-anchor="end" font-family="Helvetica, Arial" font-size="14" fill="#666">Both at the same scale · ${Math.round(Wft)} × ${Math.round(Hft)} ft</text></svg>`;
const [shot] = await snapshots([svg], { px: W, quality: 85 }); fs.writeFileSync(out, typeof shot === 'string' ? Buffer.from(shot.replace(/^data:[^,]*,/, ''), 'base64') : shot); console.log('wrote', out, W, 'x', H); process.exit(0);
