# Threat model
| # | Threat | Control | Test |
|---|---|---|---|
| T1 | IDOR: guess/modify document id | RLS `user_access`; functions return identical 404 for "missing" and "no access" | access.test: guessed/foreign ids |
| T2 | Privilege escalation via profile update / signup metadata | no UPDATE grant on `role`; `profiles_guard` trigger; role never read from metadata; admin cannot change own role | pgTAP + access.test |
| T3 | Forged identity in request body | actor only from `getUser(jwt)`; body fields ignored | access.test forged actor |
| T4 | Forged/edited audit rows | no client INSERT/UPDATE/DELETE; append-only triggers (also bind service role); hash chain | pgTAP, audit test |
| T5 | Direct Storage access / key guessing / public URL | private bucket, restrictive policy, no signed URLs, server-generated keys | storage tests |
| T6 | Malicious upload (spoofed MIME, traversal name, polyglot/oversize) | magic-byte allow-list, declared==detected, 5 MB cap, safe key, sanitized display name, `nosniff` + attachment download | unit + upload tests |
| T7 | Stale access after revoke | per-request DB check | revocation test |
| T8 | Admin snooping | admin has no document/grant policy | pgTAP + access.test |
| T9 | Service-role key leak | never `VITE_*`; function secrets; secret scan before zip | grep scan |
| T10 | CORS abuse | exact-origin allow-list; browser-origin requests from others get 403 | cors unit test |
| T11 | Audit log growth by unauthenticated spam | **not mitigated** (add rate limiting) | — |
| T12 | DB superuser rewrites history | **not preventable in-DB**; export head hash externally | pgTAP shows detection of naive tampering only |
Out of scope: malware scanning, DDoS, insider with DB superuser, endpoint compromise, recalling downloaded copies.
