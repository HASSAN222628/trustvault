-- Search only the minimum profile data needed to choose a document recipient.
create function public.rpc_search_share_recipients(p_query text)
returns table (id uuid, email text, display_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.email, p.display_name
    from public.profiles p
   where (select auth.uid()) is not null
     and p.id <> (select auth.uid())
     and length(trim(coalesce(p_query, ''))) between 2 and 120
     and (
       lower(p.email) like '%' || app.escape_like(lower(trim(p_query))) || '%' escape '\'
       or lower(p.display_name) like '%' || app.escape_like(lower(trim(p_query))) || '%' escape '\'
     )
   order by lower(p.display_name), lower(p.email)
   limit 10;
$$;

revoke all on function public.rpc_search_share_recipients(text) from public, anon;
grant execute on function public.rpc_search_share_recipients(text) to authenticated;

create or replace function app.access_allows(p_access text, p_action text) returns boolean
language sql immutable set search_path = '' as $$
  select case p_action
    when 'read'     then p_access in ('owner', 'edit', 'read')
    when 'download' then p_access in ('owner', 'edit')
    when 'edit'     then p_access in ('owner', 'edit')
    when 'replace'  then p_access in ('owner', 'edit')
    when 'delete'   then p_access = 'owner'
    when 'grant'    then p_access = 'owner'
    when 'revoke'   then p_access = 'owner'
    else false
  end;
$$;
