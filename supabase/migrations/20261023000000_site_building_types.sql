-- The team's building library (src/siteplan.js, lib/customtypes.mjs): building types saved from site plans (an AI-crafted
-- type with its recipe, a building sized by hand), shared with the team through /api/buildingtypes with the secret key,
-- like the team projects. One row per type; the whole type is one JSON document. Last edit wins; a deleted type stays
-- as a tombstone so other devices drop it too. Additive: a new table only.
create table if not exists public.site_building_types (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{3,60}$'),
  name text not null default '' check (length(name) <= 200),
  doc jsonb not null,
  deleted boolean not null default false,
  updated_by text check (length(updated_by) <= 80),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (pg_column_size(doc) <= 80000)
);
create index if not exists site_building_types_updated_idx on public.site_building_types (updated_at desc);
alter table public.site_building_types enable row level security; -- no policies: server (secret key) only
