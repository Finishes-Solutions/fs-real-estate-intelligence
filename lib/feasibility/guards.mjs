// @ts-check
// Guards on any model-written text in a report (the optional narrative, api/feasibility.js), and on the rendered report.
// Chatter patterns, the placeholder pattern and the rendered-HTML checks are ported from fs-cre-report-runner
// lib/v2/validation/index.js (matthew/nifty-mendel-hc0iwc @ 35c1fe4). Added here: the narrative may not introduce a
// number the study doesn't have (every figure on the report is the engine's), and it has a length limit.

export const CHATTER_PATTERNS = [
  /\bif you (?:want|would like|'d like|need)\b/i, /\bi can (?:next|also|then|now)\b/i, /\blet me know\b/i, /\bwould you like\b/i, /\bfeel free to\b/i,
  /\bi(?:'| a)m happy to\b/i, /\bi can (?:produce|generate|create|prepare|draft|provide|build)\b/i, /\bjust (?:ask|say the word)\b/i, /\bas an ai\b/i,
  /\bhere(?:'| i)s (?:the|your) (?:report|document|analysis)\b/i, /\bnext,? i (?:will|can|'ll)\b/i, /\bshall i\b/i, /\bdo you want me to\b/i
];
export const PLACEHOLDER_RE = /\{\{[^}]*\}\}|\{%[^%]*%\}|\[\[[^\]]*\]\]|__[A-Z_]{3,}__|TODO:|FIXME:|XXX:/;

export function findChatter(text) {
  const out = []; if (typeof text !== 'string') return out;
  for (const re of CHATTER_PATTERNS) { const m = text.match(re); if (m) out.push({ pattern: re.source, match: m[0] }); }
  return out;
}
// sentences without chatter (the fallback cleaner)
export const stripChatter = text => typeof text !== 'string' ? text : text.split(/(?<=[.!?])\s+/).filter(s => !findChatter(s).length).join(' ').trim();

// the numbers in a text, normalized: "$1.2M" → 1200000, "5.07%" → 5.07, "1,234" → 1234
export function numbersIn(text) {
  const out = [];
  for (const m of String(text).matchAll(/\$?(\d[\d,]*(?:\.\d+)?)\s*(%|[mM](?:illion)?\b|[kK]\b|[bB](?:illion)?\b)?/g)) {
    let v = +m[1].replace(/,/g, ''); const u = (m[2] || '').toLowerCase();
    if (u.startsWith('m')) v *= 1e6; else if (u === 'k') v *= 1e3; else if (u.startsWith('b')) v *= 1e9;
    out.push({ text: m[0], value: v, pct: u === '%' });
  }
  return out;
}
// every number a narrative may quote: the study's headline, budget totals, site figures and assumptions, in the forms a
// writer would round them to
export function allowedNumbers(study) {
  const set = [], add = v => { if (Number.isFinite(v)) set.push(v); };
  const walk = o => { for (const v of Object.values(o || {})) if (typeof v === 'number') { add(v); add(v * 100); } };
  walk(study.pf?.headline); walk(study.budget?.totals); walk(study.site); walk(study.values); walk(study.pf?.breakEven);
  add(study.site?.envelope?.ratio * 100); for (const r of study.sensitivity?.tornado?.rows || []) { add(r.lo * 100); add(r.hi * 100); }
  return set;
}
const close = (a, b) => { const d = Math.abs(a - b); return d <= 0.051 || d <= Math.abs(b) * 0.006; }; // (to one decimal, or ~0.5% for rounded dollars)

// a narrative checked before it goes on a report: { ok, text, problems }
export function checkNarrative(text, study, { maxChars = 1400 } = {}) {
  const problems = [];
  if (typeof text !== 'string' || !text.trim()) return { ok: false, text: '', problems: ['empty'] };
  let t = stripChatter(text.replace(/\s+/g, ' ').trim());
  if (t.length > maxChars) problems.push('too long (' + t.length + ' characters)');
  if (PLACEHOLDER_RE.test(t)) problems.push('a template placeholder');
  if (findChatter(t).length) problems.push('authoring chatter');
  const allowed = allowedNumbers(study), small = n => !n.text.includes('$') && !n.pct && n.value <= 31 && Number.isInteger(n.value); // (counts, years, months)
  const strays = numbersIn(t).filter(n => !small(n) && !allowed.some(a => close(n.value, a)));
  if (strays.length) problems.push('numbers the study doesn’t have: ' + strays.map(n => n.text).slice(0, 5).join(', '));
  return { ok: !problems.length, text: t, problems };
}

// the rendered report: a whole document, no raw placeholders, no chatter
/** @param {string} html @param {{ title?: string }} [o] */
export function checkRenderedHtml(html, { title } = {}) {
  const problems = [], text = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  if (!/^<!DOCTYPE html>/i.test(html.trim())) problems.push('Missing <!DOCTYPE html>');
  if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) problems.push('Missing <html> wrapper');
  if (title && !text.includes(title)) problems.push('Missing report title "' + title + '"');
  const ph = text.match(PLACEHOLDER_RE); if (ph) problems.push('Raw template placeholder found: "' + ph[0] + '"');
  if (/\bundefined\b|\bNaN\b|\[object Object\]/.test(text)) problems.push('A value that did not render (undefined / NaN / [object Object])');
  for (const f of findChatter(text)) problems.push('Authoring chatter: "' + f.match + '"');
  return { ok: !problems.length, problems };
}
