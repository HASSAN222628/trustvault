-- LOCAL DEVELOPMENT ONLY. Fictional users with a shared demo password
-- ("TrustVault-Demo-1!"). Never run against production. Documents are created by
-- `npm run seed:demo` through the real upload function (so objects + hashes are real).
do $$
declare
  u record;
begin
  for u in select * from (values
    ('00000000-0000-4000-8000-00000000000a'::uuid, 'owner.a@trustvault.test', 'Owner A (Asha)'),
    ('00000000-0000-4000-8000-00000000000b'::uuid, 'owner.b@trustvault.test', 'Owner B (Bilal)'),
    ('00000000-0000-4000-8000-00000000000c'::uuid, 'viewer.c@trustvault.test', 'Viewer C (Chen)'),
    ('00000000-0000-4000-8000-00000000000d'::uuid, 'editor.d@trustvault.test', 'Editor D (Dana)'),
    ('00000000-0000-4000-8000-00000000000e'::uuid, 'admin.e@trustvault.test', 'Admin E (Esha)')
  ) as t(id, email, name) loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('TrustVault-Demo-1!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', u.name),
      now(), now(), '', '', '', '')
    on conflict (id) do nothing;
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now())
    on conflict do nothing;
  end loop;
  update public.profiles set role = 'viewer' where email = 'viewer.c@trustvault.test';
  update public.profiles set role = 'admin'  where email = 'admin.e@trustvault.test';
end $$;
