# Audit design
* Written only by `app.write_audit` (SECURITY DEFINER, called from service-role RPCs). Clients: SELECT via RLS only.
* Append-only: row triggers block UPDATE/DELETE, statement trigger blocks TRUNCATE — fires for service_role too.
* Chain: `event_hash = SHA256(prev_hash | id | actor | doc | action | outcome | time | request_id | details)`; writes serialised by an advisory lock. `rpc_audit_verify()` recomputes everything and returns the first broken `seq` plus `head_hash`.
* Mandatory events (decisions, grants, uploads, deletes, role changes) are in the same transaction as the change: no audit row ⇒ no change, no file. Best-effort events: auth failures, cleanup failures, integrity failures.
* Details are sanitised (keys matching password/token/secret/key/content are redacted; 4 KB cap). No file bytes ever.
* **Proves:** casual or accidental edits, deletions or reordering are detectable; ordinary users cannot forge events.
* **Does not prove:** a DB superuser can disable triggers and recompute the chain. Store `head_hash` (and seq) externally on a schedule (WORM bucket, email, separate system) to detect that.
* Metadata reads through RLS are not audited; content reads (download) are. Event time uses `clock_timestamp()`.
