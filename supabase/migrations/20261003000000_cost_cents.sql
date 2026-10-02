-- Keep cents: TDLR estimated costs can carry cents (e.g. 148711.28). bigint -> numeric(14,2).
-- county_stats depends on filings.cost, so it is dropped and recreated around the type change. Safe to run more than once.
drop view if exists public.county_stats;
alter table public.filings alter column cost type numeric(14,2) using cost::numeric(14,2);
create or replace view public.county_stats with (security_invoker = true) as
  select fips, count(*)::int as filings, coalesce(sum(cost), 0)::numeric(16,2) as value,
         count(*) filter (where reg >= current_date - 365)::int as filings_12m,
         coalesce(sum(cost) filter (where reg >= current_date - 365), 0)::numeric(16,2) as value_12m,
         max(reg) as latest
  from public.filings group by fips;
grant select on public.county_stats to anon, authenticated;
