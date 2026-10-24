# Interview guide
**30-second pitch:** "Browser is untrusted. Clients can only *read* through RLS; every write and every file byte goes through an Edge Function that verifies the JWT, then calls a database function that checks permission, changes data and writes a hash-chained audit row in one transaction."

**Q: What is RLS and why not just check in React?** Postgres filters rows per user inside the DB, so even a hand-crafted API call sees only allowed rows. React checks are cosmetic.
**Q: How do you verify a JWT?** `auth.getUser(token)` asks the Auth server (signature, expiry, session). I never trust claims or body fields for identity or role.
**Q: Explain IDOR and your defence.** Changing an id to see someone else's record. Every access resolves the *authenticated* user's access level for that id in SQL; "missing" and "forbidden" both return 404 so existence doesn't leak.
**Q: Why is service role dangerous and how do you contain it?** It bypasses RLS. It lives only in function secrets; each privileged call is an RPC taking the verified user id and re-checking permission in SQL; RPC execute is granted to service_role only.
**Q: Why private Storage with no policies?** Storage policies can't see `document_permissions` reliably, so I made the bucket unreachable to clients and serve bytes through the download function after a per-request check.
**Q: How does revocation work?** Setting `revoked_at`; the next request's check finds no active grant. No signed URLs/caches. Limits: an in-flight stream or a saved copy can't be recalled.
**Q: How is the audit log protected?** No client write policies, append-only triggers, hash chain, same-transaction writes. Limit: a DB superuser could rewrite it, so export the head hash externally.
**Q: How do you validate uploads?** Magic bytes + declared MIME must agree, size cap, server-generated key, sanitized display name, `nosniff` attachment download. No antivirus.
**Q: What did you NOT verify?** Be candid: see README status table — SQL/function/integration tests were written but must be run locally.
Demo script: A uploads → B 404 → A shares read → B downloads → A revokes → B refused → admin shows trail + verifies chain → admin sees no documents.
