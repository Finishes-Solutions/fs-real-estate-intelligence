-- Crime map layer, area reports and the assistant's crime tool (Houston Police NIBRS incidents in public.crime_incidents).
--   crime_grid(cell)            incidents in the last 12 months summed onto a lon/lat grid (the map layer; ~400 m cells by default)
--   crime_report(geojson)       one area's numbers: totals by category for the last 12 months and the 12 before, top offenses,
--                               top premises, monthly counts, the area in square miles, and citywide totals for comparison
--   crime_list(geojson, limit)  the incidents themselves in an area, newest first (report table and CSV export)
--   crime_grid_json / crime_list_json: the same as single jsonb values (the API uses these; PostgREST caps row results at 1,000)
-- "Last 12 months" ends at the newest incident in the data (HPD's file runs ~3 months behind), not today.
create index if not exists crime_incidents_geom_idx on public.crime_incidents using gist ((pt::extensions.geometry));

create or replace function public.crime_grid(p_cell double precision default 0.004)
returns table (x double precision, y double precision, v bigint, p bigint, o bigint)
language sql stable security definer set search_path = public, extensions as $$
  with lim as (select max(day) as last from crime_incidents), c as (select least(greatest(p_cell, 0.001), 0.05) as s)
  select round((i.lon / c.s)::numeric)::double precision * c.s, round((i.lat / c.s)::numeric)::double precision * c.s,
    coalesce(sum(i.n) filter (where i.cat = 'v'), 0), coalesce(sum(i.n) filter (where i.cat = 'p'), 0), coalesce(sum(i.n) filter (where i.cat = 'o'), 0)
  from crime_incidents i, lim, c where i.day > lim.last - 365
  group by 1, 2
$$;

create or replace function public.crime_report(p_geom jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare g geometry; last date; out jsonb;
begin
  g := st_setsrid(st_geomfromgeojson(p_geom::text), 4326);
  if st_area(g::geography) > 2589988.11 * 1500 then raise exception 'area too large (over 1,500 square miles)'; end if;
  select max(day) into last from crime_incidents;
  if last is null then return jsonb_build_object('latest', null); end if;
  with hits as materialized (
    select day, code, cat, n, premise from crime_incidents c
    where st_intersects(c.pt::geometry, g) and c.day > last - 730
  ), cur as (select * from hits where day > last - 365)
  select jsonb_build_object(
    'latest', last,
    'from', last - 729,
    'area_sqmi', round((st_area(g::geography) / 2589988.11)::numeric, 3),
    'totals', coalesce((select jsonb_object_agg(k, s) from (select (case when day > last - 365 then 'last12_' else 'prior12_' end) || cat as k, sum(n) as s from hits group by 1) t), '{}'::jsonb),
    'by_code', coalesce((select jsonb_agg(jsonb_build_array(code, s, cat) order by s desc) from (select code, cat, sum(n) as s from cur group by code, cat order by 3 desc limit 25) t), '[]'::jsonb),
    'by_premise', coalesce((select jsonb_agg(jsonb_build_array(premise, s) order by s desc) from (select coalesce(premise, 'Unknown') as premise, sum(n) as s from cur group by 1 order by 2 desc limit 12) t), '[]'::jsonb),
    'by_month', coalesce((select jsonb_agg(jsonb_build_array(m, v, p, o) order by m) from (select to_char(date_trunc('month', day), 'YYYY-MM') as m,
        coalesce(sum(n) filter (where cat = 'v'), 0) as v, coalesce(sum(n) filter (where cat = 'p'), 0) as p, coalesce(sum(n) filter (where cat = 'o'), 0) as o from hits group by 1) t), '[]'::jsonb),
    'city_last12', (select jsonb_object_agg(cat, s) from (select cat, sum(n) as s from crime_incidents where day > last - 365 group by cat) t)
  ) into out;
  return out;
end $$;

create or replace function public.crime_list(p_geom jsonb, p_limit integer default 2000)
returns table (day date, code text, cat text, n smallint, premise text, lon double precision, lat double precision)
language sql stable security definer set search_path = public, extensions as $$
  with g as (select st_setsrid(st_geomfromgeojson(p_geom::text), 4326) as g), lim as (select max(day) as last from crime_incidents)
  select c.day, c.code, c.cat::text, c.n, c.premise, c.lon, c.lat from crime_incidents c, g, lim
  where st_intersects(c.pt::geometry, g.g) and c.day > lim.last - 365
  order by c.day desc, c.id limit least(greatest(p_limit, 1), 20000)
$$;

revoke all on function public.crime_grid(double precision) from public, anon, authenticated;
revoke all on function public.crime_report(jsonb) from public, anon, authenticated;
revoke all on function public.crime_list(jsonb, integer) from public, anon, authenticated;
grant execute on function public.crime_grid(double precision) to service_role;
grant execute on function public.crime_report(jsonb) to service_role;
grant execute on function public.crime_list(jsonb, integer) to service_role;

-- PostgREST caps a table result at 1,000 rows, so the grid (~7,500 cells) and long incident lists come back as one jsonb value
create or replace function public.crime_grid_json(p_cell double precision default 0.004)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_array(round(x::numeric, 4), round(y::numeric, 4), v, p, o)), '[]'::jsonb) from public.crime_grid(p_cell) where v + p + o > 0
$$;
create or replace function public.crime_list_json(p_geom jsonb, p_limit integer default 2000)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'code', code, 'cat', cat, 'n', n, 'premise', premise, 'lon', lon, 'lat', lat)), '[]'::jsonb) from public.crime_list(p_geom, p_limit)
$$;
revoke all on function public.crime_grid_json(double precision) from public, anon, authenticated;
revoke all on function public.crime_list_json(jsonb, integer) from public, anon, authenticated;
grant execute on function public.crime_grid_json(double precision) to service_role;
grant execute on function public.crime_list_json(jsonb, integer) to service_role;
