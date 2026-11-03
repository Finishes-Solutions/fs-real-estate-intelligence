// An in-memory stand-in for the team's Supabase, as far as projects and server runs use it: PostgREST on site_projects
// (select by id / id list / everything, upsert, conditional PATCH) and Storage on one bucket (put, get, list, delete,
// signed uploads and downloads). handle(url, opts) answers like the real service; install() routes fetch() calls for
// its host here (everything else goes out as usual). Nothing leaves the process.
export function fakeSupabase({ host = 'https://fake-supa.test', bucket = 'project-media' } = {}) {
  const rows = new Map(), files = new Map();
  const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
  const S = '/storage/v1/object/';
  const ids = q => { const v = q.get('id') || ''; if (v.startsWith('eq.')) return [decodeURIComponent(v.slice(3))]; if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')); return null; };
  async function bodyOf(b) { if (b == null) return Buffer.alloc(0); if (typeof b === 'string') return Buffer.from(b); if (b instanceof ArrayBuffer) return Buffer.from(b); if (ArrayBuffer.isView(b)) return Buffer.from(b.buffer, b.byteOffset, b.byteLength); if (typeof b.arrayBuffer === 'function') return Buffer.from(await b.arrayBuffer()); return Buffer.from(String(b)); }
  async function handle(url, opts = {}) {
    const u = new URL(String(url)), m = (opts.method || 'GET').toUpperCase(), p = decodeURIComponent(u.pathname);
    if (p === '/rest/v1/site_projects') {
      const want = ids(u.searchParams);
      if (m === 'GET') { let list = [...rows.values()]; if (want) list = list.filter(r => want.includes(r.id)); list.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))); return J(list); }
      if (m === 'POST') { for (const r of JSON.parse(String(await bodyOf(opts.body)))) rows.set(r.id, r); return new Response(null, { status: 201 }); }
      if (m === 'PATCH') { const id = want?.[0], at = (u.searchParams.get('updated_at') || '').replace(/^eq\./, ''), r = rows.get(id); if (!r || r.updated_at !== at) return J([]); const nr = JSON.parse(String(await bodyOf(opts.body))); rows.set(id, nr); return J([nr]); }
    }
    if (p.startsWith('/rest/v1/')) return J({ code: 'PGRST205', message: 'Could not find the table ' + p }, 404); // (usage counters and the rest: not here)
    if (p === S + 'list/' + bucket) { const pre = JSON.parse(String(await bodyOf(opts.body))).prefix; return J([...files.keys()].filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map(k => ({ name: k.slice(pre.length), created_at: files.get(k).at }))); }
    if (p.startsWith(S + 'upload/sign/' + bucket + '/')) { const k = p.slice((S + 'upload/sign/' + bucket + '/').length);
      if (m === 'POST') return J({ url: '/object/upload/sign/' + bucket + '/' + encodeURI(k) + '?token=t' });
      if (m === 'PUT') { files.set(k, { body: await bodyOf(opts.body), at: new Date().toISOString(), type: opts.headers?.['Content-Type'] || '' }); return J({ Key: k }); } }
    if (p.startsWith(S + 'sign/' + bucket + '/')) { const k = p.slice((S + 'sign/' + bucket + '/').length); return J({ signedURL: '/object/sign/' + bucket + '/' + encodeURI(k) + '?token=t' }); }
    if (p.startsWith('/storage/v1/object/sign/' + bucket + '/') && m === 'GET') { const k = p.slice(('/storage/v1/object/sign/' + bucket + '/').length); return files.has(k) ? new Response(files.get(k).body) : J({ error: 'not_found', message: 'Object not found' }, 400); }
    if (p === S + bucket && m === 'DELETE') { for (const k of JSON.parse(String(await bodyOf(opts.body))).prefixes) files.delete(k); return J([]); }
    if (p.startsWith(S + bucket + '/')) { const k = p.slice((S + bucket + '/').length);
      if (m === 'POST' || m === 'PUT') { files.set(k, { body: await bodyOf(opts.body), at: new Date().toISOString() + Math.random() }); return J({ Key: k }); }
      return files.has(k) ? new Response(files.get(k).body) : J({ error: 'not_found', message: 'Object not found' }, 400); }
    return J({ message: 'fake supabase: ' + m + ' ' + p }, 404);
  }
  function install() {
    const real = globalThis.fetch;
    globalThis.fetch = (url, opts) => String(url?.url || url).startsWith(host) ? handle(String(url?.url || url), opts) : real(url, opts);
    return () => { globalThis.fetch = real; };
  }
  return { host, rows, files, handle, install };
}
