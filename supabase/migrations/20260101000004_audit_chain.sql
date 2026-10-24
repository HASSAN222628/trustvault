-- TrustVault 0004: append-only audit log with a SHA-256 hash chain.
-- What this gives you: ordinary users cannot forge/alter/delete events, and
-- accidental or naive edits are detectable. What it does NOT give you: protection
-- against a database superuser who disables triggers and recomputes the chain.
-- Mitigation: periodically copy rpc_audit_verify().head_hash somewhere independent.

create function app.audit_block_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_events is append-only' using errcode = '42501';
end $$;

create trigger audit_no_update_delete before update or delete on public.audit_events
  for each row execute function app.audit_block_mutation();
create trigger audit_no_truncate before truncate on public.audit_events
  for each statement execute function app.audit_block_mutation();

-- Remove obviously sensitive keys and cap size. Top-level keys only.
create function app.sanitize_details(p_details jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_key text;
  v_out jsonb := '{}'::jsonb;
begin
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    return '{}'::jsonb;
  end if;
  for v_key in select jsonb_object_keys(p_details) loop
    if v_key ~* '(pass|token|secret|authorization|cookie|api[_-]?key|jwt|content|bytes)' then
      v_out := v_out || jsonb_build_object(v_key, '[redacted]');
    else
      v_out := v_out || jsonb_build_object(v_key, p_details -> v_key);
    end if;
  end loop;
  if length(v_out::text) > 4000 then
    return jsonb_build_object('truncated', true);
  end if;
  return v_out;
end $$;

create function app.audit_payload(
  p_prev text, p_id uuid, p_actor uuid, p_doc uuid, p_action text, p_outcome text,
  p_at timestamptz, p_request text, p_details jsonb
) returns text language sql immutable set search_path = '' as $$
  select concat_ws('|', p_prev, p_id::text, coalesce(p_actor::text, ''), coalesce(p_doc::text, ''),
    p_action, p_outcome, to_char(p_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    p_request, p_details::text);
$$;

-- The ONLY way audit rows are created. Serialised so the chain has no forks.
create function app.write_audit(
  p_actor uuid, p_document uuid, p_action text, p_outcome text,
  p_request_id text, p_details jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_prev    text;
  v_id      uuid := gen_random_uuid();
  v_at      timestamptz := clock_timestamp();
  v_details jsonb := app.sanitize_details(p_details);
  v_hash    text;
begin
  perform pg_advisory_xact_lock(726600101);
  select a.event_hash into v_prev from public.audit_events a order by a.seq desc limit 1;
  v_prev := coalesce(v_prev, repeat('0', 64));
  v_hash := encode(extensions.digest(
    app.audit_payload(v_prev, v_id, p_actor, p_document, p_action, p_outcome, v_at, p_request_id, v_details),
    'sha256'), 'hex');
  insert into public.audit_events
    (id, actor_id, document_id, action, outcome, occurred_at, request_id, details, prev_hash, event_hash)
  values (v_id, p_actor, p_document, p_action, p_outcome, v_at, p_request_id, v_details, v_prev, v_hash);
  return v_id;
end $$;

-- Re-computes the whole chain. Returns first broken sequence number, if any.
create function public.rpc_audit_verify()
returns table (ok boolean, checked bigint, first_bad_seq bigint, head_seq bigint, head_hash text)
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_prev text := repeat('0', 64);
  v_expected text;
  v_count bigint := 0;
  v_bad bigint := null;
  v_head_seq bigint := null;
  v_head_hash text := null;
begin
  for r in select * from public.audit_events order by seq loop
    v_count := v_count + 1;
    v_expected := encode(extensions.digest(
      app.audit_payload(v_prev, r.id, r.actor_id, r.document_id, r.action, r.outcome,
                        r.occurred_at, r.request_id, r.details), 'sha256'), 'hex');
    if v_bad is null and (r.prev_hash <> v_prev or r.event_hash <> v_expected) then
      v_bad := r.seq;
    end if;
    v_prev := r.event_hash;
    v_head_seq := r.seq;
    v_head_hash := r.event_hash;
  end loop;
  return query select (v_bad is null), v_count, v_bad, v_head_seq, v_head_hash;
end $$;

-- Generic trusted logger for Edge Functions (denials, errors, follow-ups).
create function public.rpc_audit_log(
  p_actor uuid, p_document uuid, p_action text, p_outcome text,
  p_request_id text, p_details jsonb default '{}'::jsonb
) returns uuid
language sql security definer set search_path = '' as $$
  select app.write_audit(p_actor, p_document, p_action, p_outcome, p_request_id, p_details);
$$;
