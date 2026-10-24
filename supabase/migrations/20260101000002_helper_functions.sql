-- TrustVault 0002: authorisation helpers used by RLS and by trusted RPCs.
-- SECURITY DEFINER lets policies consult tables without recursive RLS.
-- Every definer function pins search_path = '' and fully qualifies objects.

-- Single source of truth for document access.
-- Returns 'owner' | 'edit' | 'read' | null (no such live document / no access).
create function app.user_access(p_document uuid, p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when d.owner_id = p_user then 'owner'
    else (
      select pm.permission
        from public.document_permissions pm
       where pm.document_id = d.id
         and pm.user_id = p_user
         and pm.revoked_at is null
       limit 1)
  end
  from public.documents d
  where d.id = p_document and d.deleted_at is null;
$$;

-- Single source of truth for the action matrix.
create function app.access_allows(p_access text, p_action text) returns boolean
language sql immutable set search_path = '' as $$
  select case p_action
    when 'read'     then p_access in ('owner', 'edit', 'read')
    when 'download' then p_access in ('owner', 'edit', 'read')
    when 'edit'     then p_access in ('owner', 'edit')   -- metadata edit
    when 'replace'  then p_access in ('owner', 'edit')   -- replace file content
    when 'delete'   then p_access = 'owner'
    when 'grant'    then p_access = 'owner'
    when 'revoke'   then p_access = 'owner'
    else false
  end;
$$;

create function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.role = 'admin');
$$;

-- Owner of the document, INCLUDING soft-deleted ones (owners keep their history).
create function app.owns_document(p_document uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d
     where d.id = p_document and d.owner_id = (select auth.uid()));
$$;

-- Who may see whose profile: yourself, admins (user administration), the owner
-- of a document shared with you, and people you have granted access to.
create function app.can_view_profile(p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) = p_target
      or app.is_admin()
      or exists (
           select 1 from public.documents d
            where d.owner_id = p_target and d.deleted_at is null
              and app.user_access(d.id, (select auth.uid())) is not null)
      or exists (
           select 1 from public.documents d
             join public.document_permissions pm
               on pm.document_id = d.id and pm.revoked_at is null
            where d.owner_id = (select auth.uid()) and d.deleted_at is null
              and pm.user_id = p_target);
$$;

create function app.escape_like(p_text text) returns text
language sql immutable set search_path = '' as $$
  select replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- Callers (RLS evaluation) need USAGE on the schema and EXECUTE on helpers.
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;
revoke execute on all functions in schema app from public, anon;
grant execute on function app.user_access(uuid, uuid), app.is_admin(), app.owns_document(uuid),
  app.can_view_profile(uuid), app.escape_like(text), app.access_allows(text, text)
  to authenticated, service_role;
