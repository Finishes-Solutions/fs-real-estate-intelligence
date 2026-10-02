-- Live-data history: news, NASA imagery passes, daily weather, tropical storm advisories and census tracts.
-- Written nightly by build/live-sync.mjs (and by /api/news when the site has a secret key); readable by the public site.
-- Lean on purpose (free tier is 500 MB): no images or map tiles are stored, only facts and links.

create table if not exists public.news_articles (
  url text primary key,
  title text not null,
  domain text,
  published date,
  image text,
  first_seen timestamptz not null default now()
);
create index if not exists news_articles_published_idx on public.news_articles (published desc);

-- which filing an article was found for (and with what search)
create table if not exists public.filing_news (
  filing_id text not null,
  url text not null references public.news_articles (url) on delete cascade,
  query text,
  found_at timestamptz not null default now(),
  primary key (filing_id, url)
);
create index if not exists filing_news_url_idx on public.filing_news (url);

-- NASA HLS passes over each filing: one row per filing / product / day. cloud is % for the whole ~110 km scene.
create table if not exists public.imagery_passes (
  filing_id text not null,
  product text not null check (product in ('S30', 'L30')),
  day date not null,
  cloud real,
  checked_at timestamptz not null default now(),
  primary key (filing_id, product, day)
);
create index if not exists imagery_passes_day_idx on public.imagery_passes (day desc);

-- daily weather per county (at the county centroid). Past days are Open-Meteo's analysis, future days its forecast.
create table if not exists public.weather_daily (
  county text not null,
  day date not null,
  lat double precision not null,
  lon double precision not null,
  conditions text,
  high_f real,
  low_f real,
  rain_in real,
  rain_chance_pct smallint,
  max_wind_mph real,
  max_gust_mph real,
  is_forecast boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (county, day)
);

-- NHC active-storm snapshots (one row per storm per advisory time)
create table if not exists public.storm_advisories (
  storm_id text not null,
  observed_at timestamptz not null,
  name text,
  classification text,
  wind_mph smallint,
  pressure_mb smallint,
  lat double precision,
  lon double precision,
  moving text,
  advisory_url text,
  primary key (storm_id, observed_at)
);

-- ACS 5-year census tracts (the demographics layer)
create table if not exists public.tracts (
  geoid text primary key,
  acs_year smallint not null,
  base_year smallint,
  pop integer,
  growth_pct real,
  income integer,
  home_value integer,
  rent integer,
  vacancy_pct real,
  median_age real,
  housing_units integer,
  geom_json jsonb not null,
  geom extensions.geometry(Geometry, 4326) generated always as (extensions.st_setsrid(extensions.st_geomfromgeojson(geom_json::text), 4326)) stored,
  updated_at timestamptz not null default now()
);
create index if not exists tracts_geom_idx on public.tracts using gist (geom);

-- public read, no public write (the service role bypasses RLS)
alter table public.news_articles enable row level security;
alter table public.filing_news enable row level security;
alter table public.imagery_passes enable row level security;
alter table public.weather_daily enable row level security;
alter table public.storm_advisories enable row level security;
alter table public.tracts enable row level security;
do $$ declare t text; begin
  foreach t in array array['news_articles', 'filing_news', 'imagery_passes', 'weather_daily', 'storm_advisories', 'tracts'] loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;
