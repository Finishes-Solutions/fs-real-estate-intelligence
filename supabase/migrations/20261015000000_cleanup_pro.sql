-- Housekeeping after the move to the Pro plan (2026-10-04).
--   FlightAware AeroAPI was replaced by adsb.lol: its cache, call log and spend tables are unused.
--   Two row-level-security rules called auth.uid() once per row; (select auth.uid()) evaluates it once per query.
--   field_notes.created_by gets the index its foreign key lacked.
--   Air traffic history (low-flight cells and sampled days) is kept 3 years instead of 400 days.
drop table if exists public.aeroapi_cache, public.aeroapi_calls, public.aeroapi_spend;

drop policy if exists "authors delete notes" on public.field_notes;
create policy "authors delete notes" on public.field_notes for delete to authenticated using (is_team() and created_by = (select auth.uid()));
drop policy if exists "own watchlist" on public.watchlist;
create policy "own watchlist" on public.watchlist for all to authenticated using (is_team() and user_id = (select auth.uid())) with check (is_team() and user_id = (select auth.uid()));

create index if not exists field_notes_created_by_idx on public.field_notes (created_by);

-- air traffic history: 3 years of low-flight cells and hourly profiles (was 400 days and 13 months on the free database)
create or replace function public.add_air_samples(p_day date, p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into air_days (day, samples) values (p_day, 1)
    on conflict (day) do update set samples = air_days.samples + 1;
  insert into air_cells (day, lon, lat, n, min_alt)
    select p_day, (r->>'lon')::numeric, (r->>'lat')::numeric, (r->>'n')::int, (r->>'min_alt')::int
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    on conflict (day, lon, lat) do update set n = air_cells.n + excluded.n, min_alt = least(air_cells.min_alt, excluded.min_alt);
  delete from air_cells where day < p_day - 1100;
  delete from air_days where day < p_day - 1100;
end $$;

create or replace function public.add_air_profile(p_month date, p_hour integer, p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into air_profile_samples (month, hour, samples) values (p_month, p_hour, 1)
    on conflict (month, hour) do update set samples = air_profile_samples.samples + 1;
  insert into air_profile (month, lon, lat, hours, n, low, heli, jet, prop, mil, min_alt)
    select p_month, (r->>'lon')::numeric, (r->>'lat')::numeric,
      (select array_agg(case when i = p_hour then (r->>'n')::int else 0 end order by i) from generate_series(0, 23) i),
      (r->>'n')::int, coalesce((r->>'low')::int, 0), coalesce((r->>'heli')::int, 0), coalesce((r->>'jet')::int, 0), coalesce((r->>'prop')::int, 0), coalesce((r->>'mil')::int, 0), (r->>'min_alt')::int
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    on conflict (month, lon, lat) do update set
      hours[p_hour + 1] = air_profile.hours[p_hour + 1] + excluded.n,
      n = air_profile.n + excluded.n, low = air_profile.low + excluded.low, heli = air_profile.heli + excluded.heli, jet = air_profile.jet + excluded.jet,
      prop = air_profile.prop + excluded.prop, mil = air_profile.mil + excluded.mil, min_alt = least(air_profile.min_alt, excluded.min_alt);
  if random() < 0.002 then delete from air_profile where month < (date_trunc('month', p_month) - interval '37 months')::date; end if;
end $$;
revoke all on function public.add_air_samples(date, jsonb) from public, anon, authenticated;
revoke all on function public.add_air_profile(date, integer, jsonb) from public, anon, authenticated;
grant execute on function public.add_air_samples(date, jsonb) to service_role;
grant execute on function public.add_air_profile(date, integer, jsonb) to service_role;
