-- Air Traffic Report for any size of area (Oct 14): the 2,000 square mile check is gone. air_profile holds a few thousand
-- ~5 km cells, so even a whole county reads in a moment. Otherwise the same as 20261013000000_air_profile.sql.
create or replace function public.air_profile_report(p_geom jsonb, p_months integer default 3)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare g geometry; since date; out jsonb;
begin
  g := st_setsrid(st_geomfromgeojson(p_geom::text), 4326);
  since := (date_trunc('month', current_date) - make_interval(months => greatest(1, least(p_months, 13)) - 1))::date;
  with c as materialized (
    select * from air_profile p where p.month >= since and p.lon between st_xmin(g) - 0.05 and st_xmax(g) and p.lat between st_ymin(g) - 0.05 and st_ymax(g)
      and st_intersects(st_makeenvelope(p.lon::float8, p.lat::float8, p.lon::float8 + 0.05, p.lat::float8 + 0.05, 4326), g)
  )
  select jsonb_build_object(
    'since', since,
    'cells', (select count(distinct (lon, lat)) from c),
    'months', (select coalesce(jsonb_agg(m order by m), '[]'::jsonb) from (select distinct month as m from c) t),
    'totals', (select jsonb_build_object('n', coalesce(sum(n), 0), 'low', coalesce(sum(low), 0), 'heli', coalesce(sum(heli), 0), 'jet', coalesce(sum(jet), 0), 'prop', coalesce(sum(prop), 0), 'mil', coalesce(sum(mil), 0), 'min_alt', min(min_alt)) from c),
    'hours', (select coalesce(jsonb_agg(s order by i), '[]'::jsonb) from (select i, coalesce(sum(c.hours[i]), 0) as s from generate_series(1, 24) i left join c on true group by i) t),
    'samples_by_hour', (select coalesce(jsonb_agg(s order by h), '[]'::jsonb) from (select h, coalesce(sum(x.samples), 0) as s from generate_series(0, 23) h left join air_profile_samples x on x.hour = h and x.month >= since group by h) t),
    'by_month', (select coalesce(jsonb_agg(jsonb_build_array(m, n, low) order by m), '[]'::jsonb) from (select month as m, sum(n) as n, sum(low) as low from c group by month) t)
  ) into out;
  return out;
end $$;
revoke all on function public.air_profile_report(jsonb, integer) from public, anon, authenticated;
grant execute on function public.air_profile_report(jsonb, integer) to service_role;
