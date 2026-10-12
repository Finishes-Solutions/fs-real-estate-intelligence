-- Projects and site plans (src/siteplan.js), shared with the team through /api/projects with the secret key, like the
-- field notes. One row per project; the whole project (parcels, notes, site plans) is one JSON document. Last edit
-- wins; a deleted project stays as a tombstone so other devices drop it too.
create table if not exists public.site_projects (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{3,60}$'),
  name text not null default '' check (length(name) <= 200),
  doc jsonb not null,
  deleted boolean not null default false,
  updated_by text check (length(updated_by) <= 80),
  updated_at timestamptz not null default now(),
  check (pg_column_size(doc) <= 600000)
);
create index if not exists site_projects_updated_idx on public.site_projects (updated_at desc);
alter table public.site_projects enable row level security; -- no policies: server (secret key) only
