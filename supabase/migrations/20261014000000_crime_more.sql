-- More crime statistics for the crime report (Houston Police NIBRS):
--   hour of day of each incident (HPD's "Occurrence Hour"; filled in by the nightly sync, which reloads older rows once)
--   crime_report(geojson) adds:
--     by_hour  [[hour, violent, property, other]] for the last 12 months (incidents with a known hour)
--     by_dow   [[0 = Sunday … 6, violent, property, other]] for the last 12 months
--     by_year  [[year, violent, property, other, first day, last day]] for every year kept (CRIME_YEARS in the sync)
--     city_by_year [[year, total]] citywide, to compare an area's trend with Houston's
alter table public.crime_incidents add column if not exists hour smallint;

create or replace function public.crime_report(p_geom jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare g geometry; last date; out jsonb;
begin
  g := st_setsrid(st_geomfromgeojson(p_geom::text), 4326);
  if st_area(g::geography) > 2589988.11 * 1500 then raise exception 'area too large (over 1,500 square miles)'; end if;
  select max(day) into last from crime_incidents;
  if last is null then return jsonb_build_object('latest', null); end if;
  with every as materialized (
    select day, hour, code, cat, n, premise from crime_incidents c where st_intersects(c.pt::geometry, g)
  ), hits as (select * from every where day > last - 730),
  cur as (select * from hits where day > last - 365)
  select jsonb_build_object(
    'latest', last,
    'from', last - 729,
    'area_sqmi', round((st_area(g::geography) / 2589988.11)::numeric, 3),
    'totals', coalesce((select jsonb_object_agg(k, s) from (select (case when day > last - 365 then 'last12_' else 'prior12_' end) || cat as k, sum(n) as s from hits group by 1) t), '{}'::jsonb),
    'by_code', coalesce((select jsonb_agg(jsonb_build_array(code, s, cat) order by s desc) from (select code, cat, sum(n) as s from cur group by code, cat order by 3 desc limit 25) t), '[]'::jsonb),
    'by_premise', coalesce((select jsonb_agg(jsonb_build_array(premise, s) order by s desc) from (select coalesce(premise, 'Unknown') as premise, sum(n) as s from cur group by 1 order by 2 desc limit 12) t), '[]'::jsonb),
    'by_month', coalesce((select jsonb_agg(jsonb_build_array(m, v, p, o) order by m) from (select to_char(date_trunc('month', day), 'YYYY-MM') as m,
        coalesce(sum(n) filter (where cat = 'v'), 0) as v, coalesce(sum(n) filter (where cat = 'p'), 0) as p, coalesce(sum(n) filter (where cat = 'o'), 0) as o from hits group by 1) t), '[]'::jsonb),
    'by_hour', coalesce((select jsonb_agg(jsonb_build_array(h, v, p, o) order by h) from (select hour as h,
        coalesce(sum(n) filter (where cat = 'v'), 0) as v, coalesce(sum(n) filter (where cat = 'p'), 0) as p, coalesce(sum(n) filter (where cat = 'o'), 0) as o from cur where hour is not null group by 1) t), '[]'::jsonb),
    'by_dow', coalesce((select jsonb_agg(jsonb_build_array(d, v, p, o) order by d) from (select extract(dow from day)::int as d,
        coalesce(sum(n) filter (where cat = 'v'), 0) as v, coalesce(sum(n) filter (where cat = 'p'), 0) as p, coalesce(sum(n) filter (where cat = 'o'), 0) as o from cur group by 1) t), '[]'::jsonb),
    'by_year', coalesce((select jsonb_agg(jsonb_build_array(y, v, p, o, d0, d1) order by y) from (select extract(year from day)::int as y,
        coalesce(sum(n) filter (where cat = 'v'), 0) as v, coalesce(sum(n) filter (where cat = 'p'), 0) as p, coalesce(sum(n) filter (where cat = 'o'), 0) as o, min(day) as d0, max(day) as d1 from every group by 1) t), '[]'::jsonb),
    'city_last12', (select jsonb_object_agg(cat, s) from (select cat, sum(n) as s from crime_incidents where day > last - 365 group by cat) t),
    'city_by_year', (select coalesce(jsonb_agg(jsonb_build_array(y, s) order by y), '[]'::jsonb) from (select extract(year from day)::int as y, sum(n) as s from crime_incidents group by 1) t)
  ) into out;
  return out;
end $$;
revoke all on function public.crime_report(jsonb) from public, anon, authenticated;
grant execute on function public.crime_report(jsonb) to service_role;
