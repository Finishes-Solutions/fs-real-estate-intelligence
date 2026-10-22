"""paint.html: the paid step in a browser, for owners without Python. Self-contained (the massing views, prompts and
references are inside it); the key is typed into the page, kept in that tab's memory only, and sent only to
api.openai.com. The result is painted.zip, which the agent imports exactly like a folder painted by paint.py."""
import base64
import io
import json

from PIL import Image

PAGE = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paint renderings</title>
<style>
:root{--ink:#1d1f1e;--mut:#5d625f;--line:#d9dcd8;--bg:#fbfbf9;--acc:#2f6b3a}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 60px}
h1{font-size:22px;margin:0 0 4px}p{margin:6px 0}.mut{color:var(--mut)}
.card{background:#fff;border:1px solid var(--line);border-radius:8px;padding:16px;margin:16px 0}
input[type=password]{width:100%;max-width:520px;padding:8px;border:1px solid var(--line);border-radius:6px;font:inherit}
button{background:var(--acc);color:#fff;border:0;border-radius:6px;padding:9px 16px;font:inherit;cursor:pointer;margin-right:8px}
button:disabled{opacity:.5;cursor:default}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
figure{margin:0;border:1px solid var(--line);border-radius:6px;overflow:hidden;background:#fff}
figure img{width:100%;display:block}figcaption{padding:6px 8px;font-size:13px}
#log{white-space:pre-wrap;font:12px/1.4 ui-monospace,monospace;color:var(--mut)}
</style></head><body><main>
<h1>Paint renderings: <span id="proj"></span></h1>
<p class="mut">Turns the agent's 3D massing views into photoreal renderings with OpenAI. Each view is one paid call, roughly $0.20–0.50.</p>
<div class="card">
<p><b>1. Your OpenAI key</b> <span class="mut">(kept in this tab only and sent only to api.openai.com; it is not saved)</span></p>
<input id="key" type="password" placeholder="sk-..." autocomplete="off">
<p style="margin-top:12px"><b>2. Paint</b> <span class="mut" id="count"></span></p>
<button id="go">Paint all views</button><button id="dl" disabled>Download painted.zip</button>
<p class="mut">3. Send <b>painted.zip</b> back to the agent: it checks every picture against its massing and makes the renderings sheet.</p>
</div>
<div class="grid" id="grid"></div>
<div class="card"><div id="log"></div></div>
</main>
<script>
const PK = __DATA__;
const SIZES = ['1920x1080', '1536x1024', '1024x1024'];
const PRICE = {'gpt-image-1': [10, 2.5, 40], 'gpt-image-1-mini': [2.5, .625, 8], 'gpt-image-1.5': [8, 2, 32], 'gpt-image-2.5-sunburst': [8, 2, 32], 'gpt-image-2': [8, 2, 32]};
const done = {views: []}, files = {};
const $ = id => document.getElementById(id), log = t => { $('log').textContent += t + '\n'; };
$('proj').textContent = PK.project || 'the project';
$('count').textContent = '(' + PK.views.length + ' views, about $' + (PK.views.length * .2).toFixed(2) + '–' + (PK.views.length * .5).toFixed(2) + ')';
for (const v of PK.views) $('grid').insertAdjacentHTML('beforeend', '<figure><img id="img-' + v.id + '" src="' + v.massing[SIZES.find(s => v.massing[s])] + '"><figcaption id="cap-' + v.id + '">' + v.label + ': massing</figcaption></figure>');
const blob = d => fetch(d).then(r => r.blob());
function cost(model, u) { const p = PRICE[model] || PRICE['gpt-image-1']; if (!u) return 0; const i = u.input_tokens || 0, c = (u.input_tokens_details || {}).cached_tokens || 0; return ((i - c) * p[0] + c * p[1] + (u.output_tokens || 0) * p[2]) / 1e6; }
async function paint(v, key, model) {
  for (const size of SIZES.slice(SIZES.indexOf(PK.size || SIZES[0]))) {
    if (!v.massing[size]) continue;
    const f = new FormData();
    f.append('model', model); f.append('prompt', v.prompt); f.append('n', '1'); f.append('size', size); f.append('quality', 'high'); f.append('output_format', 'jpeg'); f.append('input_fidelity', 'high');
    f.append('image[]', await blob(v.massing[size]), 'massing.png');
    for (const r of PK.refs) f.append('image[]', await blob(r.data), r.name);
    const r = await fetch('https://api.openai.com/v1/images/edits', {method: 'POST', headers: {Authorization: 'Bearer ' + key}, body: f});
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.data && d.data[0] && d.data[0].b64_json) return {b64: d.data[0].b64_json, size, model: d.model || model, usage: d.usage};
    const msg = (d.error || {}).message || ('HTTP ' + r.status);
    if (r.status === 400 && /size/i.test(msg)) { log(v.id + ': ' + size + ' refused, trying the next size'); continue; }
    throw new Error(msg);
  }
  throw new Error('no size accepted');
}
$('go').onclick = async () => {
  const key = $('key').value.trim(); if (!key.startsWith('sk-')) { log('Paste your OpenAI key first (it starts with sk-).'); return; }
  $('go').disabled = true; let total = 0; const model = PK.model || 'gpt-image-2.5-sunburst';
  for (const v of PK.views) {
    $('cap-' + v.id).textContent = v.label + ': painting…';
    try {
      const t0 = Date.now(), res = await paint(v, key, model), c = cost(res.model, res.usage); total += c;
      files[v.id + '.jpg'] = Uint8Array.from(atob(res.b64), ch => ch.charCodeAt(0));
      $('img-' + v.id).src = 'data:image/jpeg;base64,' + res.b64;
      $('cap-' + v.id).textContent = v.label + ': painted (' + res.size + ', ~$' + c.toFixed(2) + ')';
      done.views.push({id: v.id, file: v.id + '.jpg', size: res.size, model: res.model, input_fidelity: true, cost_usd: Math.round(c * 1000) / 1000, made: new Date().toISOString().slice(0, 16).replace('T', ' ')});
      log(v.id + ': done in ' + Math.round((Date.now() - t0) / 1000) + ' s');
    } catch (e) { $('cap-' + v.id).textContent = v.label + ': FAILED'; log(v.id + ': ' + e.message); if (/key|auth|401/i.test(e.message)) break; }
  }
  log('Total about $' + total.toFixed(2) + ' (an estimate).'); $('go').disabled = false; $('dl').disabled = !done.views.length;
};
// a stored (uncompressed) zip, so no library is needed
function crc32(b) { let c, t = crc32.t || (crc32.t = [...Array(256)].map((_, n) => { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; })); c = -1; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function zip(entries) {
  const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
  for (const [name, data] of entries) {
    const n = enc.encode(name), crc = crc32(data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, n.length, true);
    parts.push(new Uint8Array(h.buffer), n, data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true);
    cd.push(new Uint8Array(c.buffer), n); off += 30 + n.length + data.length;
  }
  const size = cd.reduce((s, x) => s + x.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cd, new Uint8Array(e.buffer)], {type: 'application/zip'});
}
$('dl').onclick = () => {
  const entries = Object.entries(files).map(([n, d]) => ['painted/' + n, d]);
  entries.push(['painted/painted.json', new TextEncoder().encode(JSON.stringify(done, null, 1))]);
  const a = document.createElement('a'); a.href = URL.createObjectURL(zip(entries)); a.download = 'painted.zip'; a.click();
};
</script></body></html>
'''


def data_url(path, jpeg=False):
    if jpeg:  # the page carries every view at every size: JPEG keeps it to a few MB
        im = Image.open(path).convert('RGB')
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=92)
        return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
    mime = 'image/png' if path.lower().endswith('.png') else 'image/jpeg'
    return 'data:%s;base64,%s' % (mime, base64.b64encode(open(path, 'rb').read()).decode())


def write(path, meta, pkdir):
    """meta: the package's jobs.json; pkdir: the folder its files are in"""
    import os
    data = dict(project=meta.get('project'), model=meta.get('model'), size=meta.get('size'),
                refs=[dict(name=f, data=data_url(os.path.join(pkdir, f), jpeg=True)) for f in meta.get('refs', [])],
                views=[dict(id=v['id'], label=v['label'], prompt=open(os.path.join(pkdir, v['prompt'])).read(),
                            massing={s: data_url(os.path.join(pkdir, f), jpeg=True) for s, f in v['massing'].items()}) for v in meta['views']])
    open(path, 'w').write(PAGE.replace('__DATA__', json.dumps(data)))
