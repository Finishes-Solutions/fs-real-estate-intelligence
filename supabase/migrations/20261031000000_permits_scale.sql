-- Permits at scale: dev_items now holds every HCAD permit (1.3M) and Harris County Engineering's ePermits (1.4M). The
-- loader's prune (dev_prune) counted a source's rows and the rows the night's load touched by reading every row of the
-- source from the heap, which hit the statement timeout at this size. An index on (source, load_id) answers both counts
-- and the delete from the index; dev_touch's updates use it too. Apply once (Supabase SQL editor or the CLI).
create index if not exists dev_items_source_load on public.dev_items (source, load_id);
analyze public.dev_items;
