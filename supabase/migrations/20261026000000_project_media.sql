-- A project's renderings, the massing each was painted from and its plan set PDFs (src/siteplan.js, api/sitefiles.js
-- media, lib/sitefiles.mjs MEDIA), kept for the team so they open on any computer, not only the browser that made
-- them. Private, like site-files: only the server touches it with the secret key; the browser puts a picture on a
-- one-time signed upload link and opens one on a ten-minute signed link. Paths: <project id>/<kind>/<key>.<ext>.
-- Additive: a new bucket only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-media', 'project-media', false, 52428800, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;
