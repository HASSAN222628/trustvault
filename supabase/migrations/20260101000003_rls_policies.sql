-- TrustVault 0003: Row-Level Security.
-- Design: clients may only READ (through RLS). All writes to documents,
-- permissions and audit_events go through Edge Functions -> service_role RPCs,
-- so NO insert/update/delete policies exist for those tables, and the table
-- privileges are revoked as well (see migration 0008). Two independent layers.

alter table public.profiles             enable row level security;
alter table public.documents            enable row level security;
alter table public.document_permissions enable row level security;
alter table public.audit_events         enable row level security;

-- ---- profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (app.can_view_profile(id));

-- Users may edit only their own row; column GRANT limits it to display_name
-- and the profiles_guard trigger blocks role/email/id changes as a backstop.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---- documents (metadata). Admin role deliberately grants NOTHING here.
create policy documents_select on public.documents
  for select to authenticated
  using (deleted_at is null and app.user_access(id, (select auth.uid())) is not null);

-- ---- document_permissions
-- Owner sees every grant (active + history) on their documents.
-- A grantee sees only their own ACTIVE grant.
create policy permissions_select on public.document_permissions
  for select to authenticated
  using (
    app.owns_document(document_id)
    or (user_id = (select auth.uid()) and revoked_at is null)
  );

-- ---- audit_events
-- Admins: everything. Everyone else: their own actions, plus the full history
-- of documents they own. No insert/update/delete policies exist.
create policy audit_select on public.audit_events
  for select to authenticated
  using (
    app.is_admin()
    or actor_id = (select auth.uid())
    or app.owns_document(document_id)
  );
