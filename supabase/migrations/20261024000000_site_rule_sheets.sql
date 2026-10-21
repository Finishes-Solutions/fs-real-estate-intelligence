-- The team's street rule sheets (lib/rulesheet.mjs, src/rulesheets.js): one sheet per jurisdiction (a city, a county, a
-- city's ETJ in a county, a drainage district), the AI's reading of its subdivision and drainage rules with a source for
-- each value, what people confirmed or edited, shared with the team through /api/rulesheets with the secret key, like the
-- building library. One row per jurisdiction; the whole sheet is one JSON document. Last edit wins; a deleted sheet
-- stays as a tombstone so other devices drop it too. Additive: a new table only.
create table if not exists public.site_rule_sheets (
  key text primary key check (key ~ '^[a-z0-9:|_-]{3,120}$'),
  name text not null default '' check (length(name) <= 200),
  doc jsonb not null,
  deleted boolean not null default false,
  updated_by text check (length(updated_by) <= 80),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (pg_column_size(doc) <= 60000)
);
create index if not exists site_rule_sheets_updated_idx on public.site_rule_sheets (updated_at desc);
alter table public.site_rule_sheets enable row level security; -- no policies: server (secret key) only
