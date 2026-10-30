// The project workspace (Projects › a project › Feasibility): one project from intake to its report set, step by step
// (Intake → Site → Plans → Budget → Pro Forma → Reports), with the project's numbers always beside it. Everything is
// computed here in the browser from the project document by the same pipeline the API and the tests run
// (lib/feasibility/pipeline.mjs); edits are saved on the project (project.fz) and synced with the team like the rest of
// it (src/siteplan.js save). The report files come from api/feasibility.js; without it the report still opens here as a
// page to print.
// env (from src/siteplan.js): { save(p), openOption(pid, plid), newPlan(p, extra), setTab(p, tab), goMap(), code(), name(), toast(msg),
// saveFile(name, data, mime) (the app's own save: recorded on the Reports tab) }
import * as P from './lib/feasibility/pipeline.mjs';
import * as M0 from './lib/feasibility/model.mjs';
import { marketContext } from './lib/feasibility/market.mjs';
import { buildSurvey } from './lib/feasibility/survey.mjs';
import { feasibilityReport } from './lib/reports/feasibility.mjs';
import { fmtVal } from './lib/feasibility/register.mjs';
import { planSVG } from './lib/sitesheet.mjs';
import * as S from './lib/siteplan.mjs';
import { layoutOptions, layoutGallery } from './lib/sitelayout.mjs';
import { covers } from './lib/sitegen.mjs';
import { partsOf } from './lib/siteparcels.mjs';
import { layoutSig } from './lib/planstages.mjs';
import * as kit from './reportkit.js';
import { usd, usdM, pct, num, tornadoSvg, gridTitle, breakEvenText } from './lib/feasibility/format.mjs';

const { esc } = kit;
const GROUPS = Object.entries(M0.GROUP_LABELS);
const KIND = { data: 'Data', library: 'Library', plan: 'Plan', house: 'House', user: 'Yours', derived: 'Derived' };
const STEP_ICON = { done: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' };

export function workspace(env) {
  const ui = new Map(); // per project: { step, editing (scenario id or ''), busy, err, open (assumption groups), reportBusy, reportErr }
  const cache = new Map(); // per project: { key, study, scenarios }
  let market = null, marketP = null, marketErr = false, root = null, cur = null, computeT = 0;
  const saveT = new Map(); // per project: a pending save (one project's edit never cancels another's)
  const st = p => { if (!ui.has(p.id)) ui.set(p.id, { step: null, editing: '', open: { cost: true, revenue: true, financing: true } }); return ui.get(p.id); };

  // the platform's market data (rates, PPI, ZORI): fetched once
  function loadMarket() {
    if (market || marketP) return marketP;
    marketP = Promise.all(['data/area.json', 'data/markets.json'].map(u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null)))
      .then(([area, markets]) => { market = marketContext({ area, markets }); marketErr = !area && !markets; paint(); }).catch(() => { marketErr = true; market = marketContext({}); paint(); });
    return marketP;
  }
  // the study for the project as it stands (recomputed only when its inputs change)
  function studyOf(p, { sensitivity = true } = {}) {
    if (!market) return null;
    const key = M0.hashOf({ fz: p.fz || null, plans: (p.plans || []).map(pl => [pl.id, layoutSig(pl), pl.updated || '', JSON.stringify(pl.program || {})]), parcels: (p.parcels || []).map(x => x.key), site: p.site?.at || '' });
    const c = cache.get(p.id); if (c?.key === key && (c.sens || !sensitivity)) return c; // (a study with sensitivity serves one without)
    let study, scenarios = [], err = null;
    try { study = P.runStudy(p, { market, sensitivity }); scenarios = study.missing ? [] : P.compareScenarios(p, { market }); } catch (e) { err = e; console.error('feasibility', e); }
    const out = { key, sens: sensitivity, study, scenarios, err }; cache.clear(); cache.set(p.id, out); return out; // (only the open project's study is kept)
  }
  // project.fz with its defaults filled in, once: later calls return the same object, so a change made after an await
  // lands on the project, not on a copy
  const normal = new WeakSet();
  const fz = p => { if (!p.fz || !normal.has(p.fz)) { p.fz = M0.fzOf(p); normal.add(p.fz); } return p.fz; };
  function changed(p, now = false) { // saved on the project (debounced while typing) and the numbers redrawn
    cache.delete(p.id); clearTimeout(computeT); computeT = setTimeout(() => paint(), now ? 0 : 220);
    clearTimeout(saveT.get(p.id)); saveT.set(p.id, setTimeout(() => { saveT.delete(p.id); env.save(p); }, now ? 0 : 900));
  }

  // ---------- the frame: stepper, step, summary rail ----------
  function html(p) { cur = p; loadMarket(); return '<div class="ws" id="wsRoot">' + inner(p) + '</div>'; }
  function inner(p) {
    const s = st(p), c = market ? studyOf(p, { sensitivity: ['proforma', 'reports'].includes(s.step) }) : null, study = c?.study;
    const status = study?.status || P.stepStatus(p, null);
    if (!s.step) s.step = M0.STEPS.find(x => status[x.id].state !== 'done')?.id || 'reports';
    const steps = '<nav class="ws-steps" aria-label="Feasibility steps"><ol>' + M0.STEPS.map(x => { const k = status[x.id].state, on = x.id === s.step;
      return '<li><button type="button" class="ws-step" data-step="' + x.id + '" data-state="' + k + '"' + (on ? ' aria-current="step"' : '') + '>' + // (the name is what shows, plus the step's state for screen readers)
        '<span class="ws-dot">' + (k === 'done' ? STEP_ICON.done + '<span class="sr">' + x.n + '</span>' : x.n) + '</span> <span class="ws-sl">' + x.label + '</span><span class="sr"> (' + ({ done: 'done', ready: 'ready', blocked: 'waiting on an earlier step' })[k] + ')</span></button></li>'; }).join('') + '</ol></nav>';
    const step = M0.stepById(s.step);
    let body;
    if (!market) body = loading('Loading the platform’s market data (rates, costs, rents)…');
    else if (c?.err) body = errorBox('The study couldn’t be worked out: ' + c.err.message, 'retry');
    else body = ({ intake: intakeStep, site: siteStep, plans: plansStep, budget: budgetStep, proforma: proformaStep, reports: reportsStep })[s.step](p, study, c);
    const next = M0.STEPS[step.n], prev = M0.STEPS[step.n - 2];
    const nav = '<div class="ws-nav">' + (prev ? '<button type="button" class="btn" data-step="' + prev.id + '">‹ ' + prev.label + '</button>' : '<span></span>') +
      (next ? '<button type="button" class="btn primary" data-step="' + next.id + '"' + (status[next.id].state === 'blocked' ? ' aria-disabled="true" title="' + esc(status[next.id].need) + '"' : '') + '>' + next.label + ' ›</button>' : '') + '</div>';
    return steps + '<div class="ws-grid"><section class="ws-main" aria-labelledby="wsH"><header class="ws-sh"><div class="kicker">Step ' + step.n + ' of ' + M0.STEPS.length + '</div><h3 id="wsH" tabindex="-1">' + step.label + '</h3><p class="ws-about">' + esc(step.about) + '</p>' +
      (s.busy ? '<p class="ws-busy" role="status"><span class="ws-spin" aria-hidden="true"></span>' + esc(s.busy) + '</p>' : '') + (s.err ? '<div class="ws-err" role="alert">' + esc(s.err) + '</div>' : '') + (c?.study?.errors?.length ? '<div class="ws-warnbox" role="status"><b>Inputs to check:</b> ' + c.study.errors.map(esc).join(' ') + (c.study.errors.some(e => /unknown assumption/.test(e)) ? ' <button type="button" class="lnk" data-act="dropUnknown">Remove changes this option doesn’t use</button>' : '') + '</div>' : '') + (marketErr ? '<div class="ws-warnbox">The platform’s market data didn’t load: interest rates use house defaults and there is no rent check or cost escalation until it does.</div>' : '') + '</header>' + body + nav + '</section>' + rail(p, study, c) + '</div>' +
      '<p class="ws-scope"><b>Scope.</b> ' + esc(M0.SCOPE) + '</p>';
  }
  const loading = msg => '<div class="ws-loading" role="status" aria-live="polite"><span class="ws-spin" aria-hidden="true"></span>' + esc(msg) + '<div class="ws-skel" aria-hidden="true"><i></i><i></i><i></i></div></div>';
  const errorBox = (msg, act) => '<div class="ws-err" role="alert"><b>Something went wrong.</b> ' + esc(msg) + (act ? ' <button type="button" class="btn" data-act="' + act + '">Try again</button>' : '') + '</div>';
  const empty = (title, text, btn, act) => '<div class="ws-empty"><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="10" width="36" height="28" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 18h36M14 26h12M14 31h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><h4>' + esc(title) + '</h4><p>' + esc(text) + '</p>' + (btn ? '<button type="button" class="btn primary" data-act="' + act + '">' + esc(btn) + '</button>' : '') + '</div>';

  // the project summary, always beside the step
  function rail(p, study) {
    const h = study && !study.missing ? study.pf.headline : null, s = study?.site, f = fz(p);
    const kpi = (v, l) => '<div class="ws-kpi"><b>' + v + '</b><span>' + esc(l) + '</span></div>';
    const scen = f.scenarios.length ? '<label class="ws-f"><span>Scenario shown</span><select data-f="activeScenario"><option value="">Base case</option>' + f.scenarios.map(x => '<option value="' + esc(x.id) + '"' + (x.id === f.activeScenario ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></label>' : '';
    return '<aside class="ws-rail" aria-labelledby="wsRailH"><div class="ws-card"><div class="kicker" id="wsRailH">Project summary</div>' +
      '<div class="ws-kpis">' + kpi(s ? num(s.acres, 2) : num((p.parcels || []).reduce((a, x) => a + (x.acres || 0), 0), 2), 'Acres') + kpi(s ? (s.units ? num(s.units) : num(s.gfa)) : '—', s?.units ? 'Units' : 'Gross sf') +
        kpi(h ? pct(h.levIrr) : '—', 'Levered IRR') + kpi(h ? num(h.multiple, 2) + '×' : '—', 'Equity multiple') + (h?.forSale ? kpi(pct(h.margin, 1), 'Margin') : kpi(h?.cocAvg != null ? pct(h.cocAvg) : '—', 'Cash-on-cash, ' + (h?.cocByYear?.length || 10) + '-yr avg')) + kpi(h ? usdM(h.totalCost) : '—', 'Total cost') + '</div>' +
      scen + (study?.risks?.length ? '<div class="ws-risks"><div class="kicker">Top risks</div><ul>' + study.risks.filter(r => r.level !== 'low').slice(0, 4).map(r => '<li data-level="' + r.level + '"><span class="ws-lv">' + r.level + '</span>' + esc(r.title) + '</li>').join('') + '</ul></div>' : '') +
      (study?.option ? '<p class="ws-meta">Option: <b>' + esc(study.option.name) + '</b>' + (study.scenario ? ' · ' + esc(study.scenario.name) : '') + '<br>Inputs <span class="mono">' + esc(study.inputsHash || '') + '</span></p>' : '') + '</div></aside>';
  }

  // ---------- 1 Intake ----------
  function intakeStep(p) {
    const f = fz(p), it = M0.intakeFromParcels(f.intake, p.parcels || []), parcels = p.parcels || [];
    const field = (k, label, v, o = {}) => '<label class="ws-f' + (o.wide ? ' wide' : '') + '"><span>' + label + '</span><input data-in="' + k + '" ' + (o.type ? 'type="' + o.type + '" inputmode="decimal" ' : '') + 'value="' + esc(v ?? '') + '" autocomplete="off"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + '></label>';
    const basis = '<label class="ws-f"><span>Land basis</span><select data-in="landBasis">' + [['appraised-land', 'Appraised land value'], ['appraised-total', 'Appraised total value'], ['asking', 'Asking / contract price'], ['house', 'Platform $ an acre']].map(([v, l]) => '<option value="' + v + '"' + (f.intake.landBasis === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>';
    const rows = parcels.length ? '<table class="ws-t"><caption class="sr">Parcels</caption><thead><tr><th scope="col">Parcel</th><th scope="col">Owner</th><th scope="col" class="r">Acres</th><th scope="col" class="r">Land value</th><th scope="col" class="r">Total value</th><th scope="col">Source</th></tr></thead><tbody>' +
      parcels.map(x => '<tr><th scope="row">' + esc(x.label) + (x.zip ? '<small>' + esc([x.city, x.zip].filter(Boolean).join(' ')) + '</small>' : '') + '</th><td>' + esc(x.owner || '—') + '</td><td class="r m">' + num(x.acres, 2) + '</td><td class="r m">' + usd(x.landValue) + '</td><td class="r m">' + usd(x.marketValue) + '</td><td>' + esc(x.source?.label || (x.propId ? 'Appraisal district' : 'Map')) + '</td></tr>').join('') + '</tbody></table>'
      : empty('No parcels yet', 'Pick the site’s parcels on the map (a building card’s Start a Project, or Shift-click several), or enter a survey’s metes and bounds below.', 'Pick parcels on the map', 'map');
    const survey = '<details class="ws-box"><summary>Enter a survey (metes and bounds)</summary><p class="ws-note">One call a line, e.g. <span class="mono">N 42°00\'00" E 250.00 ft</span>. Placed at the point you give (the survey’s point of beginning). Closure must be 1:10,000 or better; curves aren’t supported yet.</p>' +
      '<label class="ws-f wide"><span>Calls</span><textarea id="wsCalls" rows="5"></textarea></label><div class="ws-row">' + field('svLat', 'Latitude of the point of beginning', '', { type: 'number', ph: '29.78' }) + field('svLon', 'Longitude', '', { type: 'number', ph: '-95.98' }) + '</div>' +
      '<button type="button" class="btn" data-act="survey">Add the surveyed parcel</button></details>';
    return '<div class="ws-card"><h4>The project</h4><div class="ws-row">' + field('client', 'Client / prepared for', p.client) + field('targetUse', 'Target use', f.intake.targetUse || p.use, { ph: 'e.g. Garden apartments' }) + '</div>' +
      '<div class="ws-row">' + field('address', 'Address', it.address) + field('city', 'City', it.city) + field('county', 'County', it.county) + field('zip', 'ZIP', it.zip) + '</div>' +
      '<div class="ws-row">' + basis + field('landPrice', 'Asking price ($)', f.intake.landPrice ?? '', { type: 'number', ph: 'used with Asking / contract price' }) + '</div>' +
      '<p class="ws-note">Address, city, county and ZIP fill from the parcels; the ZIP sets the rent market check. Land defaults to the appraisal district’s <b>land</b> value (not the total, which includes buildings) until you enter a price.</p></div>' +
      '<div class="ws-card"><h4>Parcels <span class="ws-c">' + parcels.length + '</span></h4>' + rows + (parcels.length ? '<button type="button" class="btn" data-act="map">Add or change parcels on the map</button>' : '') + survey + '</div>';
  }

  // ---------- 2 Site: the layout gallery ----------
  // the platform's layout engine on the parcels, from the words typed: the generator's gallery (dozens of layouts, in
  // seconds) where it covers the program, else the engine's three options; each a card to use as the study's option
  function galleryTool(p) {
    const s = st(p), parcels = p.parcels || [], g = s.gallery, many = parcels.length > 1;
    const ask = '<div class="ws-gen"><label class="ws-f ws-ask wide"><span>What to build</span><input id="wsAsk" type="text" placeholder="e.g. 120 garden apartments, 3 stories, with a clubhouse and pool · 45,000 sf of retail shops with 3 pads · a retail plaza with a central court and a neighborhood behind" value="' + esc(s.ask || '') + '"></label>' +
      '<div class="ws-row"><label class="ws-f"><span>or a quick layout for</span><select id="wsUse">' + [['multifamily', 'Garden apartments'], ['retail', 'Retail shops'], ['industrial', 'Flex / warehouse'], ['storage', 'Self storage'], ['sfr', 'Single-family homes'], ['townhomes', 'Townhomes']].map(([v, l]) => '<option value="' + v + '"' + (s.use === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
      (many ? '<label class="ws-chk ws-per"><input type="checkbox" id="wsPer"' + (s.per !== false ? ' checked' : '') + '> Lay out parcel by parcel <small>(' + parcels.length + ' parcels: each its own street side and layouts; say which use goes on which parcel, or each takes its share)</small></label>' : '') +
      '<button type="button" class="btn primary" data-act="gallery"' + (s.busy ? ' disabled' : '') + '>Generate layout options</button></div>' +
      '<p class="ws-note">The platform’s layout engine lays the parcels out from what you typed (no AI needed): dozens of layouts in a few seconds for apartments, shops, flex parks and self storage, the engine’s three options for everything else. Pick one as the study’s option; refine it in the site plan editor.</p></div>';
    if (!g?.list?.length) return ask + (g && !g.list.length ? '<div class="ws-warnbox">No layout fit those words on this site. Try a smaller program, or a different use.</div>' : '');
    const base = g.base, shown = g.list.slice(0, g.shown || 9);
    const card = (o, i) => { const pl = { ...base, program: o.program, elements: o.elements, zones: o.zones || [] }, m = S.metrics(pl), warn = (o.bad || []).length ? 'bad' : (o.warnings || []).length ? 'warn' : 'ok';
      return '<div class="ws-galc" data-state="' + warn + '">' + planSVG(pl, { px: 360, labels: false }).svg + '<b>' + (i + 1) + '. ' + esc(o.label || o.name || 'Layout') + '</b><small>' + (m.units ? num(m.units) + ' units · ' : '') + num(Math.round(m.gfa || 0)) + ' sf · ' + num(m.spaces) + ' of ' + num(m.required) + ' stalls' + (m.pond ? ' · pond ' + num(m.pond / 43560, 2) + ' ac' : '') + '</small>' +
        ((o.bad || []).length ? '<small class="ws-bad">' + esc(o.bad[0]) + '</small>' : (o.warnings || []).length ? '<small class="ws-warn">' + esc(o.warnings[0]) + '</small>' : '') + '<button type="button" class="btn sm primary" data-use="' + i + '">Use this layout</button></div>'; };
    return ask + '<div class="ws-galh"><h4>' + g.list.length + ' layout' + (g.list.length > 1 ? 's' : '') + ' for <q>' + esc(g.ask || g.use) + '</q>' + (g.ms ? ' <small>in ' + (g.ms / 1000).toFixed(1) + ' s</small>' : '') + '</h4>' + (g.per ? '<span class="ws-c">parcel by parcel</span>' : '') + '</div>' +
      '<div class="ws-gal">' + shown.map(card).join('') + '</div>' + (g.list.length > shown.length ? '<button type="button" class="btn" data-act="moreGallery">Show ' + Math.min(12, g.list.length - shown.length) + ' more</button>' : '');
  }
  function runGallery(p) {
    const s = st(p), f = fz(p), parcels = p.parcels || [], base = P.siteFromParcels(parcels); if (!base) throw new Error('The parcels have no outline to lay out.');
    const ask = s.ask, prog = ask ? P.programFromWords(ask) : { use: s.use || 'multifamily' }, np = S.normalizeProgram(prog), parts = parcels.length > 1 && s.per !== false ? partsOf(base, parcels) : [], per = parts.length > 1 && (np.parcels || s.per !== false);
    const t0 = Date.now(); let list;
    if (per) list = layoutOptions(base, prog, { count: 4, netEvals: 6, parcels: parts, perParcel: true });
    else if (covers(np)) { list = layoutGallery(base, prog, { budgetMs: 8000 }).slice(0, 48); if (!list.length) list = layoutOptions(base, prog, { count: 3, netEvals: 6 }); }
    else list = layoutOptions(base, prog, { count: 3, netEvals: 6 });
    // the different arrangements first (one of each), then the rest in the engine's order: the first cards show the range
    const kept = list.filter(o => o.elements?.length), seen = new Set(), firsts = [], rest = [];
    for (const o of kept) { const k = String(o.label || o.name || '').split(' · ').slice(0, 2).join(' · ').replace(/\d+ (rows?|bays?|pads?|courtyards?) /g, ''); if (seen.has(k)) rest.push(o); else { seen.add(k); firsts.push(o); } }
    s.gallery = { ask, use: s.use || 'multifamily', per, base, list: firsts.concat(rest), shown: 9, ms: Date.now() - t0 };
  }
  function useLayout(p, i) {
    const s = st(p), f = fz(p), g = s.gallery, o = g?.list?.[i]; if (!o) return;
    const laid = { ...g.base, elements: o.elements, zones: o.zones || [], program: o.program, recipe: o.recipe || null, laidAs: o.label || o.name, ...(g.ask ? { lastRun: { ask: g.ask } } : {}) };
    const { id: _id, name: _name, ...rest } = laid, pl = env.newPlan(p, rest); p.plans.push(pl); f.optionId = pl.id; env.toast(pl.name + ' is now the study’s option: ' + (o.label || o.name) + '.');
    changed(p, true);
  }
  // ---------- 2 Site ----------
  function siteStep(p, study) {
    const plans = p.plans || [], opt = M0.optionOf(p);
    if (!(p.parcels || []).length && !plans.length) return empty('No site yet', 'Add the parcels at Intake first.', 'Go to Intake', 'step:intake');
    const laid = pl => (pl.elements || []).some(e => e.kind === 'building');
    const list = plans.length ? '<fieldset class="ws-opts"><legend>Site option the study uses</legend>' + plans.map(pl => '<label class="ws-opt"><input type="radio" name="wsOpt" data-opt="' + esc(pl.id) + '"' + (opt?.id === pl.id ? ' checked' : '') + '><span><b>' + esc(pl.name) + '</b><small>' +
      ((pl.ring || []).length < 3 ? 'No site drawn' : laid(pl) ? esc(pl.laidAs || pl.program?.use || '') + ' · ' + (pl.elements || []).filter(e => e.kind === 'building').length + ' buildings' : 'Drawn, not laid out') + '</small></span>' +
      '<button type="button" class="btn sm" data-edit="' + esc(pl.id) + '">Open in site plan</button></label>').join('') + '</fieldset>' : '';
    const gen = galleryTool(p);
    const s = study?.site;
    const facts = s ? '<div class="ws-two"><dl class="ws-dl">' + [['Site', num(s.acres, 2) + ' acres · ' + num(s.siteSf) + ' sf'], ['Buildable envelope', s.envelope ? num(s.envelope.envelopeSf) + ' sf (' + pct(s.envelope.ratio, 0) + ') at a ' + s.envelope.setbackFt + ' ft setback' : '—'],
      ['Building area', num(s.gfa) + ' gross sf'], ['Units', s.units ? num(s.units) : '—'], ['Parking', num(s.spaces) + ' of ' + num(s.required) + ' required'], ['Coverage / FAR', pct(s.coverage, 1) + ' / ' + num(s.far, 2)], ['Detention', num(s.detentionAcFt, 2) + ' ac-ft'],
      ...Object.entries(s.jurisdiction || {})].map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('') + '</dl><figure class="ws-plan">' + (opt && (opt.ring || []).length >= 3 ? planSVG(opt, { px: 520 }).svg : '') + '<figcaption>' + esc(opt?.name || '') + ': concept layout, not a survey.</figcaption></figure></div>' +
      (s.issues?.length ? '<div class="ws-warnbox">Layout checks: ' + s.issues.map(esc).join(' ') + '</div>' : '') : study?.missing === 'layout' ? empty('Not laid out yet', 'Generate a layout option above, or open the option in the site plan editor and lay it out.', null, null) : '';
    return '<div class="ws-card">' + (list || empty('No site option yet', 'Generate one from the parcels, or draw one in the site plan editor.', null, null)) + gen + '</div>' + (facts ? '<div class="ws-card"><h4>The site</h4>' + facts + '</div>' : '');
  }

  // ---------- 3 Plans ----------
  function plansStep(p, study) {
    const ps = study?.planset; if (!ps) return empty('No plan set yet', 'The plan set is drawn from a laid-out site option.', 'Go to Site', 'step:site');
    return '<div class="ws-card"><div class="ws-warnbox"><b>Schematic design only.</b> Not a permit set or construction documents; not sealed or reviewed by a licensed architect or engineer.</div>' +
      '<p>' + num(ps.sheets.length) + ' sheets on the title block for <b>' + esc(study.option.name) + '</b>. ' + (ps.issued.length ? ps.issued.length + ' set' + (ps.issued.length > 1 ? 's' : '') + ' issued.' : 'None issued yet.') + (ps.notDesigned.length ? ' Floor plans aren’t drawn yet for: ' + esc([...new Set(ps.notDesigned)].join(', ')) + '.' : '') + '</p>' +
      '<button type="button" class="btn primary" data-act="plans">Make a plan set</button></div>' +
      '<div class="ws-card"><h4>Sheet list</h4><table class="ws-t"><caption class="sr">Plan set sheets</caption><thead><tr><th scope="col">Sheet</th><th scope="col">Title</th></tr></thead><tbody>' + ps.sheets.map(x => '<tr><td class="m">' + esc(x.number) + '</td><td>' + esc(x.title + (x.sub ? ' — ' + x.sub : '')) + '</td></tr>').join('') + '</tbody></table></div>';
  }

  // ---------- 4 Budget ----------
  function budgetStep(p, study) {
    if (!study || study.missing) return empty('Nothing to price yet', 'The budget is priced from a laid-out site option.', 'Go to Site', 'step:site');
    const T = study.budget.totals, h = study.pf.headline, s = study.site, E = study.budget.escalation;
    const row = (l, v, b) => '<tr' + (b ? ' class="b"' : '') + '><th scope="row">' + l + '</th><td class="r m">' + usd(v) + '</td><td class="r m">' + (s.units ? usd(v / s.units) : '—') + '</td><td class="r m">' + (s.gfa ? '$' + num(v / s.gfa, 2) : '—') + '</td></tr>';
    const sum = '<table class="ws-t"><caption class="sr">Budget summary</caption><thead><tr><th scope="col"></th><th scope="col" class="r">Amount</th><th scope="col" class="r">A unit</th><th scope="col" class="r">A gross sf</th></tr></thead><tbody>' +
      row('Land and closing', T.land) + row('Building', T.building) + row('GC fee on library lines', T.gcFee) + row('Site work', T.site) + (T.ffe ? row('FF&amp;E', T.ffe) : '') + (T.ti ? row('Tenant improvements', T.ti) : '') + row('Contingency', T.contingency) + row('Construction contract', T.contract, true) +
      row('Soft costs', T.softLines) + (T.lc ? row('Leasing commissions', T.lc) : '') + row('Developer fee', T.devFee) + row('Project cost before financing', T.project, true) + row('Construction interest', h.interest) + row('Loan fees', h.loanFees) + row('Total development cost', h.totalCost, true) + '</tbody></table>';
    const groups = {}; for (const l of study.budget.lines) (groups[l.division] ||= []).push(l);
    const lines = Object.entries(groups).map(([d, ls]) => '<details class="ws-box"><summary><span>' + esc(d) + '</span><span class="m">' + usd(ls.reduce((a, l) => a + (l.off ? 0 : l.amount), 0)) + '</span></summary><table class="ws-t"><caption class="sr">' + esc(d) + '</caption><thead><tr><th scope="col">Item</th><th scope="col" class="r">Qty</th><th scope="col">Unit</th><th scope="col" class="r">Rate</th><th scope="col" class="r">Amount</th><th scope="col">Source</th><th scope="col"><span class="sr">Include</span></th></tr></thead><tbody>' +
      ls.map(l => { const id = 'wsL' + M0.hashOf(l.id); return '<tr' + (l.off ? ' class="off"' : '') + '><th scope="row">' + esc(l.desc) + '<small class="m">' + esc(l.csi) + '</small></th><td class="r m">' + num(l.qty, l.qty < 10 ? 2 : 0) + '</td><td>' + esc(l.unit) + '</td>' +
        '<td class="r"><label class="sr" for="' + id + '">Rate for ' + esc(l.desc) + '</label><input id="' + id + '" class="ws-num" data-line="' + esc(l.id) + '" type="number" step="any" inputmode="decimal" value="' + +l.rate.toFixed(l.unit === '$ base' ? 4 : 2) + '"' + (l.off ? ' disabled' : '') + '></td><td class="r m">' + usd(l.amount) + '</td><td>' + chip(l.source) + '</td>' +
        '<td><label class="ws-chk"><input type="checkbox" data-lineoff="' + esc(l.id) + '"' + (l.off ? '' : ' checked') + '><span class="sr">Include ' + esc(l.desc) + '</span></label></td></tr>'; }).join('') + '</tbody></table></details>').join('');
    const edits = Object.keys(fz(p).budgetEdits).length;
    return '<div class="ws-card"><h4>Budget summary</h4>' + sum + '<p class="ws-note">Escalated × ' + num(E.library.factor, 4) + ' on library lines (' + esc(E.library.toDate.note) + '; ' + esc(E.library.forward.note) + ') and × ' + num(E.parametric.factor, 4) + ' on parametric lines; location factor ' + num(E.location, 2) + '. Change these under Pro Forma › Cost.</p>' +
      (study.budgetBench && Math.abs(study.budgetBench.diff) <= 20 ? '<p class="ws-note">' + esc(study.budgetBench.text) + '</p>' : '') +
      (study.budgetChecks.length ? '<div class="ws-warnbox">' + study.budgetChecks.map(c => esc(c.text)).join(' ') + '</div>' : '') + '</div>' +
      '<div class="ws-card"><h4>Line items <span class="ws-c">' + study.budget.lines.length + '</span>' + (edits ? '<button type="button" class="lnk" data-act="clearLines">Undo ' + edits + ' line edit' + (edits > 1 ? 's' : '') + '</button>' : '') + '</h4><p class="ws-note">Rates are editable; untick a line to leave it out. Your changes are marked “Yours” and listed in the report’s register.</p>' + lines + '</div>';
  }
  const chip = s => s ? '<span class="ws-src" data-kind="' + esc(s.kind) + '" title="' + esc(s.label + (s.asOf ? ' (' + s.asOf + ')' : '') + (s.confidence ? ' · confidence ' + s.confidence : '')) + '">' + esc(KIND[s.kind] || s.kind) + '<span class="sr">: ' + esc(s.label) + '</span></span>' : '';

  // ---------- 5 Pro Forma ----------
  function proformaStep(p, study, c) {
    if (!study || study.missing) return empty('Nothing to model yet', 'The pro forma runs on a laid-out site option and its budget.', 'Go to Site', 'step:site');
    const f = fz(p), s = st(p), h = study.pf.headline, editing = f.scenarios.find(x => x.id === s.editing) || null;
    const over = editing ? editing.overrides : f.overrides;
    // the three returns the team decides on first (levered IRR, equity multiple, cash-on-cash over the hold), then the rest
    const yrs = h.cocByYear?.length || 0, lead = [[pct(h.levIrr), 'Levered IRR'], [num(h.multiple, 2) + '×', 'Equity multiple'], h.forSale ? [pct(h.margin, 1), 'Margin on sales'] : [h.cocAvg != null ? pct(h.cocAvg) : '—', 'Cash-on-cash, ' + (yrs || h.hold || 10) + '-year average']];
    const rest = [[usdM(h.totalCost), 'Total development cost'], h.forSale ? [usdM(h.profit), 'Profit'] : [usdM(h.noi), 'Stabilized NOI'], h.forSale ? null : [pct(h.yoc), 'Yield on cost'], h.forSale ? null : [h.coc != null ? pct(h.coc) : '—', 'Cash-on-cash, year 1'], [pct(h.unlevIrr), 'Unlevered IRR'], [usdM(h.npvLev), 'Levered NPV'], [h.dscr != null ? num(h.dscr, 2) + '×' : '—', 'DSCR']].filter(Boolean);
    const kpiH = ([v, l]) => '<div class="ws-kpi"><b>' + v + '</b><span>' + esc(l) + '</span></div>';
    const cocRow = yrs ? '<div class="ws-scroll" tabindex="0" role="region" aria-label="Cash-on-cash by year"><table class="ws-t ws-coc"><caption>Cash-on-cash by year of the hold (cash flow after debt service ÷ equity)</caption><thead><tr>' + h.cocByYear.map((_, i) => '<th scope="col" class="r">Yr ' + (i + 1) + '</th>').join('') + '</tr></thead><tbody><tr>' + h.cocByYear.map(v => '<td class="r m">' + pct(v) + '</td>').join('') + '</tr></tbody></table></div>' : '';
    const kpis = '<div class="ws-kpis big ws-lead">' + lead.map(kpiH).join('') + '</div>' + cocRow + '<div class="ws-kpis">' + rest.map(kpiH).join('') + '</div>';
    // the assumptions, grouped, each with its source
    const groups = GROUPS.map(([g, label]) => { const rows = study.register.filter(a => a.group === g); if (!rows.length) return '';
      return '<details class="ws-box" data-group="' + g + '"' + (s.open[g] ? ' open' : '') + '><summary><span>' + label + '</span><span class="ws-c">' + rows.length + '</span></summary><div class="ws-as">' + rows.map(a => {
        const id = 'wsA' + M0.hashOf(a.key), o = Object.prototype.hasOwnProperty.call(over, a.key), out = a.range && (a.value < a.range[0] || a.value > a.range[1]);
        return '<div class="ws-a' + (o ? ' edited' : '') + '"><label for="' + id + '">' + esc(a.label) + '</label><span class="ws-ai"><input id="' + id + '" class="ws-num" type="number" step="any" inputmode="decimal" data-as="' + esc(a.key) + '" value="' + esc(a.value) + '"' + (a.range ? ' aria-describedby="' + id + 'r"' : '') + '><span class="ws-u">' + esc(unitText(a.unit)) + '</span></span>' +
          chip(a.source) + (o ? '<button type="button" class="lnk" data-reset="' + esc(a.key) + '" aria-label="Reset ' + esc(a.label) + ' to ' + esc(fmtVal({ ...a, value: a.default ?? a.value })) + '">Reset</button>' : '') +
          (a.range ? '<small id="' + id + 'r" class="' + (out ? 'out' : '') + '">' + (out ? 'Outside the usual ' : 'Usual ') + esc(a.range[0] + '–' + a.range[1]) + '</small>' : '') + (a.marketCheck ? '<small class="ws-mc">' + esc(a.marketCheck) + '</small>' : '') + '</div>'; }).join('') + '</div></details>'; }).join('');
    const edBar = '<div class="ws-edbar"><label class="ws-f"><span>Editing</span><select data-f="editing"><option value="">Base case</option>' + f.scenarios.map(x => '<option value="' + esc(x.id) + '"' + (x.id === s.editing ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></label>' +
      '<button type="button" class="btn" data-act="newScenario">New scenario</button>' + (editing ? '<button type="button" class="btn" data-act="delScenario">Delete “' + esc(editing.name) + '”</button>' : '') + '</div>' +
      (editing ? '<p class="ws-note">Changes now go into <b>' + esc(editing.name) + '</b>; the base case keeps its numbers. The rail shows ' + (f.activeScenario === editing.id ? 'this scenario.' : 'the base case — pick the scenario there to see it.') + '</p>' : '') +
      (editing && (study.site.mix || []).length ? mixEditor(editing, study) : '');
    // results: returns, break-even, sensitivity, hold, scenarios
    const be = study.pf.breakEven;
    const beTxt = breakEvenText(be, x => '<b>' + x + '</b>');
    const sv = study.sensitivity, tor = sv ? '<h5>What moves the ' + (sv.metric === 'margin' ? 'margin' : 'levered IRR') + ' most</h5>' + tornadoSvg(sv.tornado, esc, { W: 560, L: 170, classes: true }) + '<div class="ws-scroll" tabindex="0" role="region" aria-label="Sensitivity table"><table class="ws-t"><caption class="sr">Sensitivity</caption><thead><tr><th scope="col">Input</th><th scope="col">Low case</th><th scope="col" class="r">Result</th><th scope="col">High case</th><th scope="col" class="r">Result</th></tr></thead><tbody>' +
      sv.tornado.rows.map(r => '<tr><th scope="row">' + esc(r.label) + '</th><td>' + esc(r.loText) + '</td><td class="r m">' + pct(r.lo) + '</td><td>' + esc(r.hiText) + '</td><td class="r m">' + pct(r.hi) + '</td></tr>').join('') + '</tbody></table></div>' +
      sv.grids.map(g => '<div class="ws-scroll" tabindex="0" role="region" aria-label="' + esc(gridTitle(g)) + ' grid"><table class="ws-t ws-grid2"><caption>' + esc(gridTitle(g)) + '</caption><thead><tr><th scope="col"></th>' + g.cols.map(x => '<th scope="col" class="r">' + esc(x) + '</th>').join('') + '</tr></thead><tbody>' +
        g.cells.map((row, i) => '<tr><th scope="row">' + esc(g.rows[i]) + '</th>' + row.map((v, j) => '<td class="r m' + (i === 2 && j === 2 ? ' base' : '') + (v != null && v < 0 ? ' neg' : '') + '">' + pct(v, 1) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>').join('') : '';
    const hr = study.hold?.result, hold = hr ? '<h5>Hold analysis</h5><p class="ws-note">The stabilized asset bought at its total cost and held ' + hr.annual.length + ' years on the budgeting suite’s before-tax engine: cap on cost ' + pct(hr.summary.acquisitionCapRate) + ', optimal hold year ' + (hr.summary.optimalHoldingYear ?? '—') + ' at ' + pct(hr.summary.optimalHoldingYield) + ' equity IRR.</p>' : '';
    const comp = c.scenarios.length > 1 ? '<h5>Scenarios side by side</h5><div class="ws-scroll" tabindex="0" role="region" aria-label="Scenario comparison"><table class="ws-t"><caption class="sr">Scenario comparison</caption><thead><tr><th scope="col">Scenario</th><th scope="col" class="r">Units</th><th scope="col" class="r">Total cost</th><th scope="col" class="r">NOI</th><th scope="col" class="r">Yield on cost</th><th scope="col" class="r">Levered IRR</th><th scope="col" class="r">vs base</th></tr></thead><tbody>' +
      c.scenarios.slice(0, 5).map((x, i) => '<tr><th scope="row">' + esc(x.name) + (x.changes ? '<small>' + x.changes + ' change' + (x.changes > 1 ? 's' : '') + '</small>' : '') + '</th><td class="r m">' + num(x.units) + '</td><td class="r m">' + usdM(x.headline.totalCost) + '</td><td class="r m">' + usdM(x.headline.noi) + '</td><td class="r m">' + pct(x.headline.yoc) + '</td><td class="r m">' + pct(x.headline.levIrr) + '</td><td class="r m">' + (i ? delta(x.headline.levIrr, c.scenarios[0].headline.levIrr) : '—') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="ws-note">Add a scenario to compare unit mix, financing or cost assumptions side by side.</p>';
    return '<div class="ws-card">' + kpis + '<p class="ws-note" role="status" aria-live="polite">' + beTxt + '</p></div><div class="ws-two wide"><div class="ws-card"><h4>Assumptions</h4>' + edBar + groups + '</div><div class="ws-card"><h4>Results</h4>' + tor + hold + comp + '</div></div>';
  }
  const delta = (a, b) => a == null || b == null ? '—' : ((a - b) * 100 >= 0 ? '+' : '−') + Math.abs((a - b) * 100).toFixed(2) + ' pts';
  const unitText = u => ({ pct: '%', usd: '$', psf: '$/sf', nnn: '$/sf/yr', mo: '$/mo', psfmo: '$/sf/mo', x: '×', share: 'share', months: 'mo', years: 'yr', 'homes/mo': '/mo' })[u] || u;
  // a scenario's starting unit mix: the layout's own, as shares
  const mixOf = study => study.site.mix.map(t => ({ name: t.name, sf: t.sf, pct: Math.round(t.n / Math.max(1, study.site.units) * 100) }));
  function mixEditor(sc, study) {
    const mix = sc.mix?.length ? sc.mix : mixOf(study);
    return '<fieldset class="ws-mix"><legend>Unit mix in this scenario (same buildings, units re-split)</legend>' + mix.map((t, i) => '<span class="ws-mixr"><b>' + esc(t.name) + '</b><label>sf <input class="ws-num" type="number" data-mix="' + i + ':sf" value="' + esc(+t.sf || 0) + '"></label><label>% <input class="ws-num" type="number" data-mix="' + i + ':pct" value="' + esc(+t.pct || 0) + '"></label></span>').join('') + '</fieldset>';
  }


  // ---------- 6 Reports ----------
  function reportsStep(p, study) {
    if (!study || study.missing) return empty('No report yet', 'The report set is made from a laid-out option, its budget and pro forma.', 'Go to Site', 'step:site');
    const s = st(p), f = fz(p), dis = s.reportBusy ? ' disabled' : '';
    const files = [['pdf', 'Feasibility report', 'PDF · summary, site, plan set, budget, pro forma, sensitivity, risks, register'], ['xlsx', 'Workbook', 'XLSX · assumptions with sources, budget lines, CSI, monthly and annual cash flow, hold, sensitivity'], ['register', 'Fact & assumption register', 'CSV · every input with its source'], ['budget', 'Budget lines', 'CSV · every line with qty, rate and source'], ['json', 'Study data', 'JSON · everything above, for other tools']];
    const hist = f.reports.length ? '<table class="ws-t"><caption class="sr">Saved report sets</caption><thead><tr><th scope="col">Saved</th><th scope="col">By</th><th scope="col">Inputs</th><th scope="col" class="r">Total cost</th><th scope="col" class="r">Levered IRR</th><th scope="col">Files</th></tr></thead><tbody>' +
      f.reports.slice().reverse().map(r => '<tr><th scope="row">' + esc(new Date(r.created).toLocaleString()) + '</th><td>' + esc(r.by || '') + '</td><td class="m">' + esc(r.inputsHash) + (r.inputsHash === study.inputsHash ? ' <small>(current)</small>' : ' <small>(older inputs)</small>') + '</td><td class="r m">' + usdM(r.headline?.totalCost) + '</td><td class="r m">' + pct(r.headline?.levIrr) + '</td><td>' +
        r.files.map(x => '<button type="button" class="lnk" data-link="' + esc(x.path) + '">' + esc(x.name.split('.').pop().toUpperCase().replace('CSV', /register/.test(x.name) ? 'Register' : 'Budget')) + '</button>').join(' ') + '</td></tr>').join('') + '</tbody></table>' : '<p class="ws-note">No report sets saved yet. Saved sets are kept in the team’s storage with the inputs they were made from.</p>';
    return '<div class="ws-card"><h4>Report set</h4><p>Made from <b>' + esc(study.option.name) + '</b>' + (study.scenario ? ', scenario <b>' + esc(study.scenario.name) + '</b>' : ', base case') + ' · inputs <span class="mono">' + esc(study.inputsHash) + '</span>.</p>' +
      '<ul class="ws-files">' + files.map(([k, t, d]) => '<li><button type="button" class="btn" data-file="' + k + '"' + dis + '>' + esc(t) + '</button><span>' + esc(d) + '</span></li>').join('') + '</ul>' +
      '<div class="ws-row"><button type="button" class="btn primary" data-act="saveSet"' + dis + '>Save the whole set for the team</button><button type="button" class="btn" data-act="preview">Open the report here (print or save as PDF)</button></div>' +
      (s.reportBusy ? '<p class="ws-busy" role="status"><span class="ws-spin" aria-hidden="true"></span>' + esc(s.reportBusy) + '</p>' : '') + (s.reportErr ? '<div class="ws-err" role="alert">' + esc(s.reportErr) + '</div>' : '') + '</div>' +
      '<div class="ws-card"><h4>Saved sets <span class="ws-c">' + f.reports.length + '</span></h4>' + hist + '</div>';
  }

  // ---------- events ----------
  function paint() {
    const el = root?.querySelector('#wsRoot') || document.getElementById('wsRoot'); if (!el || !cur) return;
    const a = document.activeElement, id = a && el.contains(a) ? a.id : null, sel = id && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
    const opened = [...el.querySelectorAll('details[open]')].map(d => d.dataset.group || d.querySelector('summary span')?.textContent);
    el.innerHTML = inner(cur);
    for (const d of el.querySelectorAll('details')) if (opened.includes(d.dataset.group || d.querySelector('summary span')?.textContent)) d.open = true;
    if (id) { const n = el.querySelector('#' + CSS.escape(id)); if (n) { n.focus({ preventScroll: true }); if (sel && n.setSelectionRange && n.type !== 'number') try { n.setSelectionRange(...sel); } catch (e) { /* not a text field */ } } }
  }
  const go = (p, step) => { st(p).step = step; st(p).err = ''; paint(); root?.querySelector('#wsH')?.focus({ preventScroll: false }); };
  const headers = () => ({ 'Content-Type': 'application/json', 'x-field-code': env.code() || '' });
  async function api(body) {
    const r = await fetch('api/feasibility', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    if (!r.ok) { let m; try { m = (await r.json()).error; } catch (e) { m = ''; } throw Object.assign(new Error(m || (r.status === 404 ? 'The report service isn’t available here (open the deployed site, or run npm run dev).' : 'The report service answered ' + r.status + '.')), { status: r.status }); }
    return r;
  }
  async function download(p, kind) {
    const s = st(p); s.reportBusy = 'Making the ' + kind.toUpperCase() + '…'; s.reportErr = ''; paint();
    try {
      const r = await api({ op: 'file', kind, project: p, scenarioId: fz(p).activeScenario || null });
      const blob = kind === 'json' ? new Blob([JSON.stringify(await r.json(), null, 1)], { type: 'application/json' }) : await r.blob();
      const name = (/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || 'fs-feasibility-' + kit.slug(p.name) + '.' + (kind === 'register' || kind === 'budget' ? 'csv' : kind);
      await env.saveFile(name, blob, blob.type);
    } catch (e) { s.reportErr = e.message + (kind === 'pdf' ? ' You can still open the report here and print it to PDF.' : ''); }
    s.reportBusy = ''; paint();
  }
  function wire(rootEl, p) {
    root = rootEl; cur = p; const el = rootEl.querySelector('#wsRoot'); if (!el) return;
    el.addEventListener('click', async e => {
      const t = e.target.closest('button,[data-step]'); if (!t || t.disabled) return;
      const f = fz(p), s = st(p);
      if (t.dataset.step) { if (t.getAttribute('aria-disabled') === 'true') { s.err = t.title; paint(); return; } return go(p, t.dataset.step); }
      if (t.dataset.edit) return env.openOption(p.id, t.dataset.edit);
      if (t.dataset.reset) { const o = (f.scenarios.find(x => x.id === s.editing)?.overrides) || f.overrides; delete o[t.dataset.reset]; return changed(p, true); }
      if (t.dataset.file) return download(p, t.dataset.file);
      if (t.dataset.link) { try { const r = await api({ op: 'link', path: t.dataset.link }); window.open((await r.json()).url, '_blank', 'noopener'); } catch (err) { s.reportErr = err.message; paint(); } return; }
      if (t.dataset.use != null) return useLayout(p, +t.dataset.use);
      const act = t.dataset.act; if (!act) return;
      if (act.startsWith('step:')) return go(p, act.slice(5));
      if (act === 'retry') { cache.delete(p.id); return paint(); }
      if (act === 'map') return env.goMap();
      if (act === 'plans') return env.setTab(p, 'plans');
      if (act === 'clearLines') { f.budgetEdits = {}; return changed(p, true); }
      if (act === 'dropUnknown') { const c = studyOf(p), known = new Set((c?.study?.register || []).map(a => a.key)); if (!known.size) return; for (const o of [f.overrides, ...f.scenarios.map(x => x.overrides)]) for (const k of Object.keys(o || {})) if (!known.has(k)) delete o[k]; return changed(p, true); }
      if (act === 'moreGallery') { if (s.gallery) s.gallery.shown = (s.gallery.shown || 9) + 12; return paint(); }
      if (act === 'gallery') {
        s.use = rootEl.querySelector('#wsUse')?.value || 'multifamily'; s.ask = (rootEl.querySelector('#wsAsk')?.value || '').trim(); s.per = rootEl.querySelector('#wsPer') ? rootEl.querySelector('#wsPer').checked : true; s.busy = 'Laying the parcels out with the platform’s layout engine…'; s.err = ''; paint();
        setTimeout(() => { try { runGallery(p); } catch (err) { s.err = err.message; console.error(err); } s.busy = ''; paint(); }, 30);
        return;
      }
      if (act === 'layout') {
        const use = rootEl.querySelector('#wsUse')?.value || 'multifamily', ask = (rootEl.querySelector('#wsAsk')?.value || '').trim(); s.ask = ask; s.busy = 'Laying out the site with the platform’s layout engine…'; s.err = ''; paint();
        setTimeout(() => { try {
          const base = P.siteFromParcels(p.parcels || []); if (!base) throw new Error('The parcels have no outline to lay out.');
          const laid = P.autoLayout(base, ask ? P.programFromWords(ask) : { use }); if (!laid) throw new Error('The layout engine found no layout for this program on this site.'); if (ask) laid.lastRun = { ask };
          const { id: _id, name: _name, ...rest } = laid, pl = env.newPlan(p, rest); p.plans.push(pl); f.optionId = pl.id; env.toast('Laid out ' + pl.name + ': ' + laid.laidAs + '.');
        } catch (err) { s.err = err.message; } s.busy = ''; changed(p, true); }, 30);
        return;
      }
      if (act === 'survey') {
        const calls = rootEl.querySelector('#wsCalls')?.value || '', lat = +rootEl.querySelector('[data-in="svLat"]')?.value, lon = +rootEl.querySelector('[data-in="svLon"]')?.value;
        const r = buildSurvey({ calls, anchor: Number.isFinite(lat) && Number.isFinite(lon) && lat && lon ? { lat, lon } : null }, (p.parcels || [])[0]?.geometry || null);
        if (r.error) { s.err = 'Survey: ' + r.error; return paint(); }
        p.parcels = [...(p.parcels || []), M0.parcelFrom({ key: 'sv-' + M0.hashOf(calls), label: 'Surveyed tract (' + num(r.acres, 2) + ' ac)', acres: +r.acres.toFixed(3), geometry: r.geometry }, M0.src('user', 'Metes and bounds entered at intake, closure ' + r.precisionText, { confidence: 'medium' }))];
        env.toast('Added the surveyed tract: ' + num(r.acres, 2) + ' acres, closure ' + r.precisionText + '.'); s.err = ''; return changed(p, true);
      }
      if (act === 'newScenario') { const id = 'sc' + Date.now().toString(36), n = f.scenarios.length + 1; f.scenarios.push({ id, name: 'Scenario ' + n, overrides: {} }); s.editing = id; return changed(p, true); }
      if (act === 'delScenario') { f.scenarios = f.scenarios.filter(x => x.id !== s.editing); if (f.activeScenario === s.editing) f.activeScenario = null; s.editing = ''; return changed(p, true); }
      if (act === 'preview') { const c = studyOf(p, { sensitivity: true }); if (!c?.study) return; const opt = M0.optionOf(p), w = window.open('', '_blank'); if (!w) { s.reportErr = 'Your browser blocked the new window.'; return paint(); }
        w.document.write(feasibilityReport(kit).reportHtml(c.study, { planSvg: opt ? planSVG(opt, { px: 900 }).svg : '', scenarios: c.scenarios })); w.document.close(); return; }
      if (act === 'saveSet') {
        s.reportBusy = 'Making and saving the report set…'; s.reportErr = ''; paint();
        try { const r = await api({ op: 'save', project: p, scenarioId: f.activeScenario || null, by: env.name() }); const { report } = await r.json(); f.reports = [...f.reports, report].slice(-30); env.toast('Report set saved.'); changed(p, true); }
        catch (err) { s.reportErr = err.message; }
        s.reportBusy = ''; paint();
      }
    });
    el.addEventListener('input', e => {
      const t = e.target, f = fz(p), s = st(p);
      if (t.dataset.as) { const o = s.editing ? f.scenarios.find(x => x.id === s.editing)?.overrides : f.overrides; if (!o) return; if (t.value === '' || !Number.isFinite(+t.value)) return; o[t.dataset.as] = +t.value; return changed(p); }
      if (t.dataset.line) { if (!Number.isFinite(+t.value) || t.value === '') return; (f.budgetEdits[t.dataset.line] ||= {}).rate = +t.value; return changed(p); }
      if (t.dataset.mix) { const sc = f.scenarios.find(x => x.id === s.editing); if (!sc) return; if (!sc.mix) { const c = studyOf(p, { sensitivity: false }); if (!c?.study?.site) return; sc.mix = mixOf(c.study); } const [i, k] = t.dataset.mix.split(':'); if (Number.isFinite(+t.value)) sc.mix[+i][k] = +t.value; return changed(p); }
      if (t.dataset.in && !/^sv/.test(t.dataset.in)) {
        const k = t.dataset.in, v = t.value;
        if (k === 'client') p.client = v; else if (k === 'landPrice') f.intake.landPrice = v === '' ? null : +v; else f.intake[k] = v;
        if (k === 'landPrice' && v !== '' && f.intake.landBasis !== 'asking') f.intake.landBasis = 'asking';
        return changed(p);
      }
    });
    el.addEventListener('change', e => {
      const t = e.target, f = fz(p), s = st(p);
      if (t.dataset.opt) { f.optionId = t.dataset.opt; return changed(p, true); }
      if (t.dataset.lineoff) { const ed = f.budgetEdits[t.dataset.lineoff] ||= {}; if (t.checked) delete ed.off; else ed.off = true; if (!Object.keys(ed).length) delete f.budgetEdits[t.dataset.lineoff]; return changed(p, true); }
      if (t.dataset.f === 'activeScenario') { f.activeScenario = t.value || null; return changed(p, true); }
      if (t.dataset.f === 'editing') { s.editing = t.value; return paint(); }
      if (t.dataset.in === 'landBasis') { f.intake.landBasis = t.value; return changed(p, true); }
    });
    el.addEventListener('toggle', e => { const d = e.target; if (d.dataset?.group) st(p).open[d.dataset.group] = d.open; }, true);
    el.addEventListener('keydown', e => { // the stepper: arrow keys along it
      const t = e.target.closest('.ws-step'); if (!t || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
      const ids = M0.STEPS.map(x => x.id), i = ids.indexOf(t.dataset.step), to = e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
      e.preventDefault(); el.querySelector('.ws-step[data-step="' + ids[to] + '"]')?.focus();
    });
  }
  return { html, wire, studyOf, paint };
}
