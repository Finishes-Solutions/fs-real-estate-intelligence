// node build/site-aerial.mjs <lat> <lon> <zoom> <out.jpg> [n]: an n×n grid of public satellite tiles stitched with headless Chromium (a study tool: not part of the app)
import { snapshots } from '../lib/pdf.mjs'; import fs from 'node:fs';
const [lat, lon, z, out] = [+process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]], n = +(process.argv[6] || 3), h = Math.floor(n / 2);
const xt = Math.floor((lon + 180) / 360 * 2 ** z), yt = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
let html = '<html><body style="margin:0;background:#000"><div style="display:grid;grid-template-columns:repeat(' + n + ',256px);width:' + 256 * n + 'px">';
for (let dy = -h; dy <= h; dy++) for (let dx = -h; dx <= h; dx++) { const u = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + (yt + dy) + '/' + (xt + dx); const r = await fetch(u); const b = Buffer.from(await r.arrayBuffer()); html += '<img width=256 height=256 src="data:image/jpeg;base64,' + b.toString('base64') + '">'; }
html += '</div></body></html>';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + 256 * n + '" height="' + 256 * n + '"><foreignObject width="100%" height="100%">' + html.replace('<html>', '<html xmlns="http://www.w3.org/1999/xhtml">') + '</foreignObject></svg>';
const n2 = 2 ** z, lonOf = X => X / n2 * 360 - 180, latOf = Y => Math.atan(Math.sinh(Math.PI * (1 - 2 * Y / n2))) * 180 / Math.PI; console.log('BOUNDS', JSON.stringify({ west: lonOf(xt - h), east: lonOf(xt + h + 1), north: latOf(yt - h), south: latOf(yt + h + 1), px: 256 * n }));
const [shot] = await snapshots([svg], { px: 256 * n, quality: 88 }); fs.writeFileSync(out, typeof shot === 'string' ? Buffer.from(shot.replace(/^data:[^,]*,/, ''), 'base64') : shot); console.log('wrote', out); process.exit(0);
