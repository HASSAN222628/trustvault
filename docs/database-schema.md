# Schema (migrations in `supabase/migrations`, applied in order)
1 tables · 2 helpers (`user_access`, `access_allows`, `is_admin`, …) · 3 RLS (+FORCE) · 4 audit chain · 5 trusted RPCs + `search_documents` · 6 signup trigger · 7 private bucket · 8 grant hardening.
* `profiles(id→auth.users, email, display_name, role admin|owner|viewer)`; unique lower(email).
* `documents(id, owner_id, title, description, original_filename, storage_key unique, category, mime_type, size_bytes, sha256, deleted_at)`.
* `document_permissions(document_id, user_id, permission read|edit, granted_by, granted_at, revoked_at, revoked_by)`; partial unique index = one active grant per pair; history kept.
* `audit_events(seq, id, actor_id, document_id, action, outcome, occurred_at, request_id, details, prev_hash, event_hash)`; no FKs so history survives deletions. (`occurred_at` = the "timestamp" field.)
Policies: SELECT only for `authenticated`; `profiles` additionally UPDATE own row, column-limited to `display_name`.
