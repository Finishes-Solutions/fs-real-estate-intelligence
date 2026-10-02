-- Regrid (paid parcel API, Bundle Access: 2,000 parcel records and 200,000 tiles a month, overage $0.10 / $0.001).
-- api/regrid.js counts every billable call here and refuses once a monthly cap is reached, and keeps each parcel record
-- it paid for so the same parcel never costs twice. Only the server (secret key) touches these tables.

create table if not exists public.regrid_usage (
  cycle text not null,          -- billing cycle start (YYYY-MM-DD from Regrid's /usage), or the calendar month as a fallback
  kind text not null check (kind in ('records', 'tiles')),
  n integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (cycle, kind)
);

create table if not exists public.regrid_parcels (
  k text primary key,           -- lookup key: StratMap "county|prop_id" when known, else the point rounded to ~1 m
  ll_uuid text,
  data jsonb not null,          -- the trimmed record the card shows
  geom jsonb,
  fetched_at timestamptz not null default now()
);

alter table public.regrid_usage enable row level security;
alter table public.regrid_parcels enable row level security;
-- no policies: the public (publishable) key can neither read nor write; the server uses the secret key

-- Take n units of a monthly allowance atomically. floor = what Regrid itself reports as used this cycle (our counter never
-- runs behind it). Returns the new total, or -1 (and takes nothing) when the total would pass cap.
create or replace function public.regrid_take(p_cycle text, p_kind text, p_n integer, p_cap integer, p_floor integer default 0)
returns integer language plpgsql security definer set search_path = public as $$
declare cur integer;
begin
  insert into regrid_usage (cycle, kind, n) values (p_cycle, p_kind, 0) on conflict (cycle, kind) do nothing;
  select n into cur from regrid_usage where cycle = p_cycle and kind = p_kind for update;
  cur := greatest(cur, coalesce(p_floor, 0));
  if cur + p_n > p_cap then
    update regrid_usage set n = cur, updated_at = now() where cycle = p_cycle and kind = p_kind;
    return -1;
  end if;
  update regrid_usage set n = cur + p_n, updated_at = now() where cycle = p_cycle and kind = p_kind;
  return cur + p_n;
end $$;
revoke all on function public.regrid_take(text, text, integer, integer, integer) from public, anon, authenticated;
