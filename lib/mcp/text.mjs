// Compact text for MCP tool results (api/mcp.js). AMP cuts a result at 40,000 characters; these aim well under 15,000:
// key figures, top-N lists and a sources block, never raw dumps.
export const LIMIT = 15000;
export const n0 = v => v == null || !Number.isFinite(+v) ? '—' : Math.round(+v).toLocaleString('en-US');
export const n1 = v => v == null || !Number.isFinite(+v) ? '—' : (+v).toLocaleString('en-US', { maximumFractionDigits: 1 });
export const usd = v => v == null || !Number.isFinite(+v) ? '—' : '$' + Math.round(+v).toLocaleString('en-US');
export const usdM = v => v == null || !Number.isFinite(+v) ? '—' : Math.abs(v) >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : Math.abs(v) >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : '$' + Math.round(v);
export const pct = v => v == null || !Number.isFinite(+v) ? '—' : (+v > 0 ? '+' : '') + (Math.abs(v) >= 10 ? Math.round(v) : (+v).toFixed(1)) + '%';
export const mi = v => v == null ? '—' : (v < 0.1 ? Math.round(v * 5280) + ' ft' : (+v).toFixed(v < 10 ? 2 : 1) + ' mi');
export const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

// a source line: what, current as of, link, coverage
export const source = ({ name, asOf, url, coverage }) => '- ' + name + (asOf ? ' (' + (/^\d/.test(asOf) ? 'current as of ' + asOf : asOf) + ')' : '') + (url ? ' ' + url : '') + (coverage ? '. Covers: ' + coverage : '');
// a part that failed upstream: a short sentence, never a crash
export function failed(what, e) {
  const m = String(e?.message || e || '');
  return what + (/time|abort|in time/i.test(m) ? ' didn’t answer in time; try again.' : ' isn’t available right now (' + clip(m, 120) + '); try again.');
}
export const notCovered = (what, covers) => what + ': not covered here (covers ' + covers + ').';

// the result text: a title, the body lines, the sources; long lists are cut to fit with a note
export function doc(title, lines, sources = [], notes = []) {
  const head = '# ' + title, src = sources.length ? '\nSources:\n' + sources.map(s => typeof s === 'string' ? s : source(s)).join('\n') : '';
  const tail = (notes.filter(Boolean).length ? '\nNotes:\n' + notes.filter(Boolean).map(x => '- ' + x).join('\n') : '') + src;
  let body = lines.filter(x => x != null && x !== false).join('\n');
  const room = LIMIT - head.length - tail.length - 80;
  if (body.length > room) body = body.slice(0, body.lastIndexOf('\n', room)) + '\n… (cut to keep this answer short; ask a narrower question for the rest)';
  return head + '\n' + body + '\n' + tail;
}
// "label: value" rows, skipping empty values
export const kv = rows => rows.filter(([, v]) => v != null && v !== '' && v !== '—').map(([k, v]) => k + ': ' + v);
export const list = (rows, max, fn) => rows.slice(0, max).map((r, i) => (i + 1) + '. ' + fn(r)).concat(rows.length > max ? ['… and ' + n0(rows.length - max) + ' more'] : []);
