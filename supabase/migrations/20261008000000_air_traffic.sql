-- Low-flight history for the map (api/planes-sample.js every 5 minutes via Vercel Cron; read by api/planes.js).
-- Each sample counts the aircraft flying below 3,000 ft in ~1 km cells (0.01°, south-west corner); air_days counts the
-- samples taken per day so a missed run doesn't read as quiet skies. Server (secret key) only: RLS on, no policies.

create table if not exists public.air_cells (
  day date not null,
  lon numeric(6,2) not null,
  lat numeric(5,2) not null,
  n integer not null default 0,
  min_alt integer,
  primary key (day, lon, lat)
);
create index if not exists air_cells_lonlat on public.air_cells (lon, lat, day);
alter table public.air_cells enable row level security;

create table if not exists public.air_days (
  day date primary key,
  samples integer not null default 0
);
alter table public.air_days enable row level security;

-- one sample: rows = [{ lon, lat, n, min_alt }]
create or replace function public.add_air_samples(p_day date, p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into air_days (day, samples) values (p_day, 1)
    on conflict (day) do update set samples = air_days.samples + 1;
  insert into air_cells (day, lon, lat, n, min_alt)
    select p_day, (r->>'lon')::numeric, (r->>'lat')::numeric, (r->>'n')::int, (r->>'min_alt')::int
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    on conflict (day, lon, lat) do update set n = air_cells.n + excluded.n, min_alt = least(air_cells.min_alt, excluded.min_alt);
  delete from air_cells where day < p_day - 400;
  delete from air_days where day < p_day - 400;
end $$;

-- low sightings per cell in a box since a day, plus how many samples ran in that period
create or replace function public.air_density(w numeric, s numeric, e numeric, n numeric, since date)
returns table (lon numeric, lat numeric, sightings bigint, min_alt integer, samples bigint)
language sql stable security definer set search_path = public as $$
  select c.lon, c.lat, sum(c.n)::bigint, min(c.min_alt), (select coalesce(sum(samples), 0) from air_days where day >= since)::bigint
  from air_cells c
  where c.lon between w and e and c.lat between s and n and c.day >= since
  group by c.lon, c.lat
$$;

revoke all on function public.add_air_samples(date, jsonb) from public, anon, authenticated;
revoke all on function public.air_density(numeric, numeric, numeric, numeric, date) from public, anon, authenticated;
