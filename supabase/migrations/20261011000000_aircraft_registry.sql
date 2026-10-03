-- FAA aircraft registry: every US-registered aircraft (MASTER.txt of the FAA Releasable Aircraft Database), loaded nightly
-- by build/live-sync.mjs (step "aircraft") and read by api/planes.js ?reg= for "who is this plane registered to".
-- n_number is stored without the leading N; hex is the Mode S code ADS-B broadcasts (lower case). `h` hashes the row so
-- the sync only rewrites aircraft that changed. Server (secret key) only: RLS on, no policies. About 300,000 rows.
create table if not exists public.aircraft_registry (
  n_number text primary key,
  hex text,
  serial text,
  mfr text,
  model text,
  year_mfr smallint,
  aircraft_type text,
  engine_type text,
  engine text,
  seats smallint,
  engines smallint,
  weight_class text,
  airworthiness text,
  registrant_type text,
  name text,
  street text,
  city text,
  state text,
  zip text,
  country text,
  other_names text[],
  cert_issued date,
  last_action date,
  airworthy date,
  expires date,
  status text,
  fractional boolean not null default false,
  kit text,
  h text not null,
  synced_at timestamptz not null default now()
);
-- added the same day as the table (2026-10-03): harmless if the table was created with them already
alter table public.aircraft_registry add column if not exists weight_class text, add column if not exists airworthiness text;
create index if not exists aircraft_registry_hex_idx on public.aircraft_registry (hex);
alter table public.aircraft_registry enable row level security;

-- aircraft that left the registry (deregistered, N-number changed): the nightly sync passes their N-numbers here
-- (the pipeline edge function can't DELETE)
create or replace function public.aircraft_registry_remove(p_ids text[])
returns bigint language plpgsql security definer set search_path = public as $$
declare k bigint;
begin
  delete from aircraft_registry where n_number = any(p_ids);
  get diagnostics k = row_count; return k;
end $$;
revoke all on function public.aircraft_registry_remove(text[]) from public, anon, authenticated;
grant execute on function public.aircraft_registry_remove(text[]) to service_role;
