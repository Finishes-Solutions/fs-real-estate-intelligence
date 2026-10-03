-- Fix: air_density's parameter "n" (the box's north edge) shares its name with air_cells.n (the sighting count).
-- Inside a SQL function the column wins, so "c.lat between s and n" compared each cell's latitude with its own count
-- and only cells seen 30+ times came back: the Low Flight Paths layer showed a handful of squares at IAH and Hobby.
-- Parameters are now referenced through the function name.
create or replace function public.air_density(w numeric, s numeric, e numeric, n numeric, since date)
returns table (lon numeric, lat numeric, sightings bigint, min_alt integer, samples bigint)
language sql stable security definer set search_path = public as $$
  select c.lon, c.lat, sum(c.n)::bigint, min(c.min_alt), (select coalesce(sum(d.samples), 0) from air_days d where d.day >= air_density.since)::bigint
  from air_cells c
  where c.lon between air_density.w and air_density.e and c.lat between air_density.s and air_density.n and c.day >= air_density.since
  group by c.lon, c.lat
$$;

revoke all on function public.air_density(numeric, numeric, numeric, numeric, date) from public, anon, authenticated;
