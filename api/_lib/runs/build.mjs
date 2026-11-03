// A Build with AI run on the server (api/runs.js), so it carries on when the page is refreshed, closed or left: the
// same steps as the browser's build() in src/siteplan.js (the AI plans the site first at Medium and up, reads the
// request into a program, the engine lays out the options, the AI's own plan is laid out beside them, then the AI
// reviews them, may revise the program or its plan, and compares again), one step at a time, each saved, so a run
// longer than one function call goes on in the next.
// The browser sends the plan as it is and what it already knows about the site (input below). The result is the run as
// an option keeps it (pl.lastRun: the request, the read-out, the AI's note and summary, its pick and the layouts),
// written to the team's copy of the project marked `pending` (not yet put on the map); the page that has the plan open
// puts the pick on the map (src/siteplan.js landJob), and so does the next one to open it.
import * as SP from '../../../lib/siteplan.mjs';
import * as G from '../../../lib/guardrails.mjs';
import * as K from '../../../lib/planpick.mjs';
import * as RUN from '../../../lib/planruns.mjs';
import * as ASK from '../../../lib/planask.mjs';
import * as BR from '../../../lib/planbrief.mjs';
import { layoutOptions } from '../../../lib/sitelayout.mjs';
import { planSVG } from '../../../lib/sitesheet.mjs';
import { snapshots } from '../../../lib/pdf.mjs';
import { siteAI } from '../../siteplan.js';

// tests: stand-ins for the AI and the plan pictures
export const hooks = { ai: null, shots: null };
const clone = o => JSON.parse(JSON.stringify(o));

// input: { plan, ask, level, site, facts, refs?, teamTypes?, guardrails?, aiFor?, aiOff?, answered?, parts?, perParcel? }
export function start(input) {
  const pl = input?.plan;
  if (!pl || !Array.isArray(pl.ring) || pl.ring.length < 3) throw new Error('the plan has no site outline');
  const ask = String(input.ask || '').trim().slice(0, 2000); if (!ask) throw new Error('say what should go on the site');
  const L = ASK.effortOf(input.level), ai = !input.aiOff, thinks = ai && !!L.plan, review = ai && L.rounds > 0;
  const lay = SP.ringArea(pl.ring) > 40 * 43560 ? 'Laying out (big site: up to a minute)' : L.layout?.count ? 'Laying out ' + L.layout.count + ' layouts' : 'Laying out';
  const labels = [...(thinks ? [L.plan.count > 1 ? 'Thinking through ' + L.plan.count + ' plans for the site' : 'Thinking the site through'] : []), 'Reading your request', lay, ...(review ? ['AI review'] : []), ...(review && L.rounds > 1 ? ['Comparing'] : [])];
  return { label: labels[0], steps: labels, data: { input: { ...input, ask }, phase: thinks ? 'strategy' : 'program', at: new Date().toISOString() } };
}

// the layout engine as the browser runs it (src/siteplan.js laid): inside the Waller guardrails when they're on
function laid(plan, prog, opts) {
  const g = G.forLayout(plan, prog, opts || {});
  if (!g) return layoutOptions(plan, prog, opts);
  const base = { ...plan, program: prog };
  return (layoutOptions(g.plan, g.program, g.opts) || []).map(o => G.unapply(o, base));
}
const planOf = (v, plan) => ({ ...plan, setbacks: v.setbacks || plan.setbacks, program: v.program || plan.program, params: v.params || plan.params, zones: v.zones || plan.zones || [], elements: v.elements || [] });
// the layouts named and measured as the browser's named() does (the money is worked out again where they're shown)
function named(list, plan, extra = {}) {
  const laidAs = G.isOn(plan) ? G.settingsOf(plan).scenario : null;
  const vs = (list || []).map(r => { const v = { ...r, ...extra, arr: r.arr || RUN.baseName(r.name), setbacks: r.setbacks || plan.setbacks, laidAs };
    if (r.pondDepth) v.params = G.withPondDepth({ ...plan, params: v.params || plan.params }, r.pondDepth).params;
    const p2 = planOf(v, plan); v.m = G.metrics(p2);
    if (v.elements?.length) { v.chk = K.checksOf(G.check(p2), v.m); v.m1 = v.elements.some(e => e.phase === 2) ? G.metrics({ ...p2, elements: v.elements.filter(e => e.phase !== 2) }) : null; }
    else v.chk = { bad: null, short: K.checksOf([], v.m).short };
    return v; });
  const keys = RUN.layoutKeys(vs), names = RUN.layoutNames(vs);
  return vs.map((v, i) => ({ ...v, rank: -i, key: keys[i], name: names[i] }));
}
const renumber = list => { const nm = RUN.layoutNames(list); return list.map((v, i) => ({ ...v, name: nm[i] })); };
const AIP = 'AI’s plan';
function aiLayout(out, plan, prog, ab, extra = {}) {
  const pk = BR.pickBriefLayout(out, ab.brief); if (!pk.o) return { reason: pk.reason };
  const v = named([pk.o], { ...plan, program: pk.o.program || prog }, extra)[0];
  return { v: { ...v, key: 'ai' + (ab.revised ? '2' : '') + '|' + v.key, arr: (ab.revised ? AIP + ', revised' : AIP) + ' · ' + v.arr, aiBrief: { ...ab, changed: BR.changedNotes(v.notes), met: BR.briefMet(v) } } };
}
const briefCheckOf = (pool, mayRevise, briefFor, dropped = null) => { const i = pool.findIndex(v => v.aiBrief), ab = i >= 0 ? pool[i].aiBrief : dropped?.brief;
  if (!ab) return {};
  return { briefCheck: { option: i >= 0 ? i : null, brief: ab.brief, reasons: ab.reasons, met: i >= 0 && !!ab.met, mayRevise: !!mayRevise && !(i >= 0 && ab.met), ...(i < 0 ? { dropped: dropped.reason } : {}) }, ...(briefFor ? { briefFor } : {}) }; };
async function forReview(list, plan, images) {
  const svgs = list.slice(0, images).map(v => planSVG(G.effective(planOf(v, plan)), { px: 1000 }).svg);
  const shots = svgs.length ? await (hooks.shots || snapshots)(svgs).catch(() => []) : [];
  return list.map((v, i) => { const m = v.m, B = (v.elements || []).filter(e => e.kind === 'building');
    return { name: v.name || v.arr, notes: v.notes, issues: G.check(planOf(v, plan)).map(x => x.text).slice(0, 8), image: shots[i] || null,
      metrics: { acres: +m.acres.toFixed(2), buildings: B.length, floorAreaSf: Math.round(m.gfa), units: m.units || 0, unitsPerAcre: +(m.duAc || 0).toFixed(1), parkingSpaces: m.spaces, parkingRequired: m.required, coveragePct: Math.round(m.coverage * 100), far: +m.far.toFixed(2), pondAcres: +(m.pond / 43560).toFixed(2), openSpacePct: Math.round(m.green * 100), leasableSf: Math.round(m.leasable || 0) } }; });
}

// one step of the run; d is the run's saved state, job.step/label what the page shows
export async function step(job, d, ctx) {
  const I = d.input, L = ASK.effortOf(I.level), pl = I.plan, ask = I.ask, thinks = !I.aiOff && !!L.plan, o0 = thinks ? 1 : 0;
  const REF = ['program', 'strategy', 'review'];
  const post = async b => { // the app's AI endpoint, as the browser's post() calls it
    const body = { ...b, ...(I.guardrails ? { guardrails: I.guardrails } : {}), ...(I.refs?.length && REF.includes(b.mode || 'program') ? { refs: I.refs } : {}), ...(I.aiFor || {}) };
    const ms = Math.max(5000, ctx.left() - 15000); let tm;
    const r = await Promise.race([(hooks.ai || siteAI)(body), new Promise(res => { tm = setTimeout(() => res({ status: 504, body: { error: 'the AI took too long' } }), ms); })]).finally(() => clearTimeout(tm));
    if (r.status !== 200) throw Object.assign(new Error(r.body?.error || 'AI unavailable'), { status: r.status });
    return r.body;
  };
  const at = (n, label) => { job.step = n; job.label = label || job.steps[n - 1]; };
  const briefFor = () => thinks && BR.asksBrief(L, ask) ? BR.briefContext(pl, SP.guessProgram(ask), { ask }) : null;

  if (d.phase === 'strategy') {
    at(1); const bf = briefFor();
    try {
      const s = await post({ mode: 'strategy', prompt: ask, site: I.site, facts: I.facts, program: pl.program, effort: L.plan.effort, count: L.plan.count, ...(bf ? { briefFor: bf } : {}) }), pk = s.strategies?.[s.pick] || s.strategies?.[0];
      if (pk) { const { brief, briefNote, ...pk0 } = pk; d.strategy = { ...pk0, why: s.why || '', alts: (s.strategies || []).filter(x => x !== pk).map(x => x.name).filter(Boolean) };
        if (bf) { d.aiB = brief?.brief ? brief : null; d.aiBNote = briefNote || (d.aiB ? '' : 'The AI gave no plan of its own for this lot, so these are the engine’s own layouts.'); } }
    } catch (e) { if (bf) d.aiBNote = 'The AI’s plan didn’t come back, so these are the engine’s own layouts.'; }
    d.phase = 'program'; return;
  }
  if (d.phase === 'program') {
    at(1 + o0, 'Reading your request' + (d.strategy ? ' (following the plan)' : ''));
    d.prog = SP.keepNames(SP.guessProgram(ask), pl.program); d.setbacks = pl.setbacks; d.note = ''; d.assumed = []; d.aiOk = false;
    if (!I.aiOff) try {
      const r = await post({ prompt: ask, site: I.site, facts: I.facts, program: pl.program, effort: L.effort, teamTypes: I.teamTypes || [], ...(d.strategy ? { strategy: d.strategy } : {}) });
      d.prog = SP.keepNames(r.program || d.prog, pl.program); d.setbacks = { ...SP.SETBACKS, ...r.setbacks }; d.note = r.summary || ''; d.assumed = (r.assumptions || []).filter(Boolean); d.aiOk = true;
      if (r.questions?.length && !I.answered && (pl.parcels || []).length > 1) { d.result = { questions: r.questions.slice(0, 3) }; job.state = 'done'; return; }
    } catch (e) { d.note = e.status === 503 ? '' : 'The AI didn’t answer, so this read your words directly.'; }
    if (!d.aiOk) { d.strategy = null; d.aiB = null; if (d.aiBNote) d.aiBNote = ''; }
    if (d.aiB && d.prog?.zones?.length) { d.prog = BR.withPads(d.prog, d.aiB.brief.pads); d.aiB = null; }
    d.phase = 'layout'; return;
  }
  if (d.phase === 'layout') {
    const prog = d.prog, np = SP.normalizeProgram(prog);
    d.readAs = { ask, chips: RUN.readAs(np, SP.USES), miss: RUN.notUnderstood(ask, np), assumed: d.assumed, by: d.aiOk ? 'ai' : 'words', ...(d.strategy ? { plan: d.strategy } : {}), ...(d.aiB ? { brief: d.aiB } : {}), ...(d.aiBNote ? { briefNote: d.aiBNote } : {}) };
    const st0 = d.strategy?.settings || {}; let params0 = RUN.fillParams({ ...(pl.params || {}), ...(st0.streets ? { streets: st0.streets } : {}), ...(d.strategy?.buildings?.form ? { form: d.strategy.buildings.form } : {}) }, { ask });
    if (np.form) params0 = { ...(params0 || pl.params || {}), form: np.form };
    at(2 + o0);
    const ko = (pl.elements || []).filter(e => e.kind === 'keepout'), koOpts = ko.length ? { keepout: clone(ko) } : {}, wb = BR.wordsBrief(ask);
    const parcelOpts = (I.parts?.length > 1 && (I.perParcel || np.parcels)) ? { parcels: I.parts, perParcel: true } : {};
    const plan = { ...pl, setbacks: d.setbacks, ...(params0 ? { params: params0 } : {}) };
    let out = []; try { out = laid(plan, prog, { ...L.layout, deeper: true, ...koOpts, ...(wb ? { brief: wb } : {}), ...parcelOpts }); } catch (e) { d.layoutError = e.message; }
    let variants = named(out, { ...plan, program: prog }, params0 ? { params: params0 } : {});
    if (d.aiB && !d.layoutError) {
      if (BR.takesBrief(prog, d.aiB.brief)) {
        const bf = BR.briefForm(d.aiB.brief), pA = bf ? { ...(plan.params || {}), form: bf } : plan.params, planA = { ...plan, ...(pA ? { params: pA } : {}) }; let got = null;
        try { got = aiLayout(laid(planA, prog, { count: 2, ...koOpts, brief: d.aiB.brief }), planA, prog, d.aiB, pA ? { params: pA } : {}); } catch (e) { got = null; }
        if (got?.v) variants = renumber(BR.placeAi(variants, got.v));
        else { d.aiDrop = { brief: d.aiB, reason: got?.reason || 'the layout engine couldn’t lay it out' }; d.aiBNote = BR.droppedNote(d.aiB.brief, d.aiDrop.reason); d.readAs.briefNote = d.aiBNote; }
      } else d.readAs.briefNote = 'The AI’s plan is for shops and offices; this request reads as something else, so these are the engine’s own layouts.';
    }
    if (d.aiBNote) d.note = (d.note ? d.note + ' ' : '') + d.aiBNote;
    d.plan = plan; d.params1 = plan.params || {}; d.variants = variants; d.extra = []; d.revised = []; d.koOpts = koOpts; d.wb = wb;
    d.meta = { ask, at: d.at, effort: d.aiOk ? I.level : 'low' };
    const review = !I.aiOff && L.rounds > 0;
    if (!RUN.holdsForReview({ ai: d.aiOk, rounds: review ? L.rounds : 0, any: variants.some(v => v.elements?.length) })) {
      d.aiNote = review && !d.aiOk && d.note ? d.note + ' These layouts were not reviewed by the AI.' : d.note; d.phase = 'finish'; return;
    }
    let pool = variants.filter(v => v.elements?.length).slice(0, L.pool);
    { const a = variants.find(v => v.aiBrief && v.elements?.length); if (a && !pool.includes(a)) pool = pool.slice(0, Math.max(0, L.pool - 1)).concat([a]); }
    d.pool = pool.map(v => v.key); d.round = 1; d.reviewT0 = Date.now(); d.phase = 'review'; return;
  }
  const byKey = k => d.variants.find(v => v.key === k) || d.extra.find(v => v.key === k);
  if (d.phase === 'review') {
    at(3 + o0, d.round > 1 ? 'The AI is comparing the revised layouts' : d.strategy ? 'The AI is reviewing the layouts against its plan' : 'The AI is reviewing the layouts');
    const pool = d.pool.map(byKey).filter(Boolean), late = Date.now() - d.reviewT0 > RUN.reviewLimitMs(L.rounds);
    let rv = null;
    if (!late) try {
      const extra = d.round === 1 ? briefCheckOf(pool, L.rounds >= 2, briefFor(), d.aiDrop) : briefCheckOf(pool, false, briefFor());
      rv = await post({ mode: 'review', prompt: ask, site: I.site, facts: I.facts, program: d.progR || d.prog, round: d.round, rounds: Math.max(1, L.rounds), effort: L.effort, options: await forReview(pool, { ...d.plan, params: d.params1 }, L.images || 4), ...(d.strategy ? { strategy: d.strategy } : {}), ...extra });
    } catch (e) { rv = null; }
    if (!rv) { // no answer: a later round keeps the first round's verdict on the layouts it saw, else the run goes unreviewed
      if (d.rv0) { const keep = d.keep || []; d.rv = { ...d.rv0, revise: false, brief: null, reviews: (d.rv0.reviews || []).filter(r => keep.includes(r.option)).map(r => ({ ...r, option: keep.indexOf(r.option) })), ranking: keep.map((_, k) => k).concat(d.add.map((_, k) => keep.length + k)) }; }
      else d.why = late ? 'timeout' : 'failed';
      d.phase = 'finish'; return;
    }
    d.rv = rv;
    if (d.round < L.rounds && !late && (rv.revise && rv.program || rv.brief && !d.briefDone)) { d.phase = 'revise'; return; }
    if (!d.revised.length && !d.briefRev) at(4 + o0, 'Comparing');
    d.phase = 'finish'; return;
  }
  if (d.phase === 'revise') {
    const rv = d.rv, pool = d.pool.map(byKey).filter(Boolean); let add = [], progR = d.progR || d.prog;
    if (rv.revise && rv.program) {
      at(4 + o0, (d.revised.length ? 'Revising again: ' : 'Revising: ') + (rv.why || 'a better program').replace(/\.$/, ''));
      const params2 = RUN.fillParams({ ...d.params1, ...(rv.params?.streets ? { streets: rv.params.streets } : {}), ...(rv.params?.form ? { form: rv.params.form } : {}) }, { ask }), prog2 = { ...rv.program, ...(rv.params?.storm ? { storm: rv.params.storm } : {}) };
      let out2 = []; try { out2 = laid({ ...pl, setbacks: d.setbacks, params: params2 }, prog2, { ...(L.revise || { count: 3, depth: 6, budgetMs: 6000 }), ...d.koOpts, ...(d.wb ? { brief: d.wb } : {}) }); } catch (e) { out2 = []; }
      const v2 = named(out2, { ...d.plan, params: params2, program: prog2 }, { params: params2, revisedBy: rv.why || 'the AI review' }).filter(v => v.elements?.length);
      if (v2.length) { add = v2.slice(0, 3); progR = prog2; d.params1 = params2; d.revised.push(rv.why || 'a better program'); }
    }
    if (rv.brief && !d.briefDone) {
      d.briefDone = true; at(4 + o0, 'The AI is revising its plan: ' + (rv.briefWhy || 'the engine couldn’t do it as written').replace(/\.$/, ''));
      const ab2 = { ...rv.brief, revised: true, why: rv.briefWhy || '' }; let a2 = null;
      const bf2 = BR.briefForm(ab2.brief), pB = bf2 ? { ...(d.plan.params || {}), form: bf2 } : d.plan.params, planB = { ...d.plan, ...(pB ? { params: pB } : {}) };
      if (BR.takesBrief(d.prog, ab2.brief)) try { a2 = aiLayout(laid(planB, d.prog, { count: 2, ...d.koOpts, brief: ab2.brief }), planB, d.prog, ab2, pB ? { params: pB } : {}); } catch (e) { a2 = null; }
      if (a2?.v) { add.push(a2.v); d.briefRev = rv.briefWhy || 'the engine couldn’t do its first plan as written'; }
      else d.dropRev = BR.droppedNote(ab2.brief, a2?.reason || 'the layout engine couldn’t lay it out', true);
    }
    if (!add.length) { d.phase = 'finish'; return; }
    const nm = RUN.layoutNames([...d.variants, ...d.extra, ...add]); add.forEach((v, k) => { v.name = nm[d.variants.length + d.extra.length + k]; });
    d.extra = d.extra.concat(add);
    const keep = [...new Set([...(rv.ranking || []), ...pool.map((_, i) => i)])].filter(i => pool[i]).slice(0, 3);
    d.rv0 = rv; d.keep = keep; d.add = add.map(v => v.key); d.pool = keep.map(i => pool[i].key).concat(add.map(v => v.key)); d.progR = progR; d.round++; d.phase = 'review'; return;
  }
  if (d.phase === 'finish') {
    let variants = d.variants, summary = '', pick = null, note;
    if (d.rv) {
      const pool = d.pool.map(byKey).filter(Boolean), r = RUN.mergeReviewed(variants, pool, d.rv, d.extra);
      variants = r.variants; summary = r.summary; pick = BR.fairPick(variants, r.first) || null;
      note = [d.revised.length ? 'After its first look the AI changed the program: ' + d.revised.map(w => w.replace(/\.$/, '')).join('; then again: ') + '.' + (d.aiBNote ? ' ' + d.aiBNote : '') : d.note, d.dropRev, d.briefRev ? 'The engine couldn’t do the AI’s first plan as written, so the AI revised it once: ' + d.briefRev.replace(/\.$/, '') + '.' : ''].filter(Boolean).join(' ');
    } else note = d.aiNote != null ? d.aiNote : RUN.unreviewedNote(d.why || 'failed', d.note || '');
    const best = RUN.landing(variants, pick);
    d.result = { run: { ask, note, ...(summary ? { summary } : {}), read: d.readAs, ...(pick ? { pick } : {}), at: d.at, effort: d.meta.effort, aiReviewed: variants.some(v => v.ai), variants }, put: best.put, nothing: best.put < 0, ...(d.layoutError ? { layoutError: d.layoutError } : {}) };
    // kept with the option in the team's copy, not yet on the map (pending: the page that opens it puts the pick there)
    if (ctx.changeProject && job.pid) await ctx.changeProject(job.pid, p => {
      const q = (p.plans || []).find(x => x.id === job.plid); if (!q) return false;
      q.lastRun = { ...RUN.slimRun(d.result.run, q.variant?.key), pending: job.id }; return true;
    }).catch(e => { d.result.saveError = e.message; });
    job.state = 'done'; job.label = d.result.nothing ? 'Nothing fits that request on this site' : 'Layouts ready';
  }
}
export const minMs = 70000; // a step can take an AI call and a layout: not started with less than this left
