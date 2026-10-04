-- Airports worldwide (OurAirports, public domain), loaded nightly by build/live-sync.mjs (step "airports"), with US extras:
-- the FAA airport diagram (d-TPP, every 28 days) and takeoffs / landings per day counted from our own ADS-B sampling
-- (api/planes-sample.js). Read by api/airports.js. Server (secret key) only: RLS on, no policies.
--   airports_in_box(w, s, e, n, types)  the map layer: [ident, name, type, lon, lat, code] as one jsonb array
--   airports_near(lon, lat, km, n)      nearest airports (open ones, biggest first within the same distance)
--   airport_detail(ident)               one airport: the row, runways, frequencies, extras and the last 60 days of counts
--   airport_ops_add(day, rows)          the sampler adds takeoffs and landings it saw
create table if not exists public.airports (
  ident text primary key,
  type text not null,
  name text not null,
  lat double precision not null,
  lon double precision not null,
  elevation_ft integer,
  continent text,
  iso_country text,
  iso_region text,
  municipality text,
  scheduled boolean not null default false,
  icao text,
  iata text,
  gps_code text,
  local_code text,
  home_link text,
  wikipedia_link text,
  keywords text,
  h text not null,
  synced_at timestamptz not null default now(),
  pt extensions.geography(Point, 4326) generated always as (extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography) stored
);
create index if not exists airports_pt_idx on public.airports using gist (pt);
create index if not exists airports_region_idx on public.airports (iso_region);
create index if not exists airports_iata_idx on public.airports (iata) where iata is not null;
create index if not exists airports_icao_idx on public.airports (icao) where icao is not null;
alter table public.airports enable row level security;

create table if not exists public.airport_runways (
  id bigint primary key,
  airport_ident text not null,
  length_ft integer,
  width_ft integer,
  surface text,
  lighted boolean,
  closed boolean,
  le_ident text, le_lat double precision, le_lon double precision, le_elevation_ft integer, le_heading double precision, le_displaced_ft integer,
  he_ident text, he_lat double precision, he_lon double precision, he_elevation_ft integer, he_heading double precision, he_displaced_ft integer,
  h text not null
);
create index if not exists airport_runways_ident_idx on public.airport_runways (airport_ident);
alter table public.airport_runways enable row level security;

create table if not exists public.airport_frequencies (
  id bigint primary key,
  airport_ident text not null,
  type text,
  description text,
  mhz double precision,
  h text not null
);
create index if not exists airport_frequencies_ident_idx on public.airport_frequencies (airport_ident);
alter table public.airport_frequencies enable row level security;

-- per-airport extras that don't come from OurAirports (FAA diagram PDF; more later)
create table if not exists public.airport_extras (
  ident text primary key,
  diagram_url text,
  diagram_cycle text,
  updated_at timestamptz not null default now()
);
alter table public.airport_extras enable row level security;

-- takeoffs and landings a day, by source ('adsb' = counted from our own sampling)
create table if not exists public.airport_ops_daily (
  ident text not null,
  day date not null,
  source text not null default 'adsb',
  departures integer not null default 0,
  arrivals integer not null default 0,
  primary key (ident, day, source)
);
alter table public.airport_ops_daily enable row level security;

-- the sampler remembers which aircraft it saw on the ground or low near an airport last minute, to count each takeoff or
-- landing once (hex -> airport, state); rows older than 30 minutes are dropped
create table if not exists public.airport_ops_state (
  hex text primary key,
  ident text not null,
  ground boolean not null,
  alt integer,
  seen timestamptz not null default now()
);
alter table public.airport_ops_state enable row level security;

create or replace function public.airports_remove(p_table text, p_ids text[])
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_table = 'airports' then delete from airports where ident = any(p_ids);
  elsif p_table = 'airport_runways' then delete from airport_runways where id::text = any(p_ids);
  elsif p_table = 'airport_frequencies' then delete from airport_frequencies where id::text = any(p_ids);
  else raise exception 'unknown table'; end if;
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.airports_in_box(w double precision, s double precision, e double precision, n double precision, p_types text[] default null)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_array(ident, name, type, round(lon::numeric, 5), round(lat::numeric, 5), coalesce(iata, icao, gps_code, local_code, ident), scheduled, elevation_ft)
    order by case type when 'large_airport' then 0 when 'medium_airport' then 1 when 'small_airport' then 2 else 3 end), '[]'::jsonb)
  from (select * from airports a where a.lon between airports_in_box.w and airports_in_box.e and a.lat between airports_in_box.s and airports_in_box.n
    and a.type <> 'closed' and (p_types is null or a.type = any(p_types))
    order by case a.type when 'large_airport' then 0 when 'medium_airport' then 1 when 'small_airport' then 2 else 3 end limit 6000) t
$$;

create or replace function public.airports_near(p_lon double precision, p_lat double precision, p_km double precision default 50, p_n integer default 8, p_types text[] default null)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.km), '[]'::jsonb) from (
    select a.ident, a.name, a.type, a.lon, a.lat, a.iata, a.icao, a.municipality, a.scheduled,
      round((st_distance(a.pt, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography) / 1000)::numeric, 2) as km
    from airports a
    where st_dwithin(a.pt, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, least(p_km, 500) * 1000) and a.type <> 'closed'
      and (p_types is null or a.type = any(p_types))
    order by a.pt <-> st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography limit least(greatest(p_n, 1), 50)) t
$$;

create or replace function public.airport_detail(p_ident text)
returns jsonb language sql stable security definer set search_path = public as $$
  with a as (select * from airports where ident = upper(p_ident) or (iata = upper(p_ident) and type <> 'closed') or (icao = upper(p_ident)) order by (ident = upper(p_ident)) desc, scheduled desc limit 1)
  select case when not exists (select 1 from a) then null else jsonb_build_object(
    'airport', (select to_jsonb(a) - 'pt' - 'h' from a),
    'runways', coalesce((select jsonb_agg(to_jsonb(r) - 'h' order by r.length_ft desc nulls last) from airport_runways r, a where r.airport_ident = a.ident), '[]'::jsonb),
    'frequencies', coalesce((select jsonb_agg(jsonb_build_object('type', f.type, 'description', f.description, 'mhz', f.mhz) order by f.type) from airport_frequencies f, a where f.airport_ident = a.ident), '[]'::jsonb),
    'extras', (select to_jsonb(x) from airport_extras x, a where x.ident = a.ident),
    'ops', coalesce((select jsonb_agg(jsonb_build_object('day', o.day, 'source', o.source, 'departures', o.departures, 'arrivals', o.arrivals) order by o.day)
      from airport_ops_daily o, a where o.ident = a.ident and o.day > current_date - 61), '[]'::jsonb)) end
$$;

-- rows: [{ ident, dep, arr }] for one day; also prunes counts older than 400 days and stale state
create or replace function public.airport_ops_add(p_day date, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into airport_ops_daily (ident, day, source, departures, arrivals)
  select r->>'ident', p_day, 'adsb', coalesce((r->>'dep')::int, 0), coalesce((r->>'arr')::int, 0) from jsonb_array_elements(p_rows) r
  on conflict (ident, day, source) do update set departures = airport_ops_daily.departures + excluded.departures, arrivals = airport_ops_daily.arrivals + excluded.arrivals;
  get diagnostics n = row_count;
  if random() < 0.01 then delete from airport_ops_daily where day < current_date - 400; end if;
  return n;
end $$;

-- the sampler's memory: returns the previous state of these aircraft, then stores the new one
create or replace function public.airport_ops_state_swap(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare prev jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('hex', s.hex, 'ident', s.ident, 'ground', s.ground, 'alt', s.alt)), '[]'::jsonb) into prev
  from airport_ops_state s where s.hex in (select r->>'hex' from jsonb_array_elements(p_rows) r) and s.seen > now() - interval '10 minutes';
  insert into airport_ops_state (hex, ident, ground, alt, seen)
  select r->>'hex', r->>'ident', (r->>'ground')::boolean, (r->>'alt')::int, now() from jsonb_array_elements(p_rows) r
  on conflict (hex) do update set ident = excluded.ident, ground = excluded.ground, alt = excluded.alt, seen = excluded.seen;
  if random() < 0.05 then delete from airport_ops_state where seen < now() - interval '30 minutes'; end if;
  return prev;
end $$;

do $$ declare f text; begin
  foreach f in array array['airports_remove(text,text[])', 'airports_in_box(double precision,double precision,double precision,double precision,text[])',
    'airports_near(double precision,double precision,double precision,integer,text[])', 'airport_detail(text)', 'airport_ops_add(date,jsonb)', 'airport_ops_state_swap(jsonb)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || f || ' to service_role';
  end loop;
end $$;
