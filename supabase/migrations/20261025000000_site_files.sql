-- A project's reference files (src/sitefiles.js, api/sitefiles.js, lib/sitefiles.mjs): a survey, existing floor plans,
-- an earlier site plan, kept in a private storage bucket. Only the server touches it, with the secret key: the browser
-- puts a file on a one-time signed upload link and opens one on a ten-minute signed link. No policies on purpose: the
-- public and signed-in keys can't list, read or write it. What the AI read out of each file (its facts, and which the
-- team confirmed) is kept with the project itself (site_projects.doc), so no table is needed. Additive: a new bucket only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-files', 'site-files', false, 20971520,
  array['application/pdf', 'image/png', 'image/jpeg', 'application/dxf', 'image/vnd.dxf', 'application/octet-stream', 'text/plain', 'text/csv'])
on conflict (id) do nothing;
