-- TrustVault 0007: private bucket. File bytes are only ever read/written by
-- Edge Functions using the service role AFTER an authorisation decision.
-- Direct Storage API calls by anon/authenticated users are denied: RLS is on for
-- storage.objects, and no permissive policy grants access to this bucket.
-- The RESTRICTIVE policy below is a backstop: even if someone later adds a broad
-- permissive policy, it can never apply to the 'documents' bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "documents bucket is service-role only" on storage.objects
  as restrictive for all to anon, authenticated
  using (bucket_id <> 'documents')
  with check (bucket_id <> 'documents');
