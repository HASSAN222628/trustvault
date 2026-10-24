-- TrustVault 0006: profile provisioning. The role is NEVER read from user
-- metadata; every new account starts as 'owner'. Admins are promoted only by
-- an existing admin (rpc_admin_set_role) or by direct DB access (seed/bootstrap).

create function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 120),
    'owner');
  perform app.write_audit(new.id, null, 'account.create', 'success', 'trigger:signup',
    jsonb_build_object('role', 'owner'));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

create function app.sync_user_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function app.sync_user_email();
