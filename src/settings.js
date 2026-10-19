// Settings: one sheet for everything you set once and forget. The app-bar gear, the phone's More › Settings and
// Explore gear, ⌘, / Ctrl+, and ctx.openSettings(section) all open it. Desktop: a 420px sheet on the right over a scrim;
// phones: full screen. Sections: You & your team · Map · AI model · Saved on this device · App · Help. (The app is light only.)
// Options shown elsewhere (the Layers panel's map display, the panel's headline metrics) stay where they are and are
// linked from here. Nothing here deletes notes, projects or the team's sync queue.
import { PROVIDERS, MODEL_KEY, pickedModel, PLANSET_MODEL_KEY, PLANSET_EFFORT_KEY, EFFORTS, pickedClaude, pickedEffort } from './lib/aimodels.mjs';
import { summarize, priceOf, checkPrice, costOf, PRICES_AS_OF } from './lib/aiprices.mjs';
const SECTIONS = [['team', 'You & your team', 'Team'], ['map', 'Map', 'Map'], ['ai', 'AI model', 'AI'], ['saved', 'Saved on this device', 'Saved'], ['app', 'App', 'App'], ['help', 'Help', 'Help']];
export const BASES = { dots: 'Default', streets: 'Streets', sat: 'Satellite', topo: 'Topo', esri: 'ESRI imagery', free: 'Free Map' };
const BASE_KEY = 'fs-basemap';
// Reset layout clears only these (never localStorage.clear()): panel open/closed and width, assistant width, which
// panel sections are open, headline metrics, timeline options, export dialog choices and the Projects cards/list view
const LAYOUT_KEYS = ['fs-panel', 'fs-panel-w', 'fs-ai-w', 'fs-kpis', 'fs-tl', 'fs-export', 'fs-projects-view'];
const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const count = k => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v.length : 0; } catch (e) { return 0; } };

export function initSettings(ctx) {
  const { esc, fmtN } = ctx, app = document.querySelector('.app'), gear = document.getElementById('settingsBtn');
  const mod = /Mac|iPhone|iPad|iPod/.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+';

  // ---------- install (desktop Chrome/Edge and Android offer it; iPhone uses Share › Add to Home Screen) ----------
  let installEvt = null, installed = false;
  const standalone = () => installed || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; paintSec('app'); });
  addEventListener('appinstalled', () => { installed = true; installEvt = null; paintSec('app'); });
  ctx.install = {
    get available() { return !!installEvt; },
    async prompt() { if (!installEvt) return false; const e = installEvt; installEvt = null; e.prompt(); const r = await e.userChoice.catch(() => null); if (r?.outcome === 'accepted') installed = true; paintSec('app'); return r?.outcome === 'accepted'; }
  };

  // ---------- the AI model (Settings › AI model): picked on this device, sent with each AI request ----------
  // The server uses it only when its key can (else its default), and says which model answered (X-AI-Model)
  ctx.aiModel = () => pickedModel(get(MODEL_KEY) || '');
  ctx.noteModel = r => { const m = r?.headers?.get?.('X-AI-Model'); if (m && /^[\w.:-]{1,80}$/.test(m)) { try { localStorage.setItem('fs-ai-last', m); } catch (e) {} if (!sheet.hidden) paintSec('ai'); } };
  let models = null, modelsP = null, modelsErr = '';
  // Plan sets answer with Claude (api/planset GET): is its key set, the server's model and effort, the key's models, this month's spend
  let ps = null, psP = null;
  const loadPs = () => psP ||= fetch('api/planset').then(r => r.json()).then(d => { ps = d; }).catch(() => { ps = { error: 'Couldn’t check Claude just now.' }; psP = null; }).finally(() => paintSec('ai'));
  const EFFORT_HINT = { low: 'fastest, cheapest', medium: 'the default: good notes at a fair cost', high: 'more thorough', xhigh: 'most thorough, slowest' };
  const loadModels = () => modelsP ||= fetch('api/models').then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'The model list isn’t available.'); models = d; })
    .catch(e => { modelsErr = e.message; modelsP = null; }).finally(() => paintSec('ai'));

  // ---------- AI usage (Settings › AI model › Usage): tokens by model and feature, and the cost at list prices ----------
  // The server keeps the counts (api/aiusage); prices can be corrected here (kept on this device), and with an OpenAI
  // admin key on the server the billed amounts show beside the estimate
  const COUNT_FROM = '2026-10-16', PRICE_KEY = 'fs-ai-prices', PERIODS = [['month', 'This month'], ['30', 'Last 30 days'], ['7', 'Last 7 days'], ['today', 'Today'], ['year', 'This year']];
  const usage = { period: 'month', data: {}, busy: {}, err: {} };
  const prices = () => { try { const o = JSON.parse(localStorage.getItem(PRICE_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
  const dayCT = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const rangeOf = per => { const to = dayCT(); return { to, from: per === 'month' ? to.slice(0, 8) + '01' : per === 'year' ? to.slice(0, 5) + '01-01' : per === 'today' ? to : dayCT(Date.now() - (+per - 1) * 864e5) }; };
  const loadUsage = (per, force) => { if (usage.busy[per] || (usage.data[per] && !force)) return; usage.busy[per] = true; usage.err[per] = '';
    const { from, to } = rangeOf(per); fetch('api/aiusage?' + new URLSearchParams({ from, to })).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Usage isn’t available here.'); usage.data[per] = d; })
      .catch(e => { usage.err[per] = e.message; }).finally(() => { usage.busy[per] = false; paintSec('ai'); }); };
  const tok = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
  const usd = v => v == null ? '—' : v > 0 && v < 0.01 ? '<$0.01' : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function usageHtml() {
    const per = usage.period, d = usage.data[per]; if (!d && !usage.busy[per] && !usage.err[per]) loadUsage(per);
    const sel = '<select class="chip" id="setUsePer" aria-label="Usage period">' + PERIODS.map(([v, l]) => '<option value="' + v + '"' + (v === per ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
    let body = '';
    if (!d) body = '<div class="set-note">' + (usage.err[per] ? esc(usage.err[per]) : 'Adding up the usage…') + '</div>';
    else {
      const S = summarize(d.rows || [], prices()), billed = new Map((d.billed?.byModel || []).map(x => [x.model, x.amount]));
      const th = '<tr><th>Model</th><th title="Requests">Req</th><th title="Tokens sent (cached ones included)">In</th><th title="Tokens back, the model’s reasoning included">Out</th><th title="Estimated at list prices">Cost</th>' + (d.billed ? '<th title="What OpenAI billed">Billed</th>' : '') + '</tr>';
      const tr = (r, model) => '<tr><td>' + esc(r.label) + (model && checkPrice(model) && !prices()[model] ? '<sup title="Price sources disagreed: check it under Edit prices">*</sup>' : '') + (model && !priceOf(model, prices()) ? '<sup title="No price known: set one under Edit prices">?</sup>' : '') + '</td><td>' + r.requests.toLocaleString('en-US') + '</td><td>' + tok(r.input) + '</td><td' + (r.reasoning ? ' title="' + tok(r.reasoning) + ' of it reasoning"' : '') + '>' + tok(r.output) + '</td><td>' + usd(r.cost) + (r.priced === false && r.cost ? '+' : '') + '</td>' + (d.billed ? '<td>' + usd(model ? billed.get(model) ?? 0 : d.billed.total) + '</td>' : '') + '</tr>';
      const rows = S.byModel.map(r => tr(r, r.key)).join(''), total = S.byModel.length > 1 || (d.billed && S.byModel.length + billed.size > 1) ? tr({ ...S.total, label: 'Total', priced: S.byModel.every(r => r.priced) }, null).replace('<tr>', '<tr class="tot">') : '';
      const extra = d.billed ? [...billed].filter(([m]) => !S.byModel.some(r => r.key === m)).map(([m, v]) => '<tr class="dim"><td>' + esc(m) + '</td><td colspan="4">' + (/realtime|transcribe|tts|audio/i.test(m) ? 'voice (talks to OpenAI directly, so the app doesn’t count it)' : /search/i.test(m) ? 'search tool fees (charged per search, not per token)' : d.from < COUNT_FROM ? 'before the app began counting (Oct 16, 2026)' : d.billed.scope === 'key' ? 'not counted by the app' : 'billed to the project, not counted here (or its other keys)') + '</td><td>' + usd(v) + '</td></tr>').join('') : '';
      body = (S.byModel.length || extra ? '<div class="set-ut-w"><table class="set-ut">' + th + rows + extra + total + '</table></div>' : '<div class="set-note">No AI usage recorded ' + (per === 'today' ? 'today' : 'in this period') + '.</div>') +
        (S.byFeature.length ? '<div class="set-uf">' + S.byFeature.map(f => '<span><b>' + esc(f.label) + '</b> ' + usd(f.cost) + (f.priced === false && f.cost ? '+' : '') + ' · ' + f.requests.toLocaleString('en-US') + ' req</span>').join('') + '</div>' : '') +
        '<div class="set-note">' + (S.total.reasoning ? 'Out includes ' + tok(S.total.reasoning) + ' tokens of the model’s reasoning (billed as output). ' : '') + (d.tracking ? 'Counted by the app from OpenAI’s token figures (from Oct 16, 2026). ' : esc(d.trackError || 'Usage counting needs the database on the server.') + ' ') +
          'Costs are estimates at OpenAI’s list prices (as of ' + new Date(PRICES_AS_OF + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '; * means the published figures disagreed). ' +
          (d.billed ? billedNote(d.billed) : d.billedError ? esc(d.billedError) : 'For what OpenAI billed for this app’s key, add a read-only OpenAI admin key to the server (OPENAI_ADMIN_KEY).') + '</div>';
      const models = [...new Set([...S.byModel.map(r => r.key), ...(models0())])].slice(0, 30), P = prices();
      body += '<details class="set-prices"><summary>Edit prices</summary><p class="set-hint">USD per 1M tokens: input, cached input, output. Kept on this device; blank uses the list price.</p><table class="set-pt"><tr><th>Model</th><th>Input</th><th>Cached</th><th>Output</th></tr>' +
        models.map(m => { const lp = priceOf(m, {}) || [], o = P[m] || []; const f = (i, ph) => '<input type="number" min="0" step="0.001" inputmode="decimal" data-pm="' + esc(m) + '" data-pi="' + i + '" value="' + (o[i] ?? '') + '" placeholder="' + (ph ?? '') + '" aria-label="' + esc(m) + ' ' + ['input', 'cached input', 'output'][i] + ' price">';
          return '<tr><td>' + esc(m) + (checkPrice(m) ? '<sup>*</sup>' : '') + '</td><td>' + f(0, lp[0]) + '</td><td>' + f(1, lp[1]) + '</td><td>' + f(2, lp[2]) + '</td></tr>'; }).join('') + '</table>' +
        '<div class="set-pa"><button type="button" class="btn sm" id="setPriceReset">Use list prices</button></div></details>';
    }
    return '<div class="set-usage"><div class="set-uh"><span class="set-l">Usage</span>' + sel + '<button type="button" class="btn sm ghost" id="setUseRe" title="Refresh">Refresh</button></div>' + body + '</div>';
  }
  const models0 = () => (models?.models || []).map(m => m.id).slice(0, 12);
  // whose bill Billed is: this app's own key (never the rest of the organization's keys and projects)
  function billedNote(b) {
    const proj = b.project?.name ? '“' + esc(b.project.name) + '”' : 'its project', key = b.key?.name ? '“' + esc(b.key.name) + '”' : 'this app’s key';
    if (b.scope === 'key') return 'Billed is what OpenAI charged for ' + key + ' (in ' + proj + ') over these days; the organization’s other keys aren’t included.';
    if ((b.project?.keys || 0) <= 1) return 'Billed is what OpenAI charged for ' + proj + ', which holds only ' + key + '.';
    const own = (b.keyTokens || []).reduce((t, r) => { const c = costOf(r.model, r, prices()); return c == null ? t : t + c; }, 0), n = (b.keyTokens || []).reduce((t, r) => t + r.requests, 0);
    return 'OpenAI bills ' + proj + ' as a whole and it has ' + b.project.keys + ' keys, so Billed includes the others. ' + key + ' alone: about ' + usd(own) + ' (' + n.toLocaleString('en-US') + ' requests, OpenAI’s token counts for the key at list prices). Moving this app’s key to a project of its own makes Billed exact.';
  }
  function wireUsage(el) {
    const per = el.querySelector('#setUsePer'); if (per) per.onchange = e => { usage.period = e.target.value; paintSec('ai'); };
    const re = el.querySelector('#setUseRe'); if (re) re.onclick = () => { loadUsage(usage.period, true); paintSec('ai'); };
    el.querySelectorAll('[data-pm]').forEach(inp => inp.onchange = () => { const P = prices(), m = inp.dataset.pm, i = +inp.dataset.pi, cur = (P[m] || priceOf(m, {}) || [null, null, null]).slice(0, 3);
      cur[i] = inp.value === '' ? (priceOf(m, {}) || [])[i] ?? null : +inp.value; P[m] = cur; if (cur.every((v, k) => v === ((priceOf(m, {}) || [])[k] ?? null))) delete P[m];
      try { localStorage.setItem(PRICE_KEY, JSON.stringify(P)); } catch (e) {} const open = el.querySelector('.set-prices')?.open; paintSec('ai'); if (open) { const dd = secEl('ai').querySelector('.set-prices'); if (dd) dd.open = true; } });
    const rs = el.querySelector('#setPriceReset'); if (rs) rs.onclick = () => { try { localStorage.removeItem(PRICE_KEY); } catch (e) {} paintSec('ai'); ctx.toast('Prices back to the list prices.'); };
  }

  // ---------- voice log (also linked from Data & help) ----------
  ctx.saveVoiceLog = () => {
    const t = ctx.voiceLog?.() || '';
    if (!t) { ctx.toast('No voice session yet in this visit.'); return; }
    ctx.saveFile('voice-log-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.txt', t, 'text/plain');
  };

  // ---------- the sheet ----------
  const scrim = document.createElement('div'); scrim.className = 'set-scrim'; scrim.hidden = true;
  const sheet = document.createElement('aside'); sheet.id = 'settingsSheet'; sheet.className = 'setsheet'; sheet.hidden = true;
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'setTitle'); sheet.tabIndex = -1;
  sheet.innerHTML = '<header class="set-h"><h2 id="setTitle">Settings</h2><button type="button" class="set-x" id="setClose" aria-label="Close settings" title="Close (Esc)">' +
    '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></header>' +
    '<nav class="set-jump" aria-label="Settings sections">' + SECTIONS.map(([id, , short]) => '<button type="button" data-jump="' + id + '">' + esc(short) + '</button>').join('') + '</nav>' +
    '<div class="set-body">' + SECTIONS.map(([id, l]) => '<section class="set-sec" data-sec="' + id + '" aria-labelledby="setH-' + id + '"><h3 id="setH-' + id + '">' + esc(l) + '</h3><div class="set-in"></div></section>').join('') + '</div>';
  document.body.append(scrim, sheet);
  const body = sheet.querySelector('.set-body'), secEl = id => sheet.querySelector('[data-sec="' + id + '"] .set-in');
  let lastFocus = null, toastHome = null;
  const toastEl = document.getElementById('toast');

  const row = (label, ctl, hint = '', cls = '') => '<div class="set-row' + (cls ? ' ' + cls : '') + '"><div class="set-rl"><span class="set-l">' + label + '</span>' + (hint ? '<span class="set-hint">' + hint + '</span>' : '') + '</div><div class="set-rc">' + ctl + '</div></div>';
  const go = (label, attr, hint = '') => '<button type="button" class="set-go" ' + attr + '><span><b>' + label + '</b>' + (hint ? '<em>' + hint + '</em>' : '') + '</span><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg></button>';

  const PAINT = {
    team(el) {
      if (!el.firstChild || !el.querySelector('.team')) { el.innerHTML = ''; const slot = document.createElement('div'); el.append(slot); ctx.team?.mountSettings?.(slot); }
      else ctx.team?.refresh?.();
      if (!ctx.team) el.innerHTML = '<div class="set-note">Team sharing isn’t available in this browser.</div>';
    },
    map(el) {
      const cur = BASES[get(BASE_KEY)] ? get(BASE_KEY) : 'dots';
      el.innerHTML = row('Default base map', '<select class="chip" id="setBase" aria-label="Default base map">' + Object.entries(BASES).map(([k, l]) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>', 'The map opens with this one. You can still switch any time under Layers.') +
        row('Show sources on cards and panels', '<label class="tg2"><input type="checkbox" id="setSources"' + (ctx.showSources?.() ? ' checked' : '') + ' aria-label="Show sources on cards and panels"></label>', 'Off by default for a clean view. Exported reports always list their sources.') +
        row('Panel width', '<button type="button" class="btn sm" id="setPw"' + (get('fs-panel-w') ? '' : ' disabled') + '>Reset</button>', get('fs-panel-w') ? 'The Map’s side panel is ' + get('fs-panel-w') + 'px wide. Reset puts it back to the default.' : 'The Map’s side panel is at its default width. Drag its edge to change it.', 'set-desk') + // phones have no side panel
        '<div class="set-links">' + go('Map layers &amp; display…', 'data-act="layers"', 'Dot grid, county lines, roads, road names, 3D and every data layer') +
        go('Headline metrics…', 'data-act="kpis"', 'The 3 to 9 numbers above the filing list') + '</div>';
      el.querySelector('#setBase').onchange = e => { try { localStorage.setItem(BASE_KEY, e.target.value); } catch (err) {} if (ctx.basemap?.() !== e.target.value) ctx.setMapOptions?.({ basemap: e.target.value }); ctx.toast('The map will open with ' + BASES[e.target.value] + '.'); };
      el.querySelector('#setSources').onchange = e => { ctx.showSources?.(e.target.checked); ctx.refreshSources?.(); };
      el.querySelector('#setPw').onclick = () => { ctx.resetPanelWidth?.(); ctx.toast('Panel width reset.'); PAINT.map(el); el.querySelector('#setBase')?.focus(); };
      wireActs(el);
    },
    ai(el) {
      if (!models && !modelsP && !modelsErr) loadModels();
      const cur = ctx.aiModel(), last = get('fs-ai-last'), list = models?.models || [], def = models?.default;
      const opts = [['', 'Server default' + (def ? ' (' + def + ')' : '')], ...list.map(m => [m.id, m.id])];
      if (cur && !opts.some(o => o[0] === cur)) opts.push([cur, cur + (models ? ' (not available to this key: the default is used)' : '')]);
      el.innerHTML = row('Provider', '<select class="chip" id="setProv" aria-label="AI provider">' + PROVIDERS.map(p => '<option value="' + p.id + '"' + (p.on ? '' : ' disabled') + (p.id === 'openai' ? ' selected' : '') + '>' + esc(p.label) + (p.on ? '' : ' · coming later') + '</option>').join('') + '</select>',
          'OpenAI for site plans, Ask AI and briefs. Claude (Anthropic) makes plan sets: see Plan sets below.') +
        row('Model', '<select class="chip" id="setModel" aria-label="AI model">' + opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>',
          'For site plans, Ask AI and filing briefs. Kept on this device.') +
        '<div class="set-note" id="setModelNote">' + (modelsP && !models ? 'Checking which models the server’s OpenAI key can use…' : modelsErr && !models ? esc(modelsErr) + ' The server’s default model answers.' : models ? list.length + ' OpenAI chat models available, newest first.' : '') +
          (last ? ' The last answer came from <b>' + esc(last) + '</b>.' : '') + ' Voice and place search keep their own models. ' + esc(PROVIDERS.find(p => !p.on)?.note || '') + '</div><div id="setPsSlot"></div>' + usageHtml();
      if (!ps && !psP) loadPs();
      const pm = pickedClaude(get(PLANSET_MODEL_KEY)), pe = pickedEffort(get(PLANSET_EFFORT_KEY)), on = !!ps?.configured;
      const pOpts = [['', 'Server default' + (ps?.model ? ' (' + ps.model + ')' : '')], ...(ps?.models || []).map(m => [m.id, m.name && m.name !== m.id ? m.name + ' · ' + m.id : m.id])];
      if (pm && !pOpts.some(o => o[0] === pm)) pOpts.push([pm, pm + (ps ? ' (not available to this key: the default is used)' : '')]);
      const money = v => '$' + (v >= 100 ? Math.round(v) : (+v).toFixed(2));
      el.querySelector('#setPsSlot').outerHTML = ('<div class="set-l" style="margin:18px 0 6px">Plan sets</div>' +
        row('Claude model', '<select class="chip" id="setPsModel" aria-label="Claude model for plan sets"' + (on ? '' : ' disabled') + '>' + pOpts.map(([v, l]) => '<option value="' + esc(v) + '"' + (v === pm ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>',
          'Writes the plan set’s cover notes. Kept on this device.') +
        row('Effort', '<select class="chip" id="setPsEffort" aria-label="Claude effort for plan sets"' + (on ? '' : ' disabled') + '>' + [['', 'Server default (' + (ps?.effort || 'medium') + ')'], ...EFFORTS.map(x => [x, x[0].toUpperCase() + x.slice(1) + ' · ' + EFFORT_HINT[x]])].map(([v, l]) => '<option value="' + v + '"' + (v === pe ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>',
          'How hard Claude thinks. Higher costs more and takes longer.') +
        '<div class="set-note">' + (!ps ? 'Checking Claude…' : ps.error ? esc(ps.error) : !on ? 'Claude isn’t set up on this site: add ANTHROPIC_API_KEY on Vercel (Production and Preview), then redeploy. Plan sets are still made, without the cover notes.'
          : (ps.models?.length ? ps.models.length + ' Claude models available. ' : esc(ps.modelsError || '')) + (ps.budget?.spent != null ? 'This month: ' + money(ps.budget.spent) + ' of the ' + money(ps.budget.cap) + ' plan set budget.' : 'Monthly budget ' + money(ps.budget?.cap ?? 100) + '.')) + '</div>');
      const keepPick = (id, key, what) => el.querySelector(id).onchange = e => { try { if (e.target.value) localStorage.setItem(key, e.target.value); else localStorage.removeItem(key); } catch (err) {} ctx.toast(e.target.value ? 'Plan sets will use ' + e.target.value + ' ' + what + ' on this device.' : 'Plan sets will use the server’s ' + what + '.'); };
      keepPick('#setPsModel', PLANSET_MODEL_KEY, 'as the model'); keepPick('#setPsEffort', PLANSET_EFFORT_KEY, 'effort');
      wireUsage(el);
      el.querySelector('#setModel').onchange = e => { try { if (e.target.value) localStorage.setItem(MODEL_KEY, e.target.value); else localStorage.removeItem(MODEL_KEY); } catch (err) {} ctx.toast(e.target.value ? 'The AI will use ' + e.target.value + ' on this device.' : 'The AI will use the server’s default model' + (def ? ' (' + def + ')' : '') + '.'); };
    },
    saved(el) {
      const n = { searches: count('fs-saved-searches'), compare: count('fs-compare'), notes: ctx.field?.db?.notes?.length || 0, watch: ctx.field?.db?.watch?.length || 0, projects: ctx.sitePlan?.projects?.length || 0, files: count('fs-reports') };
      const it = (label, num, view, extra = '') => '<li><span><b>' + fmtN(num) + '</b> ' + label + extra + '</span><button type="button" class="lnk" data-open="' + view + '">Open</button></li>';
      el.innerHTML = '<ul class="set-saved">' +
        it(n.searches === 1 ? 'saved search' : 'saved searches', n.searches, 'saved') +
        it(n.compare === 1 ? 'area in Compare' : 'areas in Compare', n.compare, 'compare') +
        it(n.notes === 1 ? 'site note' : 'site notes', n.notes, 'field', n.watch ? ' · <b>' + fmtN(n.watch) + '</b> watched' : '') +
        it(n.projects === 1 ? 'project' : 'projects', n.projects, 'projects') +
        it(n.files === 1 ? 'saved report file' : 'saved report files', n.files, 'reports') + '</ul>' +
        '<div class="set-note">Kept in this browser. Notes and projects are also shared with your team when team sharing is on.</div>';
      el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { close(); ctx.setView(b.dataset.open); });
    },
    app(el) {
      const inst = standalone() ? '<span class="set-ok">Installed ✓</span>' : installEvt ? '<button type="button" class="btn primary sm" id="setInstall">Install app</button>' : '';
      const how = standalone() ? 'It opens in its own window and keeps working offline with the last data it loaded.'
        : installEvt ? 'Opens in its own window and keeps working offline.'
        : isIOS ? 'Opens like an app and keeps working offline. In Safari, tap Share → Add to Home Screen.'
        : 'Opens in its own window and keeps working offline. In Chrome or Edge, use the install button in the address bar; other browsers may not offer it.';
      el.innerHTML = row('Install the app', inst, how) +
        '<div class="set-keys set-desk"><span class="set-l">Keyboard shortcuts</span><dl>' +
        [[mod + 'K', 'Search the map'], [mod + '/', 'Ask AI'], [mod + ',', 'Settings'], ['Esc', 'Close a card, menu or this sheet']].map(([k, d]) => '<div><dt><kbd>' + esc(k) + '</kbd></dt><dd>' + esc(d) + '</dd></div>').join('') + '</dl></div>' +
        row('Reset layout', '<button type="button" class="btn sm" id="setReset">Reset…</button>', 'Puts the panel, its sections, headline metrics, timeline and export choices back to how they started. Your notes, projects, saved searches and settings stay.');
      el.querySelector('#setInstall')?.addEventListener('click', () => ctx.install.prompt());
      el.querySelector('#setReset').onclick = resetLayout;
    },
    help(el) {
      el.innerHTML = '<div class="set-links">' + go('Getting started', 'data-act="intro"', 'The short tip on what the app does, at the top of the Map panel') + go('Data sources &amp; freshness', 'data-act="sources"', 'Where every number comes from and when it was last refreshed') +
        go('Save voice log', 'data-act="voicelog"', 'What the voice assistant heard and did in this visit, for troubleshooting') + '</div>';
      wireActs(el);
    },
  };
  function wireActs(el) {
    el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      const a = b.dataset.act;
      if (a === 'voicelog') { ctx.saveVoiceLog(); return; }
      close();
      if (a === 'intro') { ctx.showIntro?.(); return; }
      if (a === 'sources') { ctx.setView('sources'); return; }
      ctx.setView('map');
      const phone = matchMedia('(max-width:700px)').matches;
      if (a === 'layers') {
        if (phone) document.querySelector('#mnav [data-tab=map]')?.click();
        // the Layers panel with its Map display group open and in view (that is where the options this link names live)
        setTimeout(() => {
          const L = document.getElementById('layers'); if (!L) return;
          if (!L.classList.contains('on')) document.getElementById('layersBtn')?.click();
          const d = L.querySelector('[data-lyg="display"]'); if (!d) return;
          d.open = true; requestAnimationFrame(() => d.scrollIntoView({ block: 'nearest', behavior: ctx.reduceMotion ? 'auto' : 'smooth' }));
        }, 60);
      } else if (a === 'kpis') {
        // the metrics sit in the panel's Construction Filings section: show the panel, open the section, then the picker
        if (phone) document.querySelector('#mnav [data-tab=list]')?.click();
        else if (app.classList.contains('pcollapsed')) document.getElementById('panelToggle')?.click();
        const sec = document.getElementById('secFilings'); if (sec?.getAttribute('aria-expanded') !== 'true') sec?.click();
        setTimeout(() => { ctx.openKpis?.(); requestAnimationFrame(() => document.getElementById('kpiPop')?.scrollIntoView({ block: 'nearest' })); }, 80);
      }
    });
  }
  function resetLayout() {
    if (!confirm('Reset the layout?\n\nThe panel, its sections, headline metrics, timeline and export choices go back to how they started, and the page reloads. Your notes, projects, saved searches and other settings are kept.')) return;
    try {
      const keys = LAYOUT_KEYS.slice();
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('fs-sec-')) keys.push(k); }
      keys.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
    location.reload();
  }
  function paintSec(id) { if (!sheet.hidden) PAINT[id](secEl(id)); } // closed: it's drawn fresh when it opens

  // ---------- open / close, focus kept inside, Esc and the scrim close ----------
  function open(section) {
    if (sheet.hidden) {
      lastFocus = document.activeElement;
      SECTIONS.forEach(([id]) => PAINT[id](secEl(id)));
      sheet.hidden = false; scrim.hidden = false; app.classList.add('set-open'); gear?.setAttribute('aria-expanded', 'true');
      if (toastEl) { toastHome = [toastEl.parentNode, toastEl.nextSibling]; document.body.append(toastEl); } // messages from here show over the sheet
      requestAnimationFrame(() => { sheet.classList.add('on'); scrim.classList.add('on'); });
    }
    const target = section && sheet.querySelector('[data-sec="' + section + '"]');
    if (target) { body.scrollTop = 0; target.scrollIntoView({ block: 'start' }); flash(target); }
    else body.scrollTop = 0;
    setTimeout(() => (target?.querySelector('input,select,button') || sheet.querySelector('#setClose')).focus({ preventScroll: true }), 30);
  }
  function close() {
    if (sheet.hidden) return;
    sheet.classList.remove('on'); scrim.classList.remove('on'); app.classList.remove('set-open'); gear?.setAttribute('aria-expanded', 'false');
    sheet.hidden = true; scrim.hidden = true;
    if (toastHome?.[0]?.isConnected) toastHome[0].insertBefore(toastEl, toastHome[1]?.parentNode === toastHome[0] ? toastHome[1] : null); toastHome = null;
    ctx.team?.refresh?.(); // the header chips pick up a new name
    if (lastFocus?.isConnected) lastFocus.focus?.({ preventScroll: true }); lastFocus = null;
  }
  function flash(el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  ctx.openSettings = open; ctx.closeSettings = close;
  sheet.querySelector('#setClose').onclick = close;
  scrim.onclick = close;
  sheet.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => { const t = sheet.querySelector('[data-sec="' + b.dataset.jump + '"]'); t.scrollIntoView({ block: 'start', behavior: ctx.reduceMotion ? 'auto' : 'smooth' }); flash(t); });
  // Esc closes the sheet first (and only the sheet), wherever the focus is
  addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) { e.preventDefault(); e.stopImmediatePropagation(); close(); } }, true);
  sheet.addEventListener('keydown', e => ctx.trapTab(sheet, e)); // Tab stays in the sheet (app.js; Export uses the same)
  // the sheet is modal: the search (Ctrl+K) and Ask AI (Ctrl+/) shortcuts do nothing behind it
  addEventListener('keydown', e => {
    if (sheet.hidden || !(e.metaKey || e.ctrlKey) || e.altKey) return;
    if ((e.key || '').toLowerCase() === 'k' || e.key === '/' || e.code === 'Slash') { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === ',' || e.code === 'Comma')) { e.preventDefault(); if (sheet.hidden) open(); else close(); }
  });
  document.getElementById('exploreSettings')?.addEventListener('click', () => open());
}
