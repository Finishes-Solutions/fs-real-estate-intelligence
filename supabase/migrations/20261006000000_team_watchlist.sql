-- Field notes without sign-in: the site's /api/field endpoint reads and writes field_notes, team_watchlist and the
-- field-photos bucket with the secret key. Browsers never touch these tables directly (RLS: no anon access), so the
-- public publishable key can't read or change them. The per-person `watchlist` table waits for sign-in to be switched on.

create table if not exists public.team_watchlist (
  kind text not null check (kind in ('filing', 'building')),
  ref text not null check (length(ref) <= 80),
  client_id text,
  label text check (length(label) <= 300),
  sub text check (length(sub) <= 300),
  lng double precision,
  lat double precision,
  added_by text check (length(added_by) <= 80),
  added_at timestamptz not null default now(),
  primary key (kind, ref)
);
alter table public.team_watchlist enable row level security; -- no policies: server (secret key) only
