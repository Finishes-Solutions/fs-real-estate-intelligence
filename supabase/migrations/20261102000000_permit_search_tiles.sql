-- Permits you can find and a permits map layer like Parcels.
--   permit_search(...)   specific permits by number, street address, contractor / words, kind, value and dates, in a box or
--                        in some sources (api/devdata.js ?search=1, the assistant's find_permits, the MCP permit_search)
--   permit_tile(z,x,y)   Mapbox vector tiles (base64 text: PostgREST returns it as a JSON string) for the Permits layer:
--                        a density grid up to zoom 11 (permit_grid), single permits from zoom 12
--   permit_grid_refresh  rebuilds permit_grid from dev_items (a full scan of ~40M rows: minutes), daily by pg_cron
-- dev_items holds ~40M rows, so the three indexes the search needs (and the daily grid) take longer than an API request may
-- run (service_role: 40 s). They run inside the database as pg_cron jobs; the index jobs remove themselves once built.

create extension if not exists pg_cron;

-- ---------- density grid for the zoomed-out map ----------
create table if not exists public.permit_grid (
  lvl smallint not null,          -- 0: 0.005° cells (~500 m), 1: 0.05° cells (~5 km)
  gx integer not null, gy integer not null,
  n integer not null,             -- permits ever
  n1 integer not null,            -- permits in the last 365 days
  nb integer not null,            -- new buildings and additions ever (cat new-*)
  primary key (lvl, gx, gy)
);
alter table public.permit_grid enable row level security;
create table if not exists public.permit_grid_meta (k text primary key, at timestamptz not null default now(), cells integer, permits bigint);
alter table public.permit_grid_meta enable row level security;

create or replace function public.permit_grid_refresh()
returns integer language plpgsql security definer set search_path = public set statement_timeout = 0 set work_mem = '256MB' as $$
declare c integer; p bigint;
begin
  create temp table g0 on commit drop as
    select floor(lon / 0.005)::int gx, floor(lat / 0.005)::int gy, count(*)::int n,
      count(*) filter (where day >= current_date - 365)::int n1, count(*) filter (where cat like 'new-%')::int nb
    from dev_items where kind = 'permit' and lon is not null group by 1, 2;
  -- delete + insert (not truncate) so the map keeps reading the old grid until this commits
  delete from permit_grid;
  insert into permit_grid select 0, gx, gy, n, n1, nb from g0;
  insert into permit_grid select 1, floor(gx / 10.0)::int, floor(gy / 10.0)::int, sum(n), sum(n1), sum(nb) from g0 group by 2, 3;
  select count(*), coalesce(sum(n), 0) into c, p from g0;
  insert into permit_grid_meta (k, at, cells, permits) values ('grid', now(), c, p) on conflict (k) do update set at = excluded.at, cells = excluded.cells, permits = excluded.permits;
  return c;
end $$;
revoke all on function public.permit_grid_refresh() from public, anon, authenticated;

-- ---------- vector tiles ----------
create or replace function public.permit_tile(z integer, x integer, y integer)
returns text language plpgsql stable security definer set search_path = public, extensions as $$
declare env geometry := ST_TileEnvelope(z, x, y); e4 geometry; sz double precision; lv smallint; t bytea;
begin
  if z < 0 or z > 22 then return ''; end if;
  e4 := ST_Transform(env, 4326);
  if z <= 11 then
    lv := case when z <= 7 then 1 else 0 end; sz := case when lv = 1 then 0.05 else 0.005 end;
    select ST_AsMVT(q, 'grid', 4096, 'g') into t from (
      select ST_AsMVTGeom(ST_Transform(ST_SetSRID(ST_MakePoint((gx + 0.5) * sz, (gy + 0.5) * sz), 4326), 3857), env, 4096, 32, true) g, n, n1, nb
      from permit_grid where lvl = lv
        and gx between floor(ST_XMin(e4) / sz)::int and floor(ST_XMax(e4) / sz)::int
        and gy between floor(ST_YMin(e4) / sz)::int and floor(ST_YMax(e4) / sz)::int) q where g is not null;
  else
    -- the newest permits in the tile (a dense city tile at zoom 12 can hold a million; closer zooms hold all of them)
    select ST_AsMVT(q, 'permits', 4096, 'g') into t from (
      select ST_AsMVTGeom(ST_Transform(geom, 3857), env, 4096, 32, true) g, id, coalesce(cat, 'other') cat,
        coalesce(to_char(day, 'YYYYMMDD')::int, 0) d, amount v
      from dev_items where kind = 'permit' and geom && e4
      order by day desc nulls last limit case when z >= 15 then 40000 when z >= 14 then 25000 else 12000 end) q where g is not null;
  end if;
  return encode(coalesce(t, ''::bytea), 'base64');
end $$;
revoke all on function public.permit_tile(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.permit_tile(integer, integer, integer) to service_role;

-- ---------- search ----------
-- Every filter is optional but one of permit number, address (house number), box or sources is required (the API checks):
-- those are the indexed ones. Words match the permit's title, address, description, type and contractor.
create or replace function public.permit_search(p_permit text default null, p_num text default null, p_words text[] default null,
  p_text text default null, p_sources text[] default null, p_cats text[] default null, p_since date default null, p_until date default null,
  p_min double precision default null, w double precision default null, s double precision default null, e double precision default null,
  n double precision default null, p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := 'select * from dev_items d where kind = ''permit'''; out jsonb; wd text;
begin
  if p_permit is not null then q := q || format(' and d.attrs ? ''permit'' and upper(d.attrs->>''permit'') = %L', upper(trim(p_permit))); end if;
  if p_num is not null then q := q || format(' and d.addr is not null and upper(d.addr) like %L', upper(p_num) || ' %'); end if;
  if p_words is not null then foreach wd in array p_words loop q := q || format(' and upper(d.addr) like %L', '%' || upper(wd) || '%'); end loop; end if;
  if p_text is not null then q := q || format(' and (d.name || '' '' || coalesce(d.addr, '''') || '' '' || coalesce(d.attrs->>''desc'', '''') || '' '' || coalesce(d.attrs->>''type'', '''') || '' '' || coalesce(d.attrs->>''note'', '''') || '' '' || coalesce(d.attrs->>''contractor'', '''')) ilike %L', '%' || p_text || '%'); end if;
  if p_sources is not null then q := q || format(' and d.source = any(%L::text[])', p_sources); end if;
  if p_cats is not null then q := q || format(' and d.cat = any(%L::text[])', p_cats); end if;
  if p_since is not null then q := q || format(' and d.day >= %L::date', p_since); end if;
  if p_until is not null then q := q || format(' and d.day <= %L::date', p_until); end if;
  if p_min is not null then q := q || format(' and d.amount >= %s', p_min); end if;
  if w is not null then q := q || format(' and d.geom && ST_MakeEnvelope(%s, %s, %s, %s, 4326)', w, s, e, n); end if;
  q := q || format(' order by d.day desc nulls last limit %s', least(greatest(coalesce(p_limit, 25), 1), 200));
  execute 'select coalesce(jsonb_agg(jsonb_build_object(''id'', id, ''source'', source, ''county'', county, ''name'', name, ''cat'', cat, ''status'', status, ''day'', day, ''amount'', amount, ''units'', units, ''addr'', addr, ''lon'', lon, ''lat'', lat,
      ''permit'', attrs->>''permit'', ''type'', attrs->>''type'', ''desc'', left(coalesce(attrs->>''desc'', attrs->>''note''), 300), ''contractor'', attrs->>''contractor'', ''place'', attrs->>''place'', ''state'', attrs->>''state'', ''zip'', attrs->>''zip'', ''agency'', attrs->>''agency'', ''acct'', attrs->>''acct'')), ''[]''::jsonb) from (' || q || ') t' into out;
  return out;
end $$;
revoke all on function public.permit_search(text, text, text[], text, text[], text[], date, date, double precision, double precision, double precision, double precision, double precision, integer) from public, anon, authenticated;
grant execute on function public.permit_search(text, text, text[], text, text[], text[], date, date, double precision, double precision, double precision, double precision, double precision, integer) to service_role;

-- ---------- the long jobs ----------
-- pg_cron runs each command on its own connection with no statement timeout. A concurrent index build must be the only
-- statement of its command, and two on one table wait for each other, so the three builds simply run one after another;
-- once an index exists its job is a no-op, and permit-jobs-done unschedules the lot when all three are valid.
-- dev_items_permitno is the copy started from the SQL console on Nov 2 and cut off at its 60 s limit (left invalid):
-- dropped here, rebuilt under a new name.
select cron.schedule('permit-index-drop-bad', '*/15 * * * *', $j$drop index concurrently if exists public.dev_items_permitno$j$);
select cron.schedule('permit-index-number', '*/15 * * * *', $j$create index concurrently if not exists dev_items_permit_no on public.dev_items (upper(attrs->>'permit')) where kind = 'permit' and attrs ? 'permit'$j$);
select cron.schedule('permit-index-addr', '*/15 * * * *', $j$create index concurrently if not exists dev_items_permit_addr on public.dev_items (upper(addr) text_pattern_ops) where kind = 'permit' and addr is not null$j$);
select cron.schedule('permit-index-source-day', '*/15 * * * *', $j$create index concurrently if not exists dev_items_permit_source_day on public.dev_items (source, day desc) where kind = 'permit'$j$);
select cron.schedule('permit-jobs-done', '*/15 * * * *', $j$
do $b$ begin
  if (select count(*) from pg_index i join pg_class c on c.oid = i.indexrelid where c.relname in ('dev_items_permit_no', 'dev_items_permit_addr', 'dev_items_permit_source_day') and i.indisvalid) = 3
     and not exists (select 1 from pg_class where relname = 'dev_items_permitno') then
    perform cron.unschedule(j) from unnest(array['permit-index-drop-bad', 'permit-index-number', 'permit-index-addr', 'permit-index-source-day', 'permit-jobs-done']) j;
  end if;
end $b$$j$);
-- the grid: checked every 30 minutes, rebuilt when it is more than 20 hours old (so once a day, and right away the first time)
select cron.schedule('permit-grid', '*/30 * * * *', $j$
do $b$ begin
  if coalesce((select at from public.permit_grid_meta where k = 'grid'), '-infinity') < now() - interval '20 hours' then perform public.permit_grid_refresh(); end if;
end $b$$j$);
