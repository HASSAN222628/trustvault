# Security test matrix (status: written, **not executed** unless marked)
| Area | Test | File |
|---|---|---|
| Auth | missing/garbage/anon-key token ⇒ 401; forged actor ignored; self-promotion blocked (profile update + signup metadata) | tests/security/access.test.ts |
| IDOR | foreign read/download/edit/delete/grant/revoke ⇒ 404; guessed + malformed ids; search & grants invisible; trusted RPCs not callable | access.test.ts, pgTAP |
| Permissions | read ≠ edit; edit ≠ delete/share; viewer cannot grant; revoked ⇒ next download 404 with no bytes; owner delete | access.test.ts, pgTAP |
| Admin | no document access; audit query allowed; non-admin refused; no self role change | access.test.ts, pgTAP |
| Storage | outsider AND owner direct read/list/overwrite/delete/signed-URL/public URL denied; object intact | audit-storage-upload.test.ts |
| Audit | upload/download/denial rows with trusted actor; client insert/update/delete denied; service role update denied; chain verifies; tamper detected; no secrets | audit-storage-upload.test.ts, pgTAP |
| Uploads | forged MIME, wrong signature, oversize (413), exe, traversal filename, viewer-role upload | audit-storage-upload.test.ts, tests/unit/files.test.ts (**executed**) |
| CORS | allow-list logic | tests/unit/cors.test.ts (**executed**) |
| UI | utils, dialog, access-denied | src/**/*.test.tsx (not executed) |
| E2E | redirect, admin sees no docs, non-admin denied, foreign id not-found | tests/e2e/security.spec.ts (not executed) |
Not covered: expired-token test, audit-failure injection test (fail-closed is by construction: RPC error ⇒ 503, no bytes), concurrency race of revoke vs in-flight download.
