-- Team field notes, photos and watchlists (src/team.js syncs them; each device keeps an offline copy).
-- Who counts as "the team": anyone signed in (Supabase Auth, email code) with an address on a domain in team_domains.
-- People outside those domains can create an account but every policy below shows them nothing and lets them write nothing.

create table if not exists public.team_domains (domain text primary key);
insert into public.team_domains (domain) values ('finishessolutions.com') on conflict do nothing;
alter table public.team_domains enable row level security; -- no policies: only is_team() (security definer) reads it

create or replace function public.is_team() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_domains d where d.domain = lower(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 2)))
$$;
revoke all on function public.is_team() from public;
grant execute on function public.is_team() to anon, authenticated, service_role;

-- ---------- site notes: shared with the whole team ----------
create table if not exists public.field_notes (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,                       -- the id the note got on the device that created it
  lng double precision not null check (lng between -180 and 180),
  lat double precision not null check (lat between -90 and 90),
  title text not null default '' check (length(title) <= 200),
  body text not null default '' check (length(body) <= 8000),
  tag text not null default 'Other' check (length(tag) <= 60),
  photos text[] not null default '{}',                  -- storage paths in the field-photos bucket
  created_by uuid references auth.users (id) on delete set null,
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  geom extensions.geometry(Point, 4326) generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)) stored
);
create index if not exists field_notes_geom_idx on public.field_notes using gist (geom);
create index if not exists field_notes_updated_idx on public.field_notes (updated_at desc);

-- authorship comes from the session, never from the client
create or replace function public.field_notes_stamp() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); new.created_by_email := auth.jwt() ->> 'email'; end if;
  else
    new.created_by := old.created_by; new.created_by_email := old.created_by_email; new.client_id := old.client_id; new.created_at := old.created_at;
  end if;
  if auth.uid() is not null then new.updated_by_email := auth.jwt() ->> 'email'; end if;
  return new;
end $$;
drop trigger if exists field_notes_stamp on public.field_notes;
create trigger field_notes_stamp before insert or update on public.field_notes for each row execute function public.field_notes_stamp();

alter table public.field_notes enable row level security;
drop policy if exists "team reads notes" on public.field_notes;
drop policy if exists "team adds notes" on public.field_notes;
drop policy if exists "team edits notes" on public.field_notes;
drop policy if exists "authors delete notes" on public.field_notes;
create policy "team reads notes" on public.field_notes for select to authenticated using (public.is_team());
create policy "team adds notes" on public.field_notes for insert to authenticated with check (public.is_team());
create policy "team edits notes" on public.field_notes for update to authenticated using (public.is_team()) with check (public.is_team());
create policy "authors delete notes" on public.field_notes for delete to authenticated using (public.is_team() and created_by = auth.uid());

-- ---------- watchlists: one per person ----------
create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id text not null,
  kind text not null check (kind in ('filing', 'building')),
  ref text not null check (length(ref) <= 80),
  label text check (length(label) <= 300),
  sub text check (length(sub) <= 300),
  lng double precision,
  lat double precision,
  added_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
alter table public.watchlist enable row level security;
drop policy if exists "own watchlist" on public.watchlist;
create policy "own watchlist" on public.watchlist for all to authenticated using (public.is_team() and user_id = auth.uid()) with check (public.is_team() and user_id = auth.uid());

-- ---------- photos: private bucket, team can view, people upload into their own folder ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('field-photos', 'field-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;
drop policy if exists "team views field photos" on storage.objects;
drop policy if exists "team uploads field photos" on storage.objects;
drop policy if exists "owners replace field photos" on storage.objects;
drop policy if exists "owners delete field photos" on storage.objects;
create policy "team views field photos" on storage.objects for select to authenticated using (bucket_id = 'field-photos' and public.is_team());
create policy "team uploads field photos" on storage.objects for insert to authenticated with check (bucket_id = 'field-photos' and public.is_team() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners replace field photos" on storage.objects for update to authenticated using (bucket_id = 'field-photos' and public.is_team() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners delete field photos" on storage.objects for delete to authenticated using (bucket_id = 'field-photos' and public.is_team() and (storage.foldername(name))[1] = auth.uid()::text);
