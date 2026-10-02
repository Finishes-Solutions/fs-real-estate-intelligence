-- Statewide store for TDLR TABS filings, the change history and the geocode cache.
-- Lean for the free tier: each filings row keeps its raw TDLR detail and the key of its AI tags, so the rows double
-- as the pipeline cache. Safe to run more than once.
-- Written by the GitHub Actions pipeline with the secret key; the public site only reads filings, counties and changes.
create extension if not exists postgis with schema extensions;

create table if not exists public.counties (
  fips text primary key,
  name text not null,
  tabs_id text not null,
  label double precision[],             -- [lon, lat] label point
  outline jsonb,                        -- GeoJSON MultiPolygon (simplified)
  status text not null default 'todo',  -- backfill: todo | running | done | error
  priority int not null default 1000,
  filings int,
  mapped int,
  period_start date,
  period_end date,
  updated_at timestamptz,
  error text
);

create table if not exists public.filings (
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
  scope text,                           -- first 1,500 characters
  reg date,                             -- registration date
  status text,
  est_start date,                       -- as filed
  est_end date,
  ts date,                              -- timeline start / end used by charts (filed or inferred)
  te date,
  ts_est boolean,
  te_est boolean,
  lat double precision,
  lon double precision,
  geom extensions.geometry(Point, 4326) generated always as (
    case when lon is not null and lat is not null then extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326) end) stored,
  approx boolean not null default false,   -- placed at the town center, not the address
  misfiled boolean not null default false, -- address is well outside the county it was filed under
  geo_src text,                         -- parcel | census | osm | maptiler | city
  use text,                             -- AI tags
  subtype text,
  tenant text,
  developer text,
  architect text,
  gc text,
  units int,
  summary text,
  design_firm text,                     -- raw TABS detail fields
  tabs_tenant text,
  facility text,
  detail jsonb,                         -- raw TDLR detail page fields (pipeline cache)
  ai_key text,                          -- hash of the text the AI tags were made from (pipeline cache)
  first_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists filings_geom_idx on public.filings using gist (geom);
create index if not exists filings_fips_reg_idx on public.filings (fips, reg);
create index if not exists filings_reg_idx on public.filings (reg);
create index if not exists filings_ts_te_idx on public.filings (ts, te);
create index if not exists filings_use_idx on public.filings (use);
create index if not exists filings_cost_idx on public.filings (cost desc);

create table if not exists public.changes (
  id bigserial primary key,
  run_at timestamptz not null,
  filing_id text not null,
  kind text not null,                   -- new | status | cost | start | end | sqft | gone
  label text,
  from_v text,
  to_v text
);
create index if not exists changes_run_at_idx on public.changes (run_at desc);
create index if not exists changes_filing_idx on public.changes (filing_id);

-- geocodes by sha1 of the normalized address: { c: [lon, lat] | null, src, at, v }
create table if not exists public.geocode_cache (k text primary key, data jsonb not null, at date not null default current_date);

create table if not exists public.runs (
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

-- pipeline helpers (secret key only)
create or replace function public.cache_get(tbl text, keys text[])
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare out jsonb;
begin
  if tbl <> 'geocode_cache' then raise exception 'unknown cache %', tbl; end if;
  select coalesce(jsonb_object_agg(k, data), '{}'::jsonb) into out from public.geocode_cache where k = any(keys);
  return out;
end $$;
create or replace function public.db_size() returns bigint language sql stable security definer set search_path = public as $$
  select pg_database_size(current_database());
$$;
revoke execute on function public.cache_get(text, text[]) from public, anon, authenticated;
revoke execute on function public.db_size() from public, anon, authenticated;
grant execute on function public.cache_get(text, text[]) to service_role;
grant execute on function public.db_size() to service_role;

-- per-county totals for the statewide overview (public)
create or replace view public.county_stats with (security_invoker = true) as
  select fips, count(*)::int as filings, coalesce(sum(cost), 0)::bigint as value,
         count(*) filter (where reg >= current_date - 365)::int as filings_12m,
         coalesce(sum(cost) filter (where reg >= current_date - 365), 0)::bigint as value_12m,
         max(reg) as latest
  from public.filings group by fips;

-- row level security: public read of filings, counties, changes; everything else secret-key only
alter table public.counties enable row level security;
alter table public.filings enable row level security;
alter table public.changes enable row level security;
alter table public.geocode_cache enable row level security;
alter table public.runs enable row level security;
drop policy if exists "public read" on public.counties;
drop policy if exists "public read" on public.filings;
drop policy if exists "public read" on public.changes;
create policy "public read" on public.counties for select to anon, authenticated using (true);
create policy "public read" on public.filings for select to anon, authenticated using (true);
create policy "public read" on public.changes for select to anon, authenticated using (true);
grant select on public.county_stats to anon, authenticated;
