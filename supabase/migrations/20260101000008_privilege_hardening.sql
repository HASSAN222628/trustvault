-- TrustVault 0008: least privilege. Supabase grants broad default privileges on
-- public objects to anon/authenticated; take them away explicitly.

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated;

-- Read access (RLS still applies) ...
grant select on public.profiles, public.documents, public.document_permissions, public.audit_events
  to authenticated;
-- ... and the ONLY client-writable column in the whole schema:
grant update (display_name) on public.profiles to authenticated;

-- Search runs as the caller so RLS filters it.
grant execute on function public.search_documents(text, text, text, timestamptz, timestamptz, text, int, int)
  to authenticated;

-- Trusted operations: service_role only (called from Edge Functions).
grant execute on function
  public.rpc_authorize_document(uuid, uuid, text, text, boolean),
  public.rpc_document_create(uuid, uuid, text, text, text, text, text, text, bigint, text, text),
  public.rpc_document_update_metadata(uuid, uuid, text, text, text, text),
  public.rpc_document_replace(uuid, uuid, text, text, text, bigint, text, text),
  public.rpc_document_delete(uuid, uuid, text),
  public.rpc_document_grant(uuid, uuid, text, text, text),
  public.rpc_document_revoke(uuid, uuid, uuid, text),
  public.rpc_admin_set_role(uuid, uuid, text, text),
  public.rpc_audit_log(uuid, uuid, text, text, text, jsonb),
  public.rpc_audit_verify()
  to service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
-- service_role still cannot rewrite the audit log: the triggers in 0004 fire for it too.

-- Private `app` schema: functions created after migration 0002 got PostgreSQL's default
-- PUBLIC execute. Close that, then re-grant only what RLS policies / invoker functions need.
alter default privileges for role postgres in schema app revoke execute on functions from public, anon, authenticated;
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function app.user_access(uuid, uuid), app.is_admin(), app.owns_document(uuid),
  app.can_view_profile(uuid), app.escape_like(text), app.access_allows(text, text) to authenticated;
grant execute on all functions in schema app to service_role;

-- Audit log: even service_role gets SELECT only. Rows are created exclusively by
-- app.write_audit (SECURITY DEFINER, owner privileges), and the append-only
-- triggers from migration 0004 remain as a second layer.
revoke insert, update, delete, truncate on public.audit_events from service_role;
