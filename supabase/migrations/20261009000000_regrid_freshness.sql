-- Regrid cache, part 2: any click inside a parcel already paid for is free, and saved records know when they're out of date.
--   regrid_parcels.shape   the parcel outline (from geom), so a lookup anywhere inside it hits the saved copy
--   regrid_parcels.geoid   the county (FIPS) the record belongs to
--   regrid_counties        Regrid's own "last full refresh" date per Texas county (Verse endpoint, re-read at most daily);
--                          a saved record fetched before its county's last_refresh is shown as out of date with an Update button
alter table public.regrid_parcels add column if not exists geoid text;
alter table public.regrid_parcels add column if not exists shape extensions.geometry(Geometry, 4326);
create index if not exists regrid_parcels_shape_idx on public.regrid_parcels using gist (shape);

create or replace function public.regrid_parcels_shape() returns trigger language plpgsql set search_path = public, extensions as $$
begin
  new.shape := case when new.geom is null then null else st_setsrid(st_geomfromgeojson(new.geom::text), 4326) end;
  return new;
end $$;
create or replace trigger regrid_parcels_shape before insert or update of geom on public.regrid_parcels for each row execute function public.regrid_parcels_shape();

create table if not exists public.regrid_counties (
  geoid text primary key,
  county text,
  last_refresh date,
  assessor_data_date date,
  checked_at timestamptz not null default now()
);
alter table public.regrid_counties enable row level security;

-- the newest saved record whose parcel contains the point
create or replace function public.regrid_parcel_at(p_lon double precision, p_lat double precision)
returns table (k text, data jsonb, geom jsonb, geoid text, fetched_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select k, data, geom, geoid, fetched_at from regrid_parcels
  where shape is not null and st_intersects(shape, st_setsrid(st_makepoint(p_lon, p_lat), 4326))
  order by fetched_at desc limit 1
$$;
revoke all on function public.regrid_parcel_at(double precision, double precision) from public, anon, authenticated;
