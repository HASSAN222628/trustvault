# Architecture
```
Browser (React, anon key) ──RLS reads──────────────► Postgres (profiles, documents, permissions, audit: SELECT only)
        │  JWT
        └─POST /functions/v1/*──► Edge Function ──getUser(jwt)──► Supabase Auth
                                      │ service role (after identity verified)
                                      ├─► rpc_* (authorise + mutate + audit, 1 transaction)
                                      └─► Storage bucket "documents" (private, no client policies)
```
**Trust boundaries:** browser | Edge Function (verified identity, schema validation) | database (final authority: RLS, grants, triggers) | Storage (unreachable by clients).

**Why functions use `verify_jwt=false`:** the gateway check would not catch revoked sessions and complicates CORS preflight/new signing keys; every function calls `auth.getUser()` (validated by Auth server) first, and a test asserts 401 for missing/garbage/anon-key tokens.

**Why service role:** Storage has no per-document policy surface, and audit/permission writes must not be client-reachable. Every privileged call is an RPC taking `p_actor` from the *verified* identity and re-checking permission inside the DB; RPC EXECUTE is granted to `service_role` only (`has_function_privilege` test).

**Privileged operations:** upload/replace/delete objects, `rpc_*`, audit verification. Nothing else.

**Revocation point:** `rpc_authorize_document` reads `document_permissions` (`revoked_at IS NULL`) inside the request's transaction. A request that committed its decision before the revoke commits may still stream; every request after does not. No caching, no signed URLs.

**Deletion policy:** owner-only soft delete; grants revoked, storage object purged, row kept for evidence. No recovery feature.
**Edit policy:** edit grant = edit title/description/category and replace file. Not delete, share, or revoke.
**Roles:** `admin` (audit + user admin), `owner` (upload; default for signups), `viewer` (cannot upload; can receive grants). Document-level `read|edit` is separate.
