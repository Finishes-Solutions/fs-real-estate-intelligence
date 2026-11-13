-- Appraisal rolls and tax rates for the seven home counties, loaded by build/cad-rolls.mjs ("CAD rolls" workflow) and read
-- by the MCP tools tax_estimate, assessment_history and assessment_comps (lib/mcp/tax.mjs) with the secret key. RLS on,
-- no policies. Sources and what each one carries: docs/data-sources/cad-and-tax-rates.md.
--
-- History is kept by tax year: a load only ever writes rows for the tax year its file is for, so an earlier year is never
-- touched again. Within a year a later roll (preliminary → certified → supplement) replaces the earlier one, and the row
-- says which roll it came from (roll, source_run_id). Every row traces back to the raw file it was parsed from:
-- source_runs holds the file's URL, SHA-256 and Storage path (bucket cad-raw).
--
-- Additive only: new tables, functions and a new private bucket. Nothing existing is changed.

-- ---------- every file a load read ----------
create table if not exists public.source_runs (
  id bigserial primary key,
  source text not null,                 -- e.g. 'hcad', 'fbcad', 'wcad-pacs', 'gcad-roll', 'bis-layer', 'comptroller-rates'
  county text,                          -- null for statewide sources
  tax_year integer,
  roll text,                            -- 'preliminary' | 'certified' | 'supplement N' | 'current' (a parcel layer) | 'rates'
  url text,
  file_name text,
  sha256 text,
  bytes bigint,
  storage_path text,                    -- cad-raw/<path>, or null when the file was too big to keep (the note says so)
  rows_read integer,
  rows_written integer,
  rows_expected integer,                -- the district's own published count, when it has one
  value_sum double precision,           -- sum of market value read, to compare between runs
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running', -- 'running' | 'ok' | 'skipped' (same file as before) | 'failed' | 'warning'
  errors jsonb not null default '[]',
  note text
);
create index if not exists source_runs_source on public.source_runs (source, county, started_at desc);
create index if not exists source_runs_sha on public.source_runs (source, sha256);
alter table public.source_runs enable row level security;

-- ---------- taxing units: one row per unit as each source names it ----------
-- unit_code is the code the source uses: the Comptroller's unit ID ('237-104-03') for statewide rows (county = the
-- unit's home county), or the appraisal district's own code ('CWR', HCAD '040', Fort Bend 'G01'). comptroller_id links a
-- district's code to the Comptroller's unit, so rates by year can be found for it (match says how the link was made).
create table if not exists public.taxing_units (
  county text not null,
  unit_code text not null,
  name text not null,
  unit_type text,                       -- county | city | isd | college | hospital | mud | wcid | esd | drainage | road | other
  comptroller_id text,                  -- 'CCC-NNN-TT'
  match text,                           -- 'id' | 'name' | 'manual' | null (not linked yet)
  updated_at timestamptz not null default now(),
  primary key (county, unit_code)
);
create index if not exists taxing_units_cid on public.taxing_units (comptroller_id);
alter table public.taxing_units enable row level security;

-- ---------- tax rates by unit and year, one row per source ----------
-- unit_key: the Comptroller unit ID when known ('237-104-03'), else '<county>:<code>' for a district's own code.
-- Rates are per $100 of taxable value (0.4464 = $0.4464 per $100 = 0.4464%).
create table if not exists public.tax_rates (
  unit_key text not null,
  tax_year integer not null,
  source text not null,                 -- 'comptroller' | 'hcad' | 'wcad' | 'mctotx' | ...
  county text,
  name text,
  unit_type text,
  mo_rate double precision,
  is_rate double precision,
  total_rate double precision,
  nnr_rate double precision,            -- no-new-revenue
  var_rate double precision,            -- voter-approval
  proposed_rate double precision,
  adopted_on date,
  status text,                          -- 'adopted' | 'proposed' | 'not reported'
  source_run_id bigint references public.source_runs(id),
  updated_at timestamptz not null default now(),
  primary key (unit_key, tax_year, source)
);
create index if not exists tax_rates_year on public.tax_rates (tax_year, county);
alter table public.tax_rates enable row level security;

-- ---------- accounts: one row per account and tax year ----------
-- The improvement summary (year built, building sq ft, units, stories, class) is kept on the account so comparable
-- searches are one table; cad_improvements has the detail. lon/lat: the parcel's centre where the source has an outline.
create table if not exists public.cad_accounts (
  county text not null,
  account_id text not null,             -- the district's account number as its parcel layer uses it (HCAD 13 digits, prop_id …)
  tax_year integer not null,
  roll text not null,                   -- 'preliminary' | 'certified' | 'supplement N' | 'current'
  geo_id text,                          -- the district's map / property number
  owner text,
  mailing text,
  situs text,
  situs_city text,
  situs_zip text,
  legal text,
  state_class text,                     -- Comptroller property category (A1, B1, F1, D1 …)
  land_use text,                        -- the district's own use code where it has one
  acreage double precision,
  land_value double precision,
  improvement_value double precision,
  ag_value double precision,            -- productivity (ag / timber) use value
  market_value double precision,
  appraised_value double precision,
  exemptions text[] not null default '{}',
  year_built integer,
  bldg_sqft double precision,
  units integer,
  stories double precision,
  bldg_class text,
  neighborhood text,
  lon double precision,
  lat double precision,
  source_run_id bigint references public.source_runs(id),
  h text,                               -- hash of the row's values: a re-run of the same file writes nothing new
  updated_at timestamptz not null default now(),
  primary key (county, account_id, tax_year)
);
create index if not exists cad_accounts_comps on public.cad_accounts (county, tax_year, state_class);
create index if not exists cad_accounts_zip on public.cad_accounts (county, tax_year, situs_zip);
create index if not exists cad_accounts_geo on public.cad_accounts (county, geo_id);
create index if not exists cad_accounts_ll on public.cad_accounts (lat, lon) where lat is not null;
alter table public.cad_accounts enable row level security;

-- ---------- improvements (buildings and segments) ----------
create table if not exists public.cad_improvements (
  county text not null,
  account_id text not null,
  tax_year integer not null,
  imp_id text not null,                 -- building / improvement number within the account (+ segment where the source splits)
  imp_type text,                        -- the district's type code and description
  bldg_class text,                      -- class / quality
  year_built integer,
  eff_year integer,
  sqft double precision,
  units integer,
  stories double precision,
  value double precision,
  segments jsonb,                       -- the source's detail rows (type, area, year) when it has them
  source_run_id bigint references public.source_runs(id),
  primary key (county, account_id, tax_year, imp_id)
);
alter table public.cad_improvements enable row level security;

-- ---------- which units tax an account, by year ----------
-- One row per account and year: the unit codes (as taxing_units.unit_code for that county) and, where the roll gives
-- them, each unit's taxable value and exemption amounts (taxable: { "CWR": 19622330, ... }).
create table if not exists public.account_taxing_units (
  county text not null,
  account_id text not null,
  tax_year integer not null,
  unit_codes text[] not null,
  taxable jsonb not null default '{}',
  exemptions jsonb not null default '{}',
  partial boolean not null default false, -- true when the source lists only some units (a parcel layer's county / city / school)
  source_run_id bigint references public.source_runs(id),
  primary key (county, account_id, tax_year)
);
alter table public.account_taxing_units enable row level security;

-- ---------- reads for the MCP tools (one round trip each) ----------
-- everything tax_estimate needs for one account: its rows by year, its units by year, and those units' rates
create or replace function public.cad_account_bundle(p_county text, p_account text)
returns jsonb language sql stable security definer set search_path = public as $$
  with a as (select * from cad_accounts where county = p_county and account_id = p_account),
  u as (select * from account_taxing_units where county = p_county and account_id = p_account),
  codes as (select distinct unnest(unit_codes) as code from u),
  tu as (select t.* from taxing_units t join codes c on c.code = t.unit_code where t.county = p_county),
  keys as (select coalesce(comptroller_id, p_county || ':' || unit_code) as k from tu union select p_county || ':' || unit_code from tu),
  r as (select r.* from tax_rates r where r.unit_key in (select k from keys))
  select jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(to_jsonb(a) order by tax_year desc) from a), '[]'::jsonb),
    'units', coalesce((select jsonb_agg(to_jsonb(u) order by tax_year desc) from u), '[]'::jsonb),
    'taxing_units', coalesce((select jsonb_agg(to_jsonb(tu)) from tu), '[]'::jsonb),
    'rates', coalesce((select jsonb_agg(to_jsonb(r)) from r), '[]'::jsonb),
    'runs', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'source', s.source, 'url', s.url, 'file_name', s.file_name, 'finished_at', s.finished_at, 'roll', s.roll, 'tax_year', s.tax_year))
      from source_runs s where s.id in (select source_run_id from a union select source_run_id from u union select source_run_id from r)), '[]'::jsonb))
$$;

-- the loads at a glance (list_datasets, the tools' "current as of")
create or replace function public.cad_meta()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
    select distinct on (source, county) source || coalesce(':' || county, '') as k,
      jsonb_build_object('at', finished_at, 'tax_year', tax_year, 'roll', roll, 'rows', rows_written, 'status', status, 'url', url) as v
    from source_runs where status in ('ok', 'warning', 'skipped') order by source, county, finished_at desc nulls last) t
$$;

-- ---------- raw files ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('cad-raw', 'cad-raw', false, null)
on conflict (id) do nothing;
