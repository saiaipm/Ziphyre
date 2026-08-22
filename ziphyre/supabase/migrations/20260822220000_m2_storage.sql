-- M2 — CV storage bucket
-- Tech spec §12: private bucket, no public access. Objects are keyed
-- {organization_id}/{application_id}/{filename} so RLS can scope by
-- the leading path segment. The manual-upload server action uploads
-- with the session-scoped client (matching this policy); the
-- background screening job reads back with the admin client, which
-- bypasses these policies entirely. NEVER modify this file once
-- applied. Roll forward with a new migration.

insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict (id) do nothing;

create policy cv_insert on storage.objects for insert
  with check (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1]::uuid in (select public.current_org_ids())
  );

create policy cv_read on storage.objects for select
  using (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1]::uuid in (select public.current_org_ids())
  );
