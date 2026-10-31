-- Permits without a map point (tables published without coordinates) are placed by the national permit loader through
-- the US Census batch geocoder (build/permits-us.mjs). The loader asks for a source's unplaced rows, newest first, and
-- writes the points back with dev_set_points. An address the geocoder couldn't match is marked so it isn't asked again.
create index if not exists dev_items_unplaced on public.dev_items (source, day desc) where lon is null and addr is not null and (attrs->>'geocode') is null;

create or replace function public.dev_set_points(p_rows jsonb)
returns integer language sql security definer set search_path = public as $$
  with r as (select * from jsonb_to_recordset(p_rows) as x(id text, lon double precision, lat double precision, miss boolean)),
  u as (update dev_items d set lon = case when r.miss then null else r.lon end, lat = case when r.miss then null else r.lat end,
      attrs = case when r.miss then d.attrs || '{"geocode":"no match"}'::jsonb else d.attrs || '{"geocode":"census"}'::jsonb end
    from r where d.id = r.id returning 1)
  select count(*)::integer from u
$$;
revoke all on function public.dev_set_points(jsonb) from public, anon, authenticated;
grant execute on function public.dev_set_points(jsonb) to service_role;
