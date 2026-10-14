-- Development activity for the seven counties, loaded nightly by build/county-data.mjs ("County data" workflow) and
-- read by api/devdata.js with the secret key. RLS on, no policies. One table holds every kind, one row per thing:
--   kind 'permit'    Harris County building permits from the Harris Central Appraisal District's weekly files
--   kind 'plat'      City of Houston plat applications (city and its ETJ), and recorded subdivisions from the
--                    Fort Bend, Montgomery, Waller, Austin, Washington and Grimes county / appraisal district maps
--   kind 'txdot'     TxDOT projects (Project Tracker), planned, under way and recently finished
--   kind 'district'  water districts (MUDs, WCIDs, ...) from TCEQ, with their creation date and bond issues
--   kind 'school'    public school campuses with enrollment (TEA)
-- day is the date that matters for the kind (permit issued, plat submitted or recorded, TxDOT letting, district
-- created); first_seen is the night this table first saw the row, so "new" works even where a source has no date.
--   dev_in_box(kinds, w, s, e, n, since, limit)  the map layers: one jsonb array per row, shapes simplified
--   dev_near(kinds, lon, lat, m, n)               the building card and the assistant: rows within m meters
--   dev_get(id)                                   one row, full
--   dev_counts(w, s, e, n, since)                 rows per kind and category in a box (the assistant, reports)
--   dev_hashes(source, after, n)                  the loader's change check: id -> hash, keyset paged
--   dev_prune(source, load, min_keep)             after a load: drop the source's rows the load didn't touch
--   county_meta()                                 the last load of every source (Data & help)
create table if not exists public.dev_items (
  id text primary key,
  kind text not null,
  source text not null,
  county text,
  name text not null,
  cat text,
  status text,
  day date,
  amount double precision,
  units integer,
  addr text,
  attrs jsonb not null default '{}',
  lon double precision,
  lat double precision,
  shape_json jsonb,
  h text,
  load_id text not null,
  first_seen date not null default current_date,
  geom geometry(Point, 4326) generated always as (case when lon is null then null else ST_SetSRID(ST_MakePoint(lon, lat), 4326) end) stored,
  -- the loader sends outlines and lines as GeoJSON (PostgREST has no geometry input of its own)
  shape geometry(Geometry, 4326) generated always as (case when shape_json is null then null else ST_SetSRID(ST_GeomFromGeoJSON(shape_json), 4326) end) stored
);
create index if not exists dev_items_geom on public.dev_items using gist (geom);
create index if not exists dev_items_shape on public.dev_items using gist (shape);
create index if not exists dev_items_kind_day on public.dev_items (kind, day desc);
create index if not exists dev_items_source on public.dev_items (source, id);
alter table public.dev_items enable row level security;

create table if not exists public.county_loads (
  source text primary key,
  at timestamptz not null default now(),
  load_id text,
  url text,
  etag text,
  modified text,
  rows integer,
  written integer,
  removed integer,
  status text,
  note text
);
alter table public.county_loads enable row level security;

-- one compact row for the map: [id, kind, name, cat, day, lon, lat, units, amount, shape-or-null]; polygons and lines are
-- simplified to about 5 m and only sent when p_shapes is on (the layers draw outlines from street zoom)
create or replace function public.dev_in_box(p_kinds text[], w double precision, s double precision, e double precision, n double precision,
  p_since date default null, p_limit integer default 4000, p_shapes boolean default false)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_array(id, kind, name, cat, day, round(lon::numeric, 6), round(lat::numeric, 6), units, amount,
    case when p_shapes and shape is not null then ST_AsGeoJSON(ST_SimplifyPreserveTopology(shape, 0.00005), 5)::jsonb end)), '[]'::jsonb)
  from (select * from dev_items d
    where d.kind = any(p_kinds) and (p_since is null or coalesce(d.day, d.first_seen) >= p_since)
      and ((d.geom is not null and d.geom && ST_MakeEnvelope(w, s, e, n, 4326)) or (d.shape is not null and d.shape && ST_MakeEnvelope(w, s, e, n, 4326)))
    order by d.day desc nulls last
    limit least(greatest(p_limit, 1), 8000)) t
$$;

create or replace function public.dev_near(p_kinds text[], p_lon double precision, p_lat double precision, p_m double precision default 200, p_n integer default 20)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  with p as (select ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326) as pt)
  select coalesce(jsonb_agg(to_jsonb(t) order by t.m, t.day desc nulls last), '[]'::jsonb) from (
    select id, kind, source, county, name, cat, status, day, amount, units, addr, lon, lat, first_seen,
      round(case when d.shape is not null then ST_DistanceSphere(ST_ClosestPoint(d.shape, p.pt), p.pt) else ST_DistanceSphere(d.geom, p.pt) end::numeric, 0) as m
    from dev_items d, p
    where d.kind = any(p_kinds)
      and (d.geom && ST_Expand(p.pt, p_m / 111000.0 / greatest(cos(radians(p_lat)), 0.2)) or d.shape && ST_Expand(p.pt, p_m / 111000.0 / greatest(cos(radians(p_lat)), 0.2)))
      and (case when d.shape is not null then ST_DistanceSphere(ST_ClosestPoint(d.shape, p.pt), p.pt) else ST_DistanceSphere(d.geom, p.pt) end) <= p_m
    order by 15, day desc nulls last
    limit least(greatest(p_n, 1), 200)) t
$$;

create or replace function public.dev_get(p_id text)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select to_jsonb(t) || jsonb_build_object('shape', case when t.sh is null then null else ST_AsGeoJSON(ST_SimplifyPreserveTopology(t.sh, 0.00002), 6)::jsonb end) - 'sh'
  from (select id, kind, source, county, name, cat, status, day, amount, units, addr, attrs, lon, lat, first_seen, shape as sh from dev_items where id = p_id) t
$$;

create or replace function public.dev_counts(w double precision, s double precision, e double precision, n double precision, p_since date default null)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_object_agg(kind, cats), '{}'::jsonb) from (
    select kind, jsonb_object_agg(coalesce(cat, 'other'), c) as cats from (
      select kind, cat, count(*) c from dev_items d
      where (p_since is null or coalesce(d.day, d.first_seen) >= p_since)
        and ((d.geom is not null and d.geom && ST_MakeEnvelope(w, s, e, n, 4326)) or (d.shape is not null and d.shape && ST_MakeEnvelope(w, s, e, n, 4326)))
      group by kind, cat) a group by kind) b
$$;

create or replace function public.dev_hashes(p_source text, p_after text default '', p_n integer default 50000)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(id, h), '{}'::jsonb) from (
    select id, h from dev_items where source = p_source and id > p_after order by id limit least(greatest(p_n, 1), 50000)) t
$$;

-- refuses to shrink a source by more than half unless min_keep is 0 (a broken download shouldn't wipe a layer): then
-- nothing is deleted and the result says refused
create or replace function public.dev_prune(p_source text, p_load text, p_min_keep real default 0.5)
returns jsonb language sql security definer set search_path = public as $$
  with c as (select count(*) as total, count(*) filter (where load_id = p_load) as fresh from dev_items where source = p_source),
  ok as (select (total = 0 or fresh >= total * p_min_keep) as go, total, fresh from c),
  d as (delete from dev_items where source = p_source and load_id <> p_load and (select go from ok) returning 1)
  select jsonb_build_object('kept', (select fresh from ok), 'removed', (select count(*) from d), 'refused', not (select go from ok), 'total', (select total from ok))
$$;

-- rows the loader saw unchanged keep their hash but take this load's id, so the prune keeps them
create or replace function public.dev_touch(p_source text, p_load text, p_ids text[])
returns integer language sql security definer set search_path = public as $$
  with u as (update dev_items set load_id = p_load where source = p_source and id = any(p_ids) returning 1) select count(*)::integer from u
$$;

create or replace function public.county_meta()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(source, to_jsonb(l) - 'source'), '{}'::jsonb) from county_loads l
$$;

do $$ declare f text; begin
  foreach f in array array['dev_in_box(text[],double precision,double precision,double precision,double precision,date,integer,boolean)',
    'dev_near(text[],double precision,double precision,double precision,integer)', 'dev_get(text)',
    'dev_counts(double precision,double precision,double precision,double precision,date)', 'dev_hashes(text,text,integer)',
    'dev_prune(text,text,real)', 'dev_touch(text,text,text[])', 'county_meta()'] loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || f || ' to service_role';
  end loop;
end $$;
