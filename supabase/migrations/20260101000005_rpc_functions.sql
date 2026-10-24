-- TrustVault 0005: trusted operations. Each RPC performs the authorisation
-- check, the data change AND the audit write inside ONE transaction. If the
-- audit insert fails, the whole call fails (fail closed).
-- They return jsonb {ok, code, ...} instead of raising on a denial, because a
-- raise would roll back the "denied" audit row we just wrote.
-- Execute is granted to service_role ONLY (migration 0008).

-- Core decision + audit. p_audit_allowed=false audits denials only (pre-checks).
create function app.authorize(
  p_actor uuid, p_document uuid, p_action text, p_request_id text, p_audit_allowed boolean default true
) returns text   -- returns the actor's access level when allowed, else null
language plpgsql security definer set search_path = '' as $$
declare
  v_access text := app.user_access(p_document, p_actor);
  v_ok     boolean;
begin
  if p_action not in ('read', 'download', 'edit', 'replace', 'delete', 'grant', 'revoke') then
    raise exception 'unknown action %', p_action;
  end if;
  v_ok := coalesce(app.access_allows(v_access, p_action), false);
  if v_ok then
    if p_audit_allowed then
      perform app.write_audit(p_actor, p_document, 'document.' || p_action, 'success', p_request_id,
        jsonb_build_object('access', v_access));
    end if;
    return v_access;
  end if;
  perform app.write_audit(p_actor, p_document, 'document.' || p_action, 'denied', p_request_id,
    jsonb_build_object('reason', case when v_access is null then 'no_access' else 'insufficient_permission' end,
                       'access', v_access));
  return null;
end $$;

-- Result helper: distinguishes "no access at all" (reported as not_found) from
-- "can see it but may not do this" (forbidden).
create function app.deny_code(p_actor uuid, p_document uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when app.user_access(p_document, p_actor) is null then 'not_found' else 'forbidden' end;
$$;

create function public.rpc_authorize_document(
  p_actor uuid, p_document uuid, p_action text, p_request_id text, p_audit_allowed boolean default true
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_access text;
  d public.documents%rowtype;
begin
  v_access := app.authorize(p_actor, p_document, p_action, p_request_id, p_audit_allowed);
  if v_access is null then
    return jsonb_build_object('ok', false, 'code', app.deny_code(p_actor, p_document));
  end if;
  select * into d from public.documents where id = p_document;
  return jsonb_build_object('ok', true, 'access', v_access, 'storage_key', d.storage_key,
    'original_filename', d.original_filename, 'mime_type', d.mime_type, 'sha256', d.sha256,
    'owner_id', d.owner_id);
end $$;

create function public.rpc_document_create(
  p_actor uuid, p_id uuid, p_title text, p_description text, p_filename text, p_storage_key text,
  p_category text, p_mime text, p_size bigint, p_sha256 text, p_request_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  select role into v_role from public.profiles where id = p_actor;
  if v_role is null or v_role not in ('owner', 'admin') then
    perform app.write_audit(p_actor, null, 'document.upload', 'denied', p_request_id,
      jsonb_build_object('reason', 'role_not_allowed'));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  insert into public.documents (id, owner_id, title, description, original_filename, storage_key,
                                category, mime_type, size_bytes, sha256)
  values (p_id, p_actor, p_title, p_description, p_filename, p_storage_key, p_category, p_mime, p_size, p_sha256);
  perform app.write_audit(p_actor, p_id, 'document.upload', 'success', p_request_id,
    jsonb_build_object('mime_type', p_mime, 'size_bytes', p_size, 'sha256', p_sha256));
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

create function public.rpc_document_update_metadata(
  p_actor uuid, p_document uuid, p_title text, p_description text, p_category text, p_request_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_fields text[] := '{}';
begin
  if app.authorize(p_actor, p_document, 'edit', p_request_id, false) is null then
    return jsonb_build_object('ok', false, 'code', app.deny_code(p_actor, p_document));
  end if;
  if p_title is not null then v_fields := v_fields || 'title'; end if;
  if p_description is not null then v_fields := v_fields || 'description'; end if;
  if p_category is not null then v_fields := v_fields || 'category'; end if;
  update public.documents
     set title = coalesce(p_title, title),
         description = coalesce(p_description, description),
         category = coalesce(p_category, category)
   where id = p_document and deleted_at is null;
  perform app.write_audit(p_actor, p_document, 'document.edit', 'success', p_request_id,
    jsonb_build_object('fields', to_jsonb(v_fields)));
  return jsonb_build_object('ok', true);
end $$;

create function public.rpc_document_replace(
  p_actor uuid, p_document uuid, p_new_key text, p_filename text, p_mime text,
  p_size bigint, p_sha256 text, p_request_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  if app.authorize(p_actor, p_document, 'replace', p_request_id, false) is null then
    return jsonb_build_object('ok', false, 'code', app.deny_code(p_actor, p_document));
  end if;
  select storage_key into v_old from public.documents where id = p_document for update;
  update public.documents
     set storage_key = p_new_key, original_filename = p_filename, mime_type = p_mime,
         size_bytes = p_size, sha256 = p_sha256
   where id = p_document;
  perform app.write_audit(p_actor, p_document, 'document.replace', 'success', p_request_id,
    jsonb_build_object('mime_type', p_mime, 'size_bytes', p_size, 'sha256', p_sha256));
  return jsonb_build_object('ok', true, 'old_storage_key', v_old);
end $$;

-- Deletion policy: owner-only SOFT delete. Row stays (for audit/evidence), all
-- active grants are revoked, the caller then purges the storage object.
create function public.rpc_document_delete(p_actor uuid, p_document uuid, p_request_id text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_key text; v_revoked int;
begin
  if app.authorize(p_actor, p_document, 'delete', p_request_id, false) is null then
    return jsonb_build_object('ok', false, 'code', app.deny_code(p_actor, p_document));
  end if;
  select storage_key into v_key from public.documents where id = p_document for update;
  update public.document_permissions
     set revoked_at = now(), revoked_by = p_actor
   where document_id = p_document and revoked_at is null;
  get diagnostics v_revoked = row_count;
  update public.documents set deleted_at = now() where id = p_document;
  perform app.write_audit(p_actor, p_document, 'document.delete', 'success', p_request_id,
    jsonb_build_object('grants_revoked', v_revoked));
  return jsonb_build_object('ok', true, 'storage_key', v_key);
end $$;

create function public.rpc_document_grant(
  p_actor uuid, p_document uuid, p_grantee_email text, p_permission text, p_request_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_grantee uuid;
  v_current text;
  v_perm_id uuid;
begin
  if p_permission not in ('read', 'edit') then
    return jsonb_build_object('ok', false, 'code', 'invalid_permission');
  end if;
  if app.authorize(p_actor, p_document, 'grant', p_request_id, false) is null then
    return jsonb_build_object('ok', false, 'code', app.deny_code(p_actor, p_document));
  end if;
  select id into v_grantee from public.profiles where lower(email) = lower(trim(p_grantee_email));
  if v_grantee is null then
    perform app.write_audit(p_actor, p_document, 'permission.grant', 'error', p_request_id,
      jsonb_build_object('reason', 'user_not_found'));
    return jsonb_build_object('ok', false, 'code', 'user_not_found');
  end if;
  if v_grantee = p_actor then
    return jsonb_build_object('ok', false, 'code', 'invalid_grantee');
  end if;
  select permission into v_current from public.document_permissions
   where document_id = p_document and user_id = v_grantee and revoked_at is null;
  if v_current = p_permission then
    return jsonb_build_object('ok', true, 'unchanged', true, 'user_id', v_grantee);
  end if;
  if v_current is not null then   -- change of level: close old grant, open new one
    update public.document_permissions set revoked_at = now(), revoked_by = p_actor
     where document_id = p_document and user_id = v_grantee and revoked_at is null;
  end if;
  insert into public.document_permissions (document_id, user_id, permission, granted_by)
  values (p_document, v_grantee, p_permission, p_actor) returning id into v_perm_id;
  perform app.write_audit(p_actor, p_document, 'permission.grant', 'success', p_request_id,
    jsonb_build_object('grantee_id', v_grantee, 'permission', p_permission, 'previous', v_current));
  return jsonb_build_object('ok', true, 'permission_id', v_perm_id, 'user_id', v_grantee);
end $$;

create function public.rpc_document_revoke(
  p_actor uuid, p_document uuid, p_user uuid, p_request_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  if app.authorize(p_actor, p_document, 'revoke', p_request_id, false) is null then
    return jsonb_build_object('ok', false, 'code', app.deny_code(p_actor, p_document));
  end if;
  update public.document_permissions set revoked_at = now(), revoked_by = p_actor
   where document_id = p_document and user_id = p_user and revoked_at is null;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'code', 'no_active_grant');
  end if;
  perform app.write_audit(p_actor, p_document, 'permission.revoke', 'success', p_request_id,
    jsonb_build_object('grantee_id', p_user));
  return jsonb_build_object('ok', true);
end $$;

-- Admin user management. Admins cannot change their own role (no self-promotion
-- and no accidental self-lockout).
create function public.rpc_admin_set_role(p_actor uuid, p_target uuid, p_role text, p_request_id text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor_role text; v_old text;
begin
  select role into v_actor_role from public.profiles where id = p_actor;
  if v_actor_role is distinct from 'admin' then
    perform app.write_audit(p_actor, null, 'admin.set_role', 'denied', p_request_id,
      jsonb_build_object('reason', 'not_admin', 'target', p_target));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_role not in ('admin', 'owner', 'viewer') then
    return jsonb_build_object('ok', false, 'code', 'invalid_role');
  end if;
  if p_target = p_actor then
    perform app.write_audit(p_actor, null, 'admin.set_role', 'denied', p_request_id,
      jsonb_build_object('reason', 'self_change', 'target', p_target));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select role into v_old from public.profiles where id = p_target for update;
  if v_old is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  update public.profiles set role = p_role where id = p_target;
  perform app.write_audit(p_actor, null, 'admin.set_role', 'success', p_request_id,
    jsonb_build_object('target', p_target, 'from', v_old, 'to', p_role));
  return jsonb_build_object('ok', true);
end $$;

-- Search. SECURITY INVOKER on purpose: RLS on documents/profiles decides what
-- the caller may discover, so results, counts and owner names cannot leak.
create function public.search_documents(
  p_query text default null, p_category text default null, p_owner text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_scope text default 'all', p_limit int default 20, p_offset int default 0
) returns table (
  id uuid, title text, description text, original_filename text, category text, mime_type text,
  size_bytes bigint, created_at timestamptz, updated_at timestamptz, owner_id uuid,
  owner_name text, my_access text, total_count bigint
)
language sql stable security invoker set search_path = '' as $$
  select d.id, d.title, d.description, d.original_filename, d.category, d.mime_type, d.size_bytes,
         d.created_at, d.updated_at, d.owner_id, coalesce(op.display_name, ''),
         app.user_access(d.id, (select auth.uid())), count(*) over ()
    from public.documents d
    left join public.profiles op on op.id = d.owner_id
   where d.deleted_at is null
     and case p_scope
           when 'all'    then true
           when 'owned'  then d.owner_id = (select auth.uid())
           when 'shared' then d.owner_id <> (select auth.uid())
           else false end
     and (nullif(trim(p_query), '') is null
          or d.title ilike '%' || app.escape_like(trim(p_query)) || '%' escape '\'
          or d.original_filename ilike '%' || app.escape_like(trim(p_query)) || '%' escape '\')
     and (p_category is null or d.category = p_category)
     and (nullif(trim(p_owner), '') is null
          or op.display_name ilike '%' || app.escape_like(trim(p_owner)) || '%' escape '\'
          or op.email ilike '%' || app.escape_like(trim(p_owner)) || '%' escape '\')
     and (p_from is null or d.created_at >= p_from)
     and (p_to is null or d.created_at < p_to)
   order by d.created_at desc, d.id
   limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;
