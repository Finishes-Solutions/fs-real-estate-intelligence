-- Businesses and places for the seven counties: Overture Maps Places and Foursquare Open Source Places, merged
-- (build/places.mjs, "Places" workflow, monthly). Read by api/places.js with the secret key. RLS on, no policies.
--   places_in_box(w, s, e, n, groups, limit)  the map layer: [id, name, group, lon, lat] as one jsonb array
--   places_near(lon, lat, m, n)               the building card: places within m meters, nearest first
--   places_search(q, lon, lat, n)             map search by name (q already normalized: lower case, no punctuation)
--   place_get(id)                              one place
--   places_counts(w, s, e, n)                 places per group in a box (area reports, the assistant)
--   places_prune(load, min_keep)              after a load: drop rows the load didn't touch
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.places (
  id text primary key,
  name text not null,
  name_norm text not null,
  grp text not null,
  cat text,
  brand text,
  addr text,
  city text,
  zip text,
  phone text,
  web text,
  lon double precision not null,
  lat double precision not null,
  src text[] not null default '{}',
  conf real,
  county text,
  load_id text not null,
  geom geometry(Point, 4326) generated always as (ST_SetSRID(ST_MakePoint(lon, lat), 4326)) stored
);
create index if not exists places_geom on public.places using gist (geom);
create index if not exists places_name_trgm on public.places using gin (name_norm extensions.gin_trgm_ops);
create index if not exists places_load on public.places (load_id);
alter table public.places enable row level security;

create table if not exists public.places_loads (
  load_id text primary key,
  at timestamptz not null default now(),
  overture_release text,
  foursquare_release text,
  rows integer,
  by_group jsonb,
  by_source jsonb
);
alter table public.places_loads enable row level security;

create or replace function public.places_in_box(w double precision, s double precision, e double precision, n double precision, p_groups text[] default null, p_limit integer default 5000)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_array(id, name, grp, round(lon::numeric, 6), round(lat::numeric, 6))), '[]'::jsonb)
  from (select id, name, grp, lon, lat from places p
    where p.geom && ST_MakeEnvelope(w, s, e, n, 4326) and (p_groups is null or p.grp = any(p_groups))
    order by (p.brand is not null) desc, coalesce(p.conf, 0.8) desc, array_length(p.src, 1) desc
    limit least(greatest(p_limit, 1), 8000)) t
$$;

create or replace function public.places_near(p_lon double precision, p_lat double precision, p_m double precision default 150, p_n integer default 60)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.m), '[]'::jsonb) from (
    select id, name, grp, cat, brand, addr, city, zip, phone, web, lon, lat, src,
      round(ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326))::numeric, 1) as m
    from places
    where geom && ST_Expand(ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326), p_m / 111000.0 / greatest(cos(radians(p_lat)), 0.2))
      and ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)) <= p_m
    order by geom <-> ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)
    limit least(greatest(p_n, 1), 200)) t
$$;

create or replace function public.places_search(p_q text, p_lon double precision default null, p_lat double precision default null, p_n integer default 8)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.rank, t.km nulls last), '[]'::jsonb) from (
    select id, name, grp, cat, brand, addr, city, zip, lon, lat,
      case when name_norm = p_q then 0 when name_norm like p_q || '%' then 1 else 2 end as rank,
      case when p_lon is null then null else round((ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)) / 1000)::numeric, 2) end as km
    from places
    where length(p_q) >= 2 and name_norm like '%' || p_q || '%'
    order by case when name_norm = p_q then 0 when name_norm like p_q || '%' then 1 else 2 end,
      case when p_lon is null then 0::double precision else geom <-> ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326) end
    limit least(greatest(p_n, 1), 40)) t
$$;

create or replace function public.place_get(p_id text)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select to_jsonb(t) from (select id, name, grp, cat, brand, addr, city, zip, phone, web, lon, lat, src, conf, county from places where id = p_id) t
$$;

create or replace function public.places_counts(w double precision, s double precision, e double precision, n double precision)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_object_agg(grp, c), '{}'::jsonb) from (
    select grp, count(*) c from places where geom && ST_MakeEnvelope(w, s, e, n, 4326) group by grp) t
$$;

-- refuses to shrink the table by more than half unless min_keep is 0 (a broken download shouldn't wipe the layer):
-- then nothing is deleted and the result says refused
create or replace function public.places_prune(p_load text, p_min_keep real default 0.5)
returns jsonb language sql security definer set search_path = public as $$
  with c as (select count(*) as total, count(*) filter (where load_id = p_load) as fresh from places),
  ok as (select (total = 0 or fresh >= total * p_min_keep) as go, total, fresh from c),
  d as (delete from places where load_id <> p_load and (select go from ok) returning 1)
  select jsonb_build_object('kept', (select fresh from ok), 'removed', (select count(*) from d), 'refused', not (select go from ok), 'total', (select total from ok))
$$;

do $$ declare f text; begin
  foreach f in array array['places_in_box(double precision,double precision,double precision,double precision,text[],integer)',
    'places_near(double precision,double precision,double precision,integer)', 'places_search(text,double precision,double precision,integer)',
    'place_get(text)', 'places_counts(double precision,double precision,double precision,double precision)', 'places_prune(text,real)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || f || ' to service_role';
  end loop;
end $$;
