-- FlightAware AeroAPI: a hard monthly spending cap and a response cache (api/planes.js ?flight=, lib/aeroapi.mjs).
-- Every call first reserves its estimated cost with aeroapi_reserve(), which refuses it when the month would pass the cap.
-- reported_cents is FlightAware's own month-to-date figure (GET /account/usage, refreshed every 15 minutes while calls
-- are made). FlightAware's figure can lag, so it counts as covering calls only up to 10 minutes before it was read;
-- calls logged after that are added on top. Gate: reported + calls since + this call <= cap (it errs high, never low).
-- Server (secret key) only: RLS on, no policies.
create table if not exists public.aeroapi_spend (
  month text primary key,                       -- 'YYYY-MM' (UTC)
  reported_cents numeric(10,3) not null default 0,
  reported_at timestamptz                       -- calls logged before this are inside reported_cents
);
alter table public.aeroapi_spend enable row level security;

create table if not exists public.aeroapi_calls (
  id bigserial primary key,
  month text not null,
  at timestamptz not null default now(),
  cents numeric(10,3) not null,
  what text
);
create index if not exists aeroapi_calls_month_at on public.aeroapi_calls (month, at);
alter table public.aeroapi_calls enable row level security;

create table if not exists public.aeroapi_cache (
  k text primary key,
  data jsonb not null,
  at timestamptz not null default now()
);
alter table public.aeroapi_cache enable row level security;

-- true = go ahead (the call is logged at p_cents); false = it would pass the cap
create or replace function public.aeroapi_reserve(p_month text, p_cents numeric, p_cap_cents numeric, p_what text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare s aeroapi_spend; pending numeric;
begin
  insert into aeroapi_spend (month) values (p_month) on conflict (month) do nothing;
  select * into s from aeroapi_spend where month = p_month for update; -- one reservation at a time
  select coalesce(sum(cents), 0) into pending from aeroapi_calls where month = p_month and at > coalesce(s.reported_at, '-infinity'::timestamptz);
  if s.reported_cents + pending + p_cents > p_cap_cents then return false; end if;
  insert into aeroapi_calls (month, cents, what) values (p_month, p_cents, left(p_what, 80));
  return true;
end $$;

-- FlightAware's month-to-date cost, read at p_as_of
create or replace function public.aeroapi_report(p_month text, p_cents numeric, p_as_of timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into aeroapi_spend (month) values (p_month) on conflict (month) do nothing;
  update aeroapi_spend set reported_cents = greatest(p_cents, 0), reported_at = p_as_of - interval '10 minutes' where month = p_month;
end $$;

-- this month so far, as the cap sees it
create or replace function public.aeroapi_status(p_month text)
returns table (reported_cents numeric, pending_cents numeric, calls bigint, reported_at timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(s.reported_cents, 0),
    (select coalesce(sum(c.cents), 0) from aeroapi_calls c where c.month = p_month and c.at > coalesce(s.reported_at, '-infinity'::timestamptz)),
    (select count(*) from aeroapi_calls c where c.month = p_month), s.reported_at
  from (select p_month as m) x left join aeroapi_spend s on s.month = x.m
$$;

revoke all on function public.aeroapi_reserve(text, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.aeroapi_report(text, numeric, timestamptz) from public, anon, authenticated;
revoke all on function public.aeroapi_status(text) from public, anon, authenticated;
grant execute on function public.aeroapi_reserve(text, numeric, numeric, text) to service_role;
grant execute on function public.aeroapi_report(text, numeric, timestamptz) to service_role;
grant execute on function public.aeroapi_status(text) to service_role;
