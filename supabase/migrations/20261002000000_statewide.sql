-- Statewide store for TDLR TABS filings, the pipeline caches and the change history.
-- Written by the GitHub Actions pipeline with the service-role key; the public site only reads filings, counties and changes.
create extension if not exists postgis with schema extensions;

create table public.counties (
  fips text primary key,
  name text not null,
  tabs_id text not null,
  label double precision[],             -- [lon, lat] label point
  outline jsonb,                        -- GeoJSON MultiPolygon (simplified)
  -- backfill bookkeeping
  status text not null default 'todo',  -- todo | running | done | error
  priority int not null default 1000,
  filings int,
  mapped int,
  period_start date,
  period_end date,
  updated_at timestamptz,
  error text
);

create table public.filings (
  id text primary key,                  -- TABS project number
  name text,
  county text,
  fips text references public.counties(fips),
  city text,
  zip text,
  addr text,
  type text,                            -- New | Reno | Addition | Other
  cost bigint,
  sqft int,
  owner text,
  scope text,
  reg date,                             -- registration date
  status text,
  est_start date,                       -- as filed
  est_end date,
  ts date,                              -- timeline start/end used by charts (filed or inferred)
  te date,
  ts_est boolean,                       -- true = inferred, not filed
  te_est boolean,
  lat double precision,
  lon double precision,
  geom extensions.geometry(Point, 4326) generated always as (
    case when lon is not null and lat is not null then extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326) end) stored,
  approx boolean not null default false,   -- placed at the town center, not the address
  misfiled boolean not null default false, -- address is well outside the county it was filed under
  geo_src text,                         -- parcel | census | osm | maptiler | city (how the point was found)
  -- AI enrichment
  use text,
  subtype text,
  tenant text,
  developer text,
  architect text,
  gc text,
  units int,
  summary text,
  -- raw TABS detail fields
  design_firm text,
  tabs_tenant text,
  facility text,
  first_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index filings_geom_idx on public.filings using gist (geom);
create index filings_fips_reg_idx on public.filings (fips, reg);
create index filings_reg_idx on public.filings (reg);
create index filings_ts_te_idx on public.filings (ts, te);
create index filings_use_idx on public.filings (use);
create index filings_developer_idx on public.filings (lower(developer));
create index filings_cost_idx on public.filings (cost desc);

create table public.changes (
  id bigserial primary key,
  run_at timestamptz not null,
  filing_id text not null,
  kind text not null,                   -- new | status | cost | start | end | sqft | gone
  label text,
  from_v text,
  to_v text
);
create index changes_run_at_idx on public.changes (run_at desc);
create index changes_filing_idx on public.changes (filing_id);

-- Pipeline caches (key -> JSON). Keys: TABS number (tabs), sha1 of the normalized address (geocode), number:input-hash (ai).
create table public.tabs_cache (k text primary key, data jsonb not null, at date not null default current_date);
create table public.geocode_cache (k text primary key, data jsonb not null, at date not null default current_date);
create table public.ai_cache (k text primary key, data jsonb not null, at date not null default current_date);

create table public.runs (
  id bigserial primary key,
  kind text not null,                   -- backfill | recent
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  counties int,
  filings int,
  tokens_in bigint,
  tokens_out bigint,
  notes text
);

-- Batch cache lookup for the pipeline: returns { key: data } for the keys that exist.
create or replace function public.cache_get(tbl text, keys text[])
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare out jsonb;
begin
  if tbl not in ('tabs_cache', 'geocode_cache', 'ai_cache') then raise exception 'unknown cache %', tbl; end if;
  execute format('select coalesce(jsonb_object_agg(k, data), ''{}''::jsonb) from public.%I where k = any($1)', tbl) into out using keys;
  return out;
end $$;
revoke execute on function public.cache_get(text, text[]) from public, anon, authenticated;
grant execute on function public.cache_get(text, text[]) to service_role;

-- Row level security: public read of filings, counties and changes; everything else service-role only.
alter table public.counties enable row level security;
alter table public.filings enable row level security;
alter table public.changes enable row level security;
alter table public.tabs_cache enable row level security;
alter table public.geocode_cache enable row level security;
alter table public.ai_cache enable row level security;
alter table public.runs enable row level security;
create policy "public read" on public.counties for select to anon, authenticated using (true);
create policy "public read" on public.filings for select to anon, authenticated using (true);
create policy "public read" on public.changes for select to anon, authenticated using (true);
