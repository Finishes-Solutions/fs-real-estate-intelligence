// Who is behind a company owner (api/entity: Texas Comptroller franchise-tax records, free): on a property card,
// when the owner is a company, its Texas status, where it was formed, registered agent, mailing address and the
// officers, managers or members from its latest public report. People's names are never looked up.
// ctx.renderOwnerCo(el, ownerName) fills el; ctx.ownerCompany(name) returns the data (the assistant can use it).
const ENTITY = /\b(L\.?\s?L\.?\s?C|L\.?\s?P|L\.?\s?L\.?\s?P|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|TRUST|PARTNERS(HIP)?|HOLDINGS?|PROPERTIES|PROPERTY|INVESTMENTS?|INVESTORS|GROUP|FUND|REIT|ASSOCIATION|ASSN|ENTERPRISES?|VENTURES?|CAPITAL|REALTY|DEVELOPMENT|MANAGEMENT|PLLC|LLLP)\b/i;

export function initOwner(ctx) {
  const { esc } = ctx, cache = new Map();
  const get = name => { const k = String(name || '').trim().toUpperCase(); if (!cache.has(k)) cache.set(k, fetch('api/entity?name=' + encodeURIComponent(k)).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'lookup failed'); return d; }).catch(e => { cache.delete(k); throw e; })); return cache.get(k); };
  const byId = id => fetch('api/entity?id=' + encodeURIComponent(id)).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'lookup failed'); return d; });
  ctx.ownerCompany = get;

  function html(d) {
    const m = d.match;
    if (!m) return '<div class="rnote">No exact match for “' + esc(d.query) + '” in the Texas Comptroller’s records' + (d.candidates?.length ? '. Similar names:' : '.') + '</div>' +
      (d.candidates?.length ? d.candidates.map(c => '<button class="pl plb" type="button" data-tx="' + esc(c.taxpayer_id) + '"><b>' + esc(c.name) + '</b><span>' + esc(c.zip ? 'ZIP ' + c.zip : '') + '</span></button>').join('') : '');
    const st = m.status || m.sos_status, bad = st && !/active/i.test(st);
    return '<div class="oc-head"><b>' + esc(m.name) + '</b>' + (st ? ' <span class="oc-st' + (bad ? ' bad' : '') + '">' + esc(st) + '</span>' : '') + '</div><dl class="oc">' +
      (m.state || m.formed ? '<dt>Formed</dt><dd>' + esc([m.state && (m.state === 'TX' ? 'Texas' : m.state), m.formed].filter(Boolean).join(', ')) + '</dd>' : '') +
      (m.agent ? '<dt>Registered agent</dt><dd>' + esc(m.agent.name) + (m.agent.address ? '<br><span class="sc">' + esc(m.agent.address) + '</span>' : '') + '</dd>' : '') +
      (m.mailing ? '<dt>Mailing address</dt><dd>' + esc(m.mailing) + '</dd>' : '') +
      (m.sos_file ? '<dt>SOS file no.</dt><dd class="mono">' + esc(m.sos_file) + '</dd>' : '') + '<dt>Taxpayer no.</dt><dd class="mono">' + esc(m.taxpayer_id) + '</dd></dl>' +
      (m.officers?.length ? '<div class="fl">Officers, managers &amp; members' + (m.report_year ? ' (' + esc(m.report_year) + ' report)' : '') + '</div>' + m.officers.slice(0, 12).map(o => '<div class="pl"><b>' + esc(o.name) + '</b><span>' + esc(o.titles.join(', ')) + '</span></div>').join('') +
        (m.officers.length > 12 ? '<details class="raw"><summary>' + (m.officers.length - 12) + ' more</summary>' + m.officers.slice(12).map(o => '<div class="pl"><b>' + esc(o.name) + '</b><span>' + esc(o.titles.join(', ')) + '</span></div>').join('') + '</details>' : '') : '<div class="rnote">No officers on file.</div>') +
      (d.candidates?.length ? '<details class="raw"><summary>Other similar names (' + d.candidates.length + ')</summary>' + d.candidates.map(c => '<button class="pl plb" type="button" data-tx="' + esc(c.taxpayer_id) + '"><b>' + esc(c.name) + '</b><span>' + esc(c.zip ? 'ZIP ' + c.zip : '') + '</span></button>').join('') + '</details>' : '');
  }
  function wire(el, d) { el.querySelectorAll('[data-tx]').forEach(b => b.onclick = async () => { b.disabled = true; try { const x = await byId(b.dataset.tx); paint(el, { ...d, ...x, candidates: d.candidates.filter(c => c.taxpayer_id !== b.dataset.tx) }); } catch (e) { b.disabled = false; ctx.toast?.(e.message); } }); }
  const head = '<div class="fl">Company behind the owner<span class="src"> (Texas Comptroller)</span></div>';
  function paint(el, d) { el.innerHTML = head + html(d) + '<div class="ssrc src">Texas Comptroller franchise-tax records and the latest Public Information Report; registered agent and status from the Secretary of State. <a target="_blank" rel="noopener" href="' + esc(d.search_page || 'https://comptroller.texas.gov/taxes/franchise/account-status/search') + '">Search the Comptroller ↗</a></div>'; wire(el, d); }
  ctx.renderOwnerCo = async (el, name) => {
    if (!el) return; const n = String(name || '').trim();
    if (!n || !ENTITY.test(n)) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false; el.innerHTML = head + '<div class="rnote">Looking up ' + esc(n) + '…</div>';
    try { const d = await get(n); if (!el.isConnected) return; if (d.individual) { el.innerHTML = ''; el.hidden = true; return; } paint(el, d); }
    catch (e) { if (el.isConnected) el.innerHTML = head + '<div class="rnote">Company lookup unavailable (' + esc(e.message) + ').</div>'; }
  };
}
