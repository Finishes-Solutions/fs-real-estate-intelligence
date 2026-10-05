-- Crime library: the FBI Crime Data Explorer's yearly figures for every city and county police department in the US,
-- loaded weekly by build/crime-library.mjs (.github/workflows/crime-library.yml) and read by api/crimeus before it asks
-- the FBI live.
--   crime_agencies       the FBI's agency list (every type); loaded_at says when its yearly figures were last read
--   crime_agency_years   one row per department and calendar year it reported (counts, months reported, population)
--   crime_area_years     the state and national rates per 100,000 for each year ('US' or a state abbreviation)
--   crime_peer_rank()    where a department sits among the same kind of departments in its state (percentiles)
--   crime_rankings()     the departments in a state ordered by violent or property crime rate
create table if not exists public.crime_agencies (
  ori text primary key,
  name text not null,
  type text not null,                          -- City, County, University or College, State Police, Tribal, Other…
  state char(2) not null,
  counties text[] not null default '{}',
  nibrs_since date,
  lat double precision,                        -- often the county's middle, not the department's own place
  lon double precision,
  loaded_at timestamptz,                       -- yearly figures last read (null = not yet)
  data_through text,                           -- the FBI's newest month at that read, MM/YYYY
  updated_at timestamptz not null default now()
);
create index if not exists crime_agencies_state_idx on public.crime_agencies (state, type);

create table if not exists public.crime_agency_years (
  ori text not null references public.crime_agencies (ori) on delete cascade,
  year smallint not null,
  v_months smallint not null default 0,        -- months the department reported (violent / property may differ)
  p_months smallint not null default 0,
  pop integer,                                 -- residents the department covers
  v integer, p integer,                        -- violent and property offenses
  v_cleared integer, p_cleared integer,        -- cleared that year (can include older offenses)
  homicide integer, rape integer, robbery integer, agg_assault integer,
  burglary integer, larceny integer, mvt integer, arson integer,
  primary key (ori, year)
);
create index if not exists crime_agency_years_year_idx on public.crime_agency_years (year);

create table if not exists public.crime_area_years (
  area text not null,                          -- 'US' or a state abbreviation
  year smallint not null,
  v_rate real, p_rate real,
  homicide_rate real, rape_rate real, robbery_rate real, agg_assault_rate real,
  burglary_rate real, larceny_rate real, mvt_rate real, arson_rate real,
  primary key (area, year)
);

alter table public.crime_agencies enable row level security;      -- no policies: the server reads with the service key
alter table public.crime_agency_years enable row level security;
alter table public.crime_area_years enable row level security;

-- yearly rates of whole-year departments of one kind in one state (small places are left out: a handful of offenses
-- swings their rate wildly)
create or replace view public.crime_year_rates as
  select a.ori, a.name, a.type, a.state, y.year, y.pop,
         round((y.v::numeric / y.pop * 100000), 1) as v_rate, round((y.p::numeric / y.pop * 100000), 1) as p_rate
  from public.crime_agency_years y join public.crime_agencies a using (ori)
  where y.v_months = 12 and y.p_months = 12 and y.pop >= 2500 and y.v is not null and y.p is not null;
revoke all on public.crime_year_rates from public, anon, authenticated;

create or replace function public.crime_peer_rank(p_ori text, p_year int)
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select * from crime_year_rates where ori = p_ori and year = p_year),
  peers as (select r.* from crime_year_rates r, me where r.state = me.state and r.type = me.type and r.year = me.year)
  select case when not exists (select 1 from me) then null else jsonb_build_object(
    'peers', (select count(*) from peers),
    'type', (select type from me), 'state', (select state from me), 'year', p_year,
    -- share of peers with a higher rate (higher = lower crime than most)
    'v_lower_than_pct', (select round(100.0 * count(*) filter (where p.v_rate > me.v_rate) / nullif(count(*) - 1, 0)) from peers p, me),
    'p_lower_than_pct', (select round(100.0 * count(*) filter (where p.p_rate > me.p_rate) / nullif(count(*) - 1, 0)) from peers p, me)
  ) end
$$;

create or replace function public.crime_rankings(p_state text, p_year int, p_type text default 'City', p_min_pop int default 10000,
  p_order text default 'v', p_desc boolean default false, p_limit int default 20)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.ord), '[]'::jsonb) from (
    select r.ori, r.name, r.pop, r.v_rate, r.p_rate,
           row_number() over (order by case when p_desc then -(case when p_order = 'p' then r.p_rate else r.v_rate end) else (case when p_order = 'p' then r.p_rate else r.v_rate end) end, r.pop desc) as ord
    from crime_year_rates r
    where r.state = upper(p_state) and r.year = p_year and r.type = p_type and r.pop >= greatest(p_min_pop, 2500)
    order by ord limit least(greatest(p_limit, 1), 100)
  ) t
$$;

revoke all on function public.crime_peer_rank(text, int) from public, anon, authenticated;
revoke all on function public.crime_rankings(text, int, text, int, text, boolean, int) from public, anon, authenticated;
grant execute on function public.crime_peer_rank(text, int) to service_role;
grant execute on function public.crime_rankings(text, int, text, int, text, boolean, int) to service_role;
