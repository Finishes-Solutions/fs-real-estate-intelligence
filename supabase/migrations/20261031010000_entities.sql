-- State business-entity registries (LLCs, corporations, partnerships, nonprofits) from every state that publishes one,
-- loaded by build/entities.mjs (sources in data/entity-sources.json). One row per entity per state. Read by
-- api/entity.js (owner lookups beyond Texas) and the MCP company_lookup tool through entity_search. RLS on, no policies:
-- only the secret key (the loader, the API functions) reads and writes.
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.entities (
  id text primary key,                 -- <state>:<the state's entity number>
  state text not null,                 -- two-letter state of the registry
  number text not null,                -- the state's document / file / entity number
  name text not null,
  name_norm text not null,             -- upper case, suffixes normalized (LLC, LP, INC, CORP), punctuation removed (lib/entities.mjs normEntity)
  kind text,                           -- LLC, Corporation, LP, LLP, Nonprofit, Trust, Other
  status text,                         -- Active, Inactive, Dissolved, Revoked, ... as the state says it
  active boolean,
  formed date,
  juris text,                          -- where it was formed (a foreign entity registered here names its home state)
  agent text,                          -- registered agent
  agent_addr text,
  addr text,                           -- principal office (else mailing) address, one line
  city text,
  zip text,
  attrs jsonb not null default '{}',   -- the registry's other fields (officers where public, mailing address, ...)
  source text not null,
  h text,
  load_id text,
  first_seen date not null default current_date
);
create index if not exists entities_name_trgm on public.entities using gin (name_norm extensions.gin_trgm_ops);
create index if not exists entities_name_prefix on public.entities (name_norm text_pattern_ops);
create index if not exists entities_state on public.entities (state, name_norm);
create index if not exists entities_source on public.entities (source, id);
alter table public.entities enable row level security;

-- the loader's change check: id -> hash for one source, keyset paged
create or replace function public.entity_hashes(p_source text, p_after text default '', p_n integer default 50000)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(id, h), '{}'::jsonb) from (
    select id, h from entities where source = p_source and id > p_after order by id limit least(greatest(p_n, 1), 50000)) t
$$;

-- search by normalized name: the exact name first, then names starting with it, then similar names (trigram), active
-- ones first; optional state. Answers in well under a second on tens of millions of rows (the exact and prefix steps
-- use the btree index; the similar step only runs when those found fewer than p_n).
create or replace function public.entity_search(p_q text, p_state text default null, p_n integer default 20)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare n integer := least(greatest(p_n, 1), 100); out jsonb;
begin
  perform set_config('pg_trgm.similarity_threshold', '0.45', true);
  with hits as (
    (select e.*, 3 as rank, 1.0::real as sim from entities e where e.name_norm = p_q and (p_state is null or e.state = p_state) limit n)
    union all
    (select e.*, 2, 0.9::real from entities e where e.name_norm like p_q || ' %' and (p_state is null or e.state = p_state) limit n)
  ), more as (
    select e.*, 1 as rank, similarity(e.name_norm, p_q) as sim from entities e
    where (select count(*) from hits) < n and e.name_norm % p_q and (p_state is null or e.state = p_state)
    order by e.name_norm <-> p_q limit n
  ), allh as (select * from hits union all select * from more)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'state', state, 'number', number, 'name', name, 'kind', kind, 'status', status, 'active', active,
    'formed', formed, 'juris', juris, 'agent', agent, 'agent_addr', agent_addr, 'addr', addr, 'city', city, 'zip', zip, 'attrs', attrs, 'source', source, 'sim', round(sim::numeric, 2))
    order by rank desc, active desc nulls last, sim desc, formed desc nulls last), '[]'::jsonb) into out
  from (select distinct on (id) * from allh order by id, rank desc) t;
  return (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(out) x limit n) y);
end $$;

-- rows per state and how many are active (Data & help, the MCP dataset list)
create or replace function public.entity_counts()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(state, jsonb_build_object('rows', c, 'active', a)), '{}'::jsonb)
  from (select state, count(*) c, count(*) filter (where active) a from entities group by state) t
$$;

do $$ declare f text; begin
  foreach f in array array['entity_hashes(text,text,integer)', 'entity_search(text,text,integer)', 'entity_counts()'] loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || f || ' to service_role';
  end loop;
end $$;
