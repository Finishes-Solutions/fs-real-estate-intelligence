-- Permits at scale: dev_items now holds every HCAD permit (1.3M) and Harris County Engineering's ePermits (1.4M). The
-- loader's prune (dev_prune) counted a source's rows and the rows the night's load touched by reading every row of the
-- source from the heap, which hit the statement timeout at this size. An index on (source, load_id) answers both counts
-- and the delete from the index; dev_touch's updates use it too. Apply once (Supabase SQL editor or the CLI).
create index if not exists dev_items_source_load on public.dev_items (source, load_id);
analyze public.dev_items;

-- the prune counts first and only runs its delete when the load left rows behind: a night that touched every row of a
-- 1.3M-row source no longer scans it all a second time (the statement timeout for the loader's role is 40 s)
create or replace function public.dev_prune(p_source text, p_load text, p_min_keep real default 0.5)
returns jsonb language plpgsql security definer set search_path = public as $$
declare total bigint; fresh bigint; removed bigint := 0; go boolean;
begin
  select count(*), count(*) filter (where load_id = p_load) into total, fresh from dev_items where source = p_source;
  go := total = 0 or fresh >= total * p_min_keep;
  if go and fresh < total then
    delete from dev_items where source = p_source and load_id <> p_load;
    get diagnostics removed = row_count;
  end if;
  return jsonb_build_object('kept', fresh, 'removed', removed, 'refused', not go, 'total', total);
end $$;
