-- TrustVault 0001: private schema + core tables.
-- `app` holds internal helpers and is NOT exposed through PostgREST.

create schema if not exists app;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null default '',
  role         text not null default 'owner' check (role in ('admin', 'owner', 'viewer')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_email_len check (char_length(email) between 3 and 320),
  constraint profiles_name_len check (char_length(display_name) <= 120)
);
create unique index profiles_email_lower_key on public.profiles (lower(email));
comment on column public.profiles.role is
  'Trusted global role. Only changeable via rpc_admin_set_role (service role) or direct DB access.';

-- --------------------------------------------------------------- documents
create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles (id) on delete restrict,
  title             text not null check (char_length(title) between 1 and 200),
  description       text not null default '' check (char_length(description) <= 2000),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  storage_key       text not null unique,
  category          text not null default 'general'
                    check (category in ('contract', 'salary', 'technical', 'audit', 'customer', 'general')),
  mime_type         text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes        bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  sha256            text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index documents_owner_idx    on public.documents (owner_id) where deleted_at is null;
create index documents_created_idx  on public.documents (created_at desc) where deleted_at is null;
create index documents_category_idx on public.documents (category) where deleted_at is null;

-- ---------------------------------------------------- document_permissions
create table public.document_permissions (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  permission  text not null check (permission in ('read', 'edit')),
  granted_by  uuid not null references public.profiles (id),
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  revoked_by  uuid references public.profiles (id),
  constraint permissions_revoke_order check (revoked_at is null or revoked_at >= granted_at)
);
-- At most ONE active grant per (document, user). Revoked rows are kept as history.
create unique index document_permissions_one_active
  on public.document_permissions (document_id, user_id) where revoked_at is null;
create index document_permissions_user_idx on public.document_permissions (user_id) where revoked_at is null;
create index document_permissions_doc_idx  on public.document_permissions (document_id);

-- ------------------------------------------------------------ audit_events
-- No foreign keys on purpose: audit rows must survive deletion of users/documents.
create table public.audit_events (
  seq         bigint generated always as identity primary key,
  id          uuid not null unique default gen_random_uuid(),
  actor_id    uuid,
  document_id uuid,
  action      text not null check (action ~ '^[a-z_]+(\.[a-z_]+)*$'),
  outcome     text not null check (outcome in ('success', 'denied', 'error')),
  occurred_at timestamptz not null default clock_timestamp(),
  request_id  text not null check (char_length(request_id) <= 100),
  details     jsonb not null default '{}'::jsonb,
  prev_hash   text not null,
  event_hash  text not null
);
create index audit_events_time_idx   on public.audit_events (occurred_at desc);
create index audit_events_doc_idx    on public.audit_events (document_id, seq desc);
create index audit_events_actor_idx  on public.audit_events (actor_id, seq desc);
create index audit_events_action_idx on public.audit_events (action);

-- --------------------------------------------------------- updated_at touch
create function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch  before update on public.profiles  for each row execute function app.touch_updated_at();
create trigger documents_touch before update on public.documents for each row execute function app.touch_updated_at();

-- ------------------------------------------------ profile field protection
-- Defence in depth on top of column-level GRANTs: even if a future GRANT is
-- too broad, API callers (anon/authenticated) can never change identity fields.
create function app.profiles_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.role is distinct from old.role
       or new.created_at is distinct from old.created_at then
      raise exception 'profile identity and role fields are read-only for API callers'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function app.profiles_guard();
