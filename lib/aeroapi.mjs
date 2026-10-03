// FlightAware AeroAPI v4: origin, destination, departure / arrival times and recent flights for a callsign or tail number,
// for the planes the free route database (adsb.lol) doesn't know, mostly private and charter flights.
// AeroAPI is paid per "result set" (a page of up to 15 records). Every call goes through a hard monthly cap kept in
// Supabase (migration 20261012000000_aeroapi.sql): AEROAPI_MONTHLY_CAP dollars, default 4.75, under the $5 free monthly
// credit. No AEROAPI_KEY, no database or no cap table -> no call (fails closed). Answers are cached 10-20 minutes.
export const BASE = 'https://aeroapi.flightaware.com/aeroapi';
export const capCents = (env = process.env) => Math.round(Math.max(0, Math.min(+(env.AEROAPI_MONTHLY_CAP ?? 4.75) || 0, 100)) * 100);
// what one page is assumed to cost until FlightAware's own usage figure catches up: /flights/{ident} is reported at
// about $0.005 a page; 1 cent errs high so a wrong guess stops calls early rather than late
const pageCents = (env = process.env) => Math.max(0.1, +(env.AEROAPI_PAGE_CENTS || 1));
export const month = (d = new Date()) => d.toISOString().slice(0, 7);
const RECONCILE_MS = 15 * 60e3;

// an N-number is a registration; anything else (DAL1601, EJA512) a callsign
export const identType = id => /^N[1-9][0-9A-Z]{0,4}$/.test(id) ? 'registration' : 'designator';
export const cleanIdent = s => { const t = String(s || '').trim().toUpperCase().replace(/[\s-]/g, ''); return /^[A-Z0-9]{2,8}$/.test(t) ? t : null; };

const apt = a => a && (a.code || a.code_icao || a.code_iata || a.code_lid) ? { code: a.code_iata || a.code_lid || a.code_icao || a.code, icao: a.code_icao || null, name: a.name || null, city: a.city || null } : null;
export function summarize(f) {
  const arrived = f.actual_on || f.actual_in || null;
  return { id: f.fa_flight_id || null, ident: f.ident || null, operator: f.operator || null, registration: f.registration || null, aircraft_type: f.aircraft_type || null,
    origin: apt(f.origin), destination: apt(f.destination), status: f.status || null, departed: f.actual_off || f.actual_out || null,
    scheduled_departure: f.scheduled_out || f.scheduled_off || null, arrived, eta: arrived ? null : f.estimated_on || f.estimated_in || f.scheduled_on || f.scheduled_in || null,
    progress_pct: f.progress_percent ?? null, cancelled: !!f.cancelled, diverted: !!f.diverted, filed_altitude_ft: f.filed_altitude ? f.filed_altitude * 100 : null, distance_mi: f.route_distance ?? null };
}
// AeroAPI flights -> the one in the air now (if any) and the latest few that flew
export function shape(flights) {
  const all = (flights || []).map(summarize).filter(f => f.origin || f.destination);
  const airborne = all.filter(f => f.departed && !f.arrived && !f.cancelled).sort((a, b) => b.departed.localeCompare(a.departed));
  const flown = all.filter(f => f.departed && !f.cancelled).sort((a, b) => b.departed.localeCompare(a.departed));
  return { current: airborne[0] || null, recent: flown.slice(0, 6) };
}

// spent so far this month as the cap counts it (FlightAware's figure + calls logged since), in dollars
export async function budget(db, env = process.env) {
  const cap = capCents(env) / 100;
  if (!db || db.via !== 'key') return { month: month(), cap, spent: null };
  const [s] = (await db.rpc('aeroapi_status', { p_month: month() })) || [];
  return { month: month(), cap, spent: s ? Math.round((+s.reported_cents + +s.pending_cents)) / 100 : 0, calls: s ? +s.calls : 0, reported_at: s?.reported_at || null };
}

// FlightAware's own month-to-date cost (free to ask), at most every 15 minutes; best effort
async function reconcile(db, env, fetchImpl) {
  const [s] = (await db.rpc('aeroapi_status', { p_month: month() })) || [];
  if (s?.reported_at && Date.now() - Date.parse(s.reported_at) < RECONCILE_MS + 10 * 60e3) return;
  const asOf = new Date(), start = month(asOf) + '-01T00:00:00Z';
  const r = await fetchImpl(BASE + '/account/usage?start=' + encodeURIComponent(start) + '&all_keys=true', { headers: { 'x-apikey': env.AEROAPI_KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error('usage ' + r.status);
  const d = await r.json(), cost = Number(d.total_cost);
  if (!Number.isFinite(cost)) throw new Error('usage: no total_cost');
  await db.rpc('aeroapi_report', { p_month: month(asOf), p_cents: Math.round(cost * 100000) / 1000, p_as_of: asOf.toISOString() });
}

const MEM = new Map(); // warm-instance cache in front of the database one
let usageFailed = 0;
export async function flights(raw, { db, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const ident = cleanIdent(raw); if (!ident) return { available: true, error: 'Give a callsign or N-number.' };
  if (!env.AEROAPI_KEY) return { available: false, note: 'FlightAware isn’t connected (set AEROAPI_KEY on the site).' };
  if (!db || db.via !== 'key') return { available: false, note: 'FlightAware lookups need the database for their spending cap (SUPABASE_SECRET_KEY).' };
  const type = identType(ident), k = type + ':' + ident, ttl = (type === 'registration' ? 20 : 10) * 60e3;
  const m = MEM.get(k); if (m && Date.now() - m.t < ttl) return { ...m.out, cached: true };
  const hit = (await db.select('aeroapi_cache', 'select=data,at&k=eq.' + encodeURIComponent(k) + '&at=gte.' + new Date(Date.now() - ttl).toISOString()))?.[0];
  if (hit) { MEM.set(k, { t: Date.parse(hit.at), out: hit.data }); return { ...hit.data, cached: true }; }

  if (Date.now() - usageFailed > RECONCILE_MS) try { await reconcile(db, env, fetchImpl); } catch (e) { usageFailed = Date.now(); console.warn('aeroapi: usage check failed (' + e.message + '); counting estimates'); }
  const cap = capCents(env);
  if (!await db.rpc('aeroapi_reserve', { p_month: month(), p_cents: pageCents(env), p_cap_cents: cap, p_what: 'flights/' + ident }))
    return { available: true, capped: true, ident, note: 'This month’s FlightAware budget ($' + (cap / 100).toFixed(2) + ') is used up; flight details come back on the 1st.', budget: await budget(db, env) };
  const r = await fetchImpl(BASE + '/flights/' + encodeURIComponent(ident) + '?ident_type=' + type + '&max_pages=1', { headers: { 'x-apikey': env.AEROAPI_KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (r.status === 401 || r.status === 403) throw new Error('FlightAware refused the key (' + r.status + ')');
  if (r.status === 429) return { available: true, busy: true, ident, note: 'FlightAware is rate-limiting (10 lookups a minute); try again shortly.' };
  if (!r.ok && r.status !== 404 && r.status !== 400) throw new Error('FlightAware ' + r.status);
  const d = r.ok ? await r.json() : { flights: [] };
  const out = { available: true, source: 'FlightAware AeroAPI', ident, type, ...shape(d.flights), as_of: new Date().toISOString() };
  MEM.set(k, { t: Date.now(), out }); if (MEM.size > 300) MEM.delete(MEM.keys().next().value);
  await db.upsert('aeroapi_cache', [{ k, data: out, at: out.as_of }], 'k').catch(e => console.warn('aeroapi cache', e.message));
  return out;
}
