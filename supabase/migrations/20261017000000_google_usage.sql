-- Monthly counters for paid Google Maps Platform calls (api/google.js), so a busy month can't run up a bill:
-- google_take(month, kind, cap) adds one and returns the new count, or -1 when the month's cap is reached.
-- Server (secret key) only: RLS on, no policies.
create table if not exists public.google_usage (month text not null, kind text not null, n integer not null default 0, primary key (month, kind));
alter table public.google_usage enable row level security;

create or replace function public.google_take(p_month text, p_kind text, p_cap integer)
returns integer language sql security definer set search_path = public as $$
  with x as (insert into google_usage (month, kind, n) values (p_month, p_kind, 1)
    on conflict (month, kind) do update set n = google_usage.n + 1 where google_usage.n < p_cap returning n)
  select coalesce((select n from x), -1)
$$;
revoke all on function public.google_take(text, text, integer) from public, anon, authenticated;
grant execute on function public.google_take(text, text, integer) to service_role;
