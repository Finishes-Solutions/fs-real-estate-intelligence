-- Faster crime reports, and no area limit (Oct 14). A ~76 sq mi selection took 27 s in crime_report() and the API gave up
-- (PostgREST stops a statement after 8 s), so the report failed. Three changes:
--   1. One pass over the area's incidents: every breakdown (totals, offenses, premises, months, hours, weekdays, years)
--      comes from a single GROUPING SETS scan instead of a materialized list read eight times.
--   2. Houston's own numbers (the "vs the city" figures, and the whole report for an area that takes in every incident)
--      are computed once per data load into crime_city_stats by crime_city_refresh(), not on every report (two full
--      scans of 1.5 million rows each time).
--   3. crime_incidents is stored in location order (CLUSTER on the point index), so an area reads neighbouring pages
--      instead of ~12,000 scattered ones. The nightly sync saves each load in location order too; crime_recluster()
--      redoes the whole table (minutes: run it from the SQL editor, not through the API, if reports slow down again).
-- Measured on the project after applying (Oct 14): the 83 sq mi Jersey Village box 27.5 s -> 1.7 s (incident list
-- 13.5 s -> 0.8 s), downtown 1.5 sq mi 0.85 s, the whole city 0.2 s, an area covering most of the city ~16 s.
-- The 1,500 square mile check is gone: incidents only exist inside Houston, so a larger area just counts what is in it.
-- The API's role (service_role, server only) may run statements for up to 40 s; anon and authenticated keep 3 s / 8 s.

create table if not exists public.crime_city_stats (
  id smallint primary key default 1 check (id = 1),
  latest date,
  hull geometry(Polygon, 4326), -- the box around every incident: an area covering it gets the whole-city report
  report jsonb,                 -- crime_area_stats() over everything
  updated_at timestamptz not null default now()
);
alter table public.crime_city_stats enable row level security;
revoke all on public.crime_city_stats from public, anon, authenticated;

-- every breakdown of the incidents matching p_where (a SQL condition on crime_incidents c; $1 is the area geometry),
-- relative to p_last (the newest incident): one scan, grouped seven ways
create or replace function public.crime_area_stats(p_where text, p_geom geometry, p_last date)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $fn$
declare out jsonb;
begin
  execute format($q$
    with x as (
      select c.cat::text as cat, c.code, coalesce(c.premise, 'Unknown') as premise, to_char(date_trunc('month', c.day), 'YYYY-MM') as m, c.hour as h,
        extract(dow from c.day)::int as d, extract(year from c.day)::int as y, c.day, c.n
      from crime_incidents c where %s
    ), s as (
      select cat, code, premise, m, h, d, y, grouping(code, premise, m, h, d, y) as g,
        coalesce(sum(n) filter (where day > $2 - 365), 0) as c12,
        coalesce(sum(n) filter (where day > $2 - 730 and day <= $2 - 365), 0) as p12,
        coalesce(sum(n) filter (where day > $2 - 730), 0) as c24,
        sum(n) as tot, min(day) as d0, max(day) as d1
      from x group by grouping sets ((cat), (code, cat), (premise), (m, cat), (h, cat), (d, cat), (y, cat))
    )
    select jsonb_build_object(
      'totals', coalesce((select jsonb_object_agg(k, v) from (select 'last12_' || cat as k, c12 as v from s where g = 63 union all select 'prior12_' || cat, p12 from s where g = 63) t), '{}'::jsonb),
      'by_code', coalesce((select jsonb_agg(jsonb_build_array(code, c12, cat) order by c12 desc, code) from (select code, cat, c12 from s where g = 31 and c12 > 0 order by c12 desc, code limit 25) t), '[]'::jsonb),
      'by_premise', coalesce((select jsonb_agg(jsonb_build_array(premise, c12) order by c12 desc, premise) from (select premise, c12 from s where g = 47 and c12 > 0 order by c12 desc, premise limit 12) t), '[]'::jsonb),
      'by_month', coalesce((select jsonb_agg(jsonb_build_array(m, v, p, o) order by m) from (select m, sum(c24) filter (where cat = 'v') as v, sum(c24) filter (where cat = 'p') as p, sum(c24) filter (where cat = 'o') as o
          from s where g = 55 group by m having sum(c24) > 0) t), '[]'::jsonb),
      'by_hour', coalesce((select jsonb_agg(jsonb_build_array(h, v, p, o) order by h) from (select h, sum(c12) filter (where cat = 'v') as v, sum(c12) filter (where cat = 'p') as p, sum(c12) filter (where cat = 'o') as o
          from s where g = 59 and h is not null group by h having sum(c12) > 0) t), '[]'::jsonb),
      'by_dow', coalesce((select jsonb_agg(jsonb_build_array(d, v, p, o) order by d) from (select d, sum(c12) filter (where cat = 'v') as v, sum(c12) filter (where cat = 'p') as p, sum(c12) filter (where cat = 'o') as o
          from s where g = 61 group by d having sum(c12) > 0) t), '[]'::jsonb),
      'by_year', coalesce((select jsonb_agg(jsonb_build_array(y, v, p, o, d0, d1) order by y) from (select y, coalesce(sum(tot) filter (where cat = 'v'), 0) as v, coalesce(sum(tot) filter (where cat = 'p'), 0) as p,
          coalesce(sum(tot) filter (where cat = 'o'), 0) as o, min(d0) as d0, max(d1) as d1 from s where g = 62 group by y) t), '[]'::jsonb)
    )$q$, p_where) into out using p_geom, p_last;
  return out;
end $fn$;
revoke all on function public.crime_area_stats(text, geometry, date) from public, anon, authenticated;

-- Houston's numbers, once per data load (the nightly sync calls this after loading HPD's files)
create or replace function public.crime_city_refresh()
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare last date; rep jsonb; h geometry;
begin
  select max(day) into last from crime_incidents;
  if last is null then delete from crime_city_stats; return jsonb_build_object('latest', null); end if;
  rep := crime_area_stats('true', null, last);
  -- min/max only: collecting 1.5 million points into one shape ran the database out of memory (Oct 14)
  select st_makeenvelope(min(lon), min(lat), max(lon), max(lat), 4326) into h from crime_incidents;
  insert into crime_city_stats (id, latest, hull, report, updated_at) values (1, last, h, rep, now())
    on conflict (id) do update set latest = excluded.latest, hull = excluded.hull, report = excluded.report, updated_at = now();
  return jsonb_build_object('latest', last);
end $$;
revoke all on function public.crime_city_refresh() from public, anon, authenticated;
grant execute on function public.crime_city_refresh() to service_role;

-- the area report (same shape as before; api/crime.js shapeReport reads it)
create or replace function public.crime_report(p_geom jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare g geometry; last date; cs crime_city_stats; stats jsonb; city jsonb;
begin
  g := st_setsrid(st_geomfromgeojson(p_geom::text), 4326);
  select * into cs from crime_city_stats where id = 1;
  select max(day) into last from crime_incidents;
  if last is null then return jsonb_build_object('latest', null); end if;
  if cs.latest is distinct from last then cs := null; end if; -- not refreshed since the last load: work it out live
  if cs.report is not null and cs.hull is not null and st_covers(g, cs.hull) then stats := cs.report;
  else stats := crime_area_stats('st_intersects(c.pt::geometry, $1)', g, last); end if;
  city := coalesce(cs.report, crime_area_stats('true', null, last));
  return jsonb_build_object('latest', last, 'from', last - 729, 'area_sqmi', round((st_area(g::geography) / 2589988.11)::numeric, 3)) || stats || jsonb_build_object(
    'city_last12', (select jsonb_object_agg(substr(k, 8), v) from jsonb_each(city -> 'totals') t(k, v) where k like 'last12\_%'),
    'city_by_year', (select coalesce(jsonb_agg(jsonb_build_array(e -> 0, (e ->> 1)::bigint + (e ->> 2)::bigint + (e ->> 3)::bigint) order by (e ->> 0)::int), '[]'::jsonb) from jsonb_array_elements(city -> 'by_year') e));
end $$;
revoke all on function public.crime_report(jsonb) from public, anon, authenticated;
grant execute on function public.crime_report(jsonb) to service_role;

-- incidents stored in location order (the whole table; takes minutes on the project's database)
create or replace function public.crime_recluster()
returns void language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  cluster public.crime_incidents using crime_incidents_geom_idx;
  analyze public.crime_incidents;
end $$;
revoke all on function public.crime_recluster() from public, anon, authenticated;
grant execute on function public.crime_recluster() to service_role;

-- the first reorder (~4 minutes) and refresh (~15 s)
set statement_timeout = 0;
cluster public.crime_incidents using crime_incidents_geom_idx;
analyze public.crime_incidents;
select public.crime_city_refresh();

alter role service_role set statement_timeout = '40s';
notify pgrst, 'reload config';
