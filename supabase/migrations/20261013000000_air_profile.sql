-- Air traffic by hour of day and aircraft type, for the Air Traffic Report (api/planes.js ?report). The per-minute sampler
-- (api/planes-sample.js) adds every airborne aircraft it sees within ~100 nm of Houston to a ~5 km cell (0.05°, south-west
-- corner) for the month: sightings by hour of day (Central time), how many were low (under 3,000 ft), and the mix
-- (helicopters, jets, props, military). air_profile_samples counts the samples per month and hour so averages are fair.
-- About 4,000 cells a month; months older than 13 are dropped. Server (secret key) only: RLS on, no policies.
create table if not exists public.air_profile (
  month date not null,
  lon numeric(6,2) not null,
  lat numeric(5,2) not null,
  hours integer[] not null,
  n integer not null default 0,
  low integer not null default 0,
  heli integer not null default 0,
  jet integer not null default 0,
  prop integer not null default 0,
  mil integer not null default 0,
  min_alt integer,
  primary key (month, lon, lat)
);
alter table public.air_profile enable row level security;
create table if not exists public.air_profile_samples (
  month date not null,
  hour smallint not null,
  samples integer not null default 0,
  primary key (month, hour)
);
alter table public.air_profile_samples enable row level security;

-- one sample (one minute, so one hour of the day): rows = [{ lon, lat, n, low, heli, jet, prop, mil, min_alt }]
create or replace function public.add_air_profile(p_month date, p_hour integer, p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into air_profile_samples (month, hour, samples) values (p_month, p_hour, 1)
    on conflict (month, hour) do update set samples = air_profile_samples.samples + 1;
  insert into air_profile (month, lon, lat, hours, n, low, heli, jet, prop, mil, min_alt)
    select p_month, (r->>'lon')::numeric, (r->>'lat')::numeric,
      (select array_agg(case when i = p_hour then (r->>'n')::int else 0 end order by i) from generate_series(0, 23) i),
      (r->>'n')::int, coalesce((r->>'low')::int, 0), coalesce((r->>'heli')::int, 0), coalesce((r->>'jet')::int, 0), coalesce((r->>'prop')::int, 0), coalesce((r->>'mil')::int, 0), (r->>'min_alt')::int
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    on conflict (month, lon, lat) do update set
      hours[p_hour + 1] = air_profile.hours[p_hour + 1] + excluded.n,
      n = air_profile.n + excluded.n, low = air_profile.low + excluded.low, heli = air_profile.heli + excluded.heli, jet = air_profile.jet + excluded.jet,
      prop = air_profile.prop + excluded.prop, mil = air_profile.mil + excluded.mil, min_alt = least(air_profile.min_alt, excluded.min_alt);
  if random() < 0.002 then delete from air_profile where month < (date_trunc('month', p_month) - interval '13 months')::date; end if;
end $$;

-- one area: sightings by hour, the mix and the samples behind them, for the cells touching the area over the last p_months
create or replace function public.air_profile_report(p_geom jsonb, p_months integer default 3)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare g geometry; since date; out jsonb;
begin
  g := st_setsrid(st_geomfromgeojson(p_geom::text), 4326);
  if st_area(g::geography) > 2589988.11 * 2000 then raise exception 'area too large (over 2,000 square miles)'; end if;
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

revoke all on function public.add_air_profile(date, integer, jsonb) from public, anon, authenticated;
revoke all on function public.air_profile_report(jsonb, integer) from public, anon, authenticated;
grant execute on function public.add_air_profile(date, integer, jsonb) to service_role;
grant execute on function public.air_profile_report(jsonb, integer) to service_role;
