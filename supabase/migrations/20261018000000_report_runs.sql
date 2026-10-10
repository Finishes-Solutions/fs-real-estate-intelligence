-- Feasibility packages, site plans and parcel maps run from the map through the CRE report runner (api/runner.js).
-- One row per run, one per document the runner sends back (its HTML, about 1–2 MB each with the fonts inside).
-- Server (secret key) only: RLS on, no policies. The browser reads runs through api/runner.js.
create table if not exists public.report_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('feasibility', 'site_plan', 'parcel_map')),
  label text not null default '' check (length(label) <= 300),
  status text not null default 'running' check (status in ('running', 'done', 'partial', 'failed')),
  expected text[] not null default '{}',
  options jsonb not null default '{}',
  site jsonb not null default '{}',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists report_runs_created_idx on public.report_runs (created_at desc);
alter table public.report_runs enable row level security;

create table if not exists public.report_run_docs (
  run_id uuid not null references public.report_runs (id) on delete cascade,
  doc_type text not null check (length(doc_type) <= 40),
  ok boolean not null default true,
  title text not null default '',
  name text not null default '',
  html text not null default '',
  error text not null default '',
  meta jsonb not null default '{}',
  bytes integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (run_id, doc_type)
);
alter table public.report_run_docs enable row level security;
