// Filter spec shared by the browser (URL state, saved searches), /api/ask (AI-produced filters)
// and /api/feed (RSS). Spec fields, all optional:
//   c: counties[]  t: types[] ('New'|'Reno'|'Addition')  u: uses[]  min, max: est. value USD  q: keyword
//   who: { k: 'dev'|'arch'|'gc', v: entity key, label }   d: { f: 'reg'|'start'|'active', from: 'YYYY-MM', to: 'YYYY-MM' }
//   chg: 'new'|'any' (in the latest change run)   sel: { k:'r', c:[lon,lat], mi, label } | { k:'c', names[] } | { k:'p', ring:[[lon,lat]...], label }
import { entityKey } from './taxonomy.mjs';

const EARTH_MI = 3958.8, rad = x => x * Math.PI / 180;
export function miles(a, b) {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MI * Math.asin(Math.sqrt(h));
}
function inRing(pt, ring) { // planar ray cast; fine at county scale
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
const monthEnd = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
export const range = d => [d.from ? d.from + '-01' : '0000-00-00', d.to ? monthEnd(d.to) : '9999-12-31'];

export function whoKey(f, k) { return entityKey(k === 'dev' ? (f.dev || f.owner) : f[k]); }

// geometry selections are matched in the browser with the real outlines; servers fall back to these.
export function matchSel(f, sel) {
  if (!sel) return true;
  if (sel.k === 'r') return miles(sel.c, [f.lon, f.lat]) <= sel.mi;
  if (sel.k === 'c') return sel.names.includes(f.county);
  if (sel.k === 'p') return inRing([f.lon, f.lat], sel.ring);
  return true;
}

export function makeMatcher(spec, { changed } = {}) {
  const q = (spec.q || '').trim().toLowerCase(), toks = q ? q.split(/\s+/) : [];
  const [d0, d1] = spec.d ? range(spec.d) : [];
  const c = spec.c && new Set(spec.c), t = spec.t && new Set(spec.t), u = spec.u && new Set(spec.u);
  return f => {
    if (c && !c.has(f.county)) return false;
    if (t && !t.has(f.type)) return false;
    if (u && !u.has(f.use || 'Unclassified')) return false;
    if (spec.min && f.cost < spec.min) return false;
    if (spec.max && f.cost > spec.max) return false;
    if (spec.who && whoKey(f, spec.who.k) !== spec.who.v) return false;
    if (spec.d) {
      if (spec.d.f === 'reg' && !(f.reg >= d0 && f.reg <= d1)) return false;
      if (spec.d.f === 'start' && !(f.ts >= d0 && f.ts <= d1)) return false;
      if (spec.d.f === 'active' && !(f.ts <= d1 && f.te >= d0)) return false;
    }
    if (spec.chg && changed) { const k = changed.get(f.id); if (!k || (spec.chg === 'new' && k !== 'new')) return false; }
    if (toks.length) {
      const hay = (f._hay ||= [f.name, f.owner, f.addr, f.city, f.dev, f.ten, f.sub, f.use, f.arch, f.gc, f.sum, f.scope, f.id].filter(Boolean).join(' ').toLowerCase());
      if (!toks.every(x => hay.includes(x))) return false;
    }
    return true;
  };
}

// compact, URL-safe encoding (used for location.hash, saved searches and the RSS feed query)
export function encode(spec) {
  const p = new URLSearchParams();
  if (spec.c) p.set('c', spec.c.join('|'));
  if (spec.t) p.set('t', spec.t.join('|'));
  if (spec.u) p.set('u', spec.u.join('|'));
  if (spec.min) p.set('min', spec.min);
  if (spec.max) p.set('max', spec.max);
  if (spec.q) p.set('q', spec.q);
  if (spec.who) p.set('who', [spec.who.k, spec.who.v, spec.who.label || ''].join('|'));
  if (spec.d) p.set('d', [spec.d.f, spec.d.from || '', spec.d.to || ''].join('|'));
  if (spec.chg) p.set('chg', spec.chg);
  if (spec.sel?.k === 'r') p.set('r', [spec.sel.c[0].toFixed(5), spec.sel.c[1].toFixed(5), spec.sel.mi, spec.sel.label || ''].join('|'));
  if (spec.sel?.k === 'c') p.set('sc', spec.sel.names.join('|'));
  if (spec.sel?.k === 'p') p.set('p', spec.sel.ring.map(x => x[0].toFixed(4) + ',' + x[1].toFixed(4)).join(';') + (spec.sel.label ? '|' + spec.sel.label : ''));
  return p.toString();
}
export function decode(str) {
  const p = new URLSearchParams(str), spec = {}, list = k => p.get(k) ? p.get(k).split('|').filter(Boolean) : null;
  if (list('c')) spec.c = list('c');
  if (list('t')) spec.t = list('t');
  if (list('u')) spec.u = list('u');
  if (+p.get('min')) spec.min = +p.get('min');
  if (+p.get('max')) spec.max = +p.get('max');
  if (p.get('q')) spec.q = p.get('q').slice(0, 120);
  if (p.get('who')) { const [k, v, label] = p.get('who').split('|'); if (['dev', 'arch', 'gc'].includes(k) && v) spec.who = { k, v, label: label || v }; }
  if (p.get('d')) { const [f, from, to] = p.get('d').split('|'); const ym = s => /^\d{4}-\d\d$/.test(s) ? s : ''; if (['reg', 'start', 'active'].includes(f)) spec.d = { f, from: ym(from), to: ym(to) }; }
  if (['new', 'any'].includes(p.get('chg'))) spec.chg = p.get('chg');
  if (p.get('r')) { const [lon, lat, mi, label] = p.get('r').split('|'); if (isFinite(+lon) && isFinite(+lat) && +mi > 0) spec.sel = { k: 'r', c: [+lon, +lat], mi: Math.min(+mi, 60), label: label || '' }; }
  else if (list('sc')) spec.sel = { k: 'c', names: list('sc') };
  else if (p.get('p')) { const [pts, label] = p.get('p').split('|'); const ring = pts.split(';').map(s => s.split(',').map(Number)).filter(x => x.length === 2 && x.every(isFinite)); if (ring.length >= 3) spec.sel = { k: 'p', ring, label: label || '' }; }
  return spec;
}

export function describe(spec, fmtM = v => '$' + Math.round(v / 1e6) + 'M') {
  const p = [];
  if (spec.c) p.push(spec.c.join(', '));
  if (spec.t) p.push(spec.t.map(t => t === 'Reno' ? 'Renovation' : t).join(', '));
  if (spec.u) p.push(spec.u.join(', '));
  if (spec.min || spec.max) p.push((spec.min ? fmtM(spec.min) : '$0') + (spec.max ? '–' + fmtM(spec.max) : '+'));
  if (spec.who) p.push({ dev: 'Developer', arch: 'Architect', gc: 'GC' }[spec.who.k] + ': ' + spec.who.label);
  if (spec.d) p.push({ reg: 'Registered', start: 'Starting', active: 'Active' }[spec.d.f] + ' ' + (spec.d.from || '…') + ' to ' + (spec.d.to || '…'));
  if (spec.chg) p.push(spec.chg === 'new' ? 'New this week' : 'Changed this week');
  if (spec.q) p.push('“' + spec.q + '”');
  if (spec.sel) p.push(spec.sel.k === 'r' ? 'Within ' + spec.sel.mi + ' mi of ' + (spec.sel.label || 'pin') : spec.sel.k === 'c' ? spec.sel.names.join(' + ') + ' (area)' : (spec.sel.label || 'Custom shape'));
  return p.join(' · ');
}
