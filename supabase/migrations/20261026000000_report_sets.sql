-- Saved feasibility report sets (api/feasibility.js op 'save', src/workspace.js Reports step): each set's files (the
-- Feasibility report PDF, the workbook, the register and budget CSVs, the study JSON) under
-- projects/<project id>/reports/<report id>/ in a private bucket. Only the server touches it, with the secret key; the
-- browser opens a file on a ten-minute signed link. The report's record (when, by whom, the inputs hash, the files) is
-- kept with the project itself (site_projects.doc.fz.reports), so no table is needed. Additive: a new bucket only.
-- Applied 2026-10-25 to the platform's own Supabase project (Finishes Real Estate Intelligence).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-sets', 'report-sets', false, 26214400,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/json'])
on conflict (id) do nothing;
