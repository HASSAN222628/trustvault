alter table public.profiles
  add column is_active boolean not null default true;

drop policy profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and app.can_view_profile(id))
  with check (id = (select auth.uid()) and app.can_view_profile(id));

create or replace function app.user_access(p_document uuid, p_user uuid) returns text
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
  join public.profiles p on p.id = p_user and p.is_active
  where d.id = p_document and d.deleted_at is null;
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active);
$$;

create or replace function app.can_view_profile(p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles me
     where me.id = (select auth.uid()) and me.is_active)
    and (
      (select auth.uid()) = p_target
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
              and pm.user_id = p_target));
$$;

create or replace function public.rpc_search_share_recipients(p_query text)
returns table (id uuid, email text, display_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.email, p.display_name
    from public.profiles p
   where (select auth.uid()) is not null
     and exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.is_active)
     and p.is_active
     and p.id <> (select auth.uid())
     and length(trim(coalesce(p_query, ''))) between 2 and 120
     and (
       lower(p.email) like '%' || app.escape_like(lower(trim(p_query))) || '%' escape '\'
       or lower(p.display_name) like '%' || app.escape_like(lower(trim(p_query))) || '%' escape '\'
     )
   order by lower(p.display_name), lower(p.email)
   limit 10;
$$;

create function public.rpc_admin_set_user_active(
  p_actor uuid, p_target uuid, p_is_active boolean, p_request_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor_role text;
  v_old boolean;
begin
  select role into v_actor_role from public.profiles
   where id = p_actor and is_active for update;
  if v_actor_role is distinct from 'admin' or p_target = p_actor then
    perform app.write_audit(p_actor, null, 'admin.user_status', 'denied', p_request_id,
      jsonb_build_object('target', p_target));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select is_active into v_old from public.profiles where id = p_target for update;
  if v_old is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  update public.profiles set is_active = p_is_active where id = p_target;
  perform app.write_audit(p_actor, null,
    case when p_is_active then 'admin.user_unban' else 'admin.user_ban' end,
    'success', p_request_id,
    jsonb_build_object('target', p_target, 'was_active', v_old, 'is_active', p_is_active));
  return jsonb_build_object('ok', true);
end $$;

create function public.rpc_admin_audit_user_delete(
  p_actor uuid, p_target uuid, p_request_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.profiles where id = p_actor and role = 'admin' and is_active)
    or p_target = p_actor then
    perform app.write_audit(p_actor, null, 'admin.user_delete', 'denied', p_request_id,
      jsonb_build_object('target', p_target));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if exists (select 1 from public.documents where owner_id = p_target) then
    return jsonb_build_object('ok', false, 'code', 'owned_documents');
  end if;
  perform app.write_audit(p_actor, null, 'admin.user_delete', 'success', p_request_id,
    jsonb_build_object('target', p_target));
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.rpc_admin_set_user_active(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.rpc_admin_audit_user_delete(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.rpc_admin_set_user_active(uuid, uuid, boolean, text),
  public.rpc_admin_audit_user_delete(uuid, uuid, text) to service_role;
