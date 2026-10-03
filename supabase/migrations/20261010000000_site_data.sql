-- Site data: Houston Police NIBRS incidents for "crime near this site" on building cards.
--   crime_incidents   one row per incident × offense class, last ~25 months (build/live-sync.mjs step "crime", nightly)
--   crime_near()      counts by category (v violent, p property, o other) for the last 12 months and the 12 before, within a radius
--   crime_prune()     drops rows older than the window (called by the nightly sync; the pipeline function can't DELETE)
create table if not exists public.crime_incidents (
  id text primary key,                         -- HPD incident number + ':' + NIBRS class
  day date not null,
  code text not null,                          -- NIBRS class, e.g. 13A
  cat char(1) not null check (cat in ('v', 'p', 'o')),
  n smallint not null default 1,               -- offense count
  premise text,
  lon double precision not null,
  lat double precision not null,
  pt extensions.geography(Point, 4326) generated always as (extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography) stored
);
create index if not exists crime_incidents_pt_idx on public.crime_incidents using gist (pt);
create index if not exists crime_incidents_day_idx on public.crime_incidents (day);
alter table public.crime_incidents enable row level security; -- no policies: read through crime_near() only

create or replace function public.crime_near(p_lon double precision, p_lat double precision, p_m double precision default 805)
returns table (period text, cat text, n bigint, latest date)
language sql stable security definer set search_path = public, extensions as $$
  with lim as (select max(day) as last from crime_incidents),
  hits as (
    select c.day, c.cat, c.n, l.last from crime_incidents c, lim l
    where st_dwithin(c.pt, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, least(greatest(p_m, 50), 3220))
      and c.day > l.last - 730
  )
  select case when day > last - 365 then 'last12' else 'prior12' end, cat::text, sum(n)::bigint, max(last)
  from hits group by 1, 2
$$;
revoke all on function public.crime_near(double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.crime_near(double precision, double precision, double precision) to service_role;

create or replace function public.crime_prune(p_keep_days integer default 760)
returns bigint language plpgsql security definer set search_path = public as $$
declare k bigint;
begin
  delete from crime_incidents where day < (select max(day) from crime_incidents) - greatest(p_keep_days, 400);
  get diagnostics k = row_count; return k;
end $$;
revoke all on function public.crime_prune(integer) from public, anon, authenticated;
grant execute on function public.crime_prune(integer) to service_role;

-- the latest incident date already saved (the nightly sync only re-sends the recent months)
create or replace function public.crime_latest() returns date language sql stable security definer set search_path = public as $$
  select max(day) from crime_incidents
$$;
revoke all on function public.crime_latest() from public, anon, authenticated;
grant execute on function public.crime_latest() to service_role;
